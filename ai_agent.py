import requests
import json
import os
import pandas as pd
import time
import logging
from datetime import datetime, timedelta
from dotenv import load_dotenv
from pybit.unified_trading import HTTP
from pybit.exceptions import InvalidRequestError
from market_data import get_market_data_manual_ta
from decimal import Decimal
from zoneinfo import ZoneInfo
import subprocess
import re

# 전역 로거 객체 생성 (심볼은 main 함수에서 설정)
logger = None

# .env 파일 로드 및 API 키 설정
load_dotenv()
LM_STUDIO_ENDPOINT = "http://localhost:1234/v1/chat/completions"
LM_STUDIO_MODEL_NAME = os.getenv('LM_STUDIO_MODEL_NAME')
BYBIT_API_KEY = os.getenv('BYBIT_API_KEY')
BYBIT_API_SECRET = os.getenv('BYBIT_API_SECRET')

def setup_logger(symbol: str):
    """
    로그 설정을 초기화하고 로거 객체를 반환합니다.
    심볼에 따라 로그 파일 이름을 동적으로 설정합니다.
    """
    logger = logging.getLogger(f"TradingBot_{symbol}")
    logger.setLevel(logging.INFO)

    if logger.hasHandlers():
        logger.handlers.clear()

    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s', datefmt='%Y-%m-%d %H:%M:%S')

    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    # 로그 파일 이름 변경: .log 대신 .txt 사용
    file_handler = logging.FileHandler(f"{symbol.lower()}_trading_bot.txt", encoding='utf-8')
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    return logger

def get_current_position(session: HTTP, symbol="BTCUSDT"):
    """
    현재 열려있는 포지션 정보를 가져옵니다.
    :return: (포지션 사이드, 포지션 크기) 튜플 또는 (None, None)
    """
    global logger # 전역 logger 사용 선언
    try:
        response = session.get_positions(category="linear", symbol=symbol)
        if response and response.get('retCode') == 0:
            positions = response['result']['list']
            for pos in positions:
                size = Decimal(pos.get('size', '0'))
                if size > 0:
                    side = 'LONG' if pos.get('side') == 'Buy' else 'SHORT'
                    return side, size
    except Exception as e:
        logger.error(f"포지션 정보 조회 중 오류 발생: {e}", exc_info=True)
    return None, None


def get_ai_decision(market_df: pd.DataFrame, current_pos_side: str, symbol: str) -> dict:
    """
    LM Studio AI 에이전트에게 시장 데이터와 현재 포지션 정보를 기반으로 매매 결정을 요청합니다.
    """
    headers = {"Content-Type": "application/json"}
    system_prompt = """
You are an expert cryptocurrency trading analyst. Your task is to analyze market data and the current position to respond ONLY with a JSON object.
Do not add any text, conversation, or explanation outside of the JSON object.

Your "decision" MUST be one of the following 6 options:
1.  `NEW_LONG`: To open a new LONG position when there is currently NO position.
2.  `NEW_SHORT`: To open a new SHORT position when there is currently NO position.
3.  `ADD_TO_LONG`: To add to an existing LONG position (pyramiding).
4.  `ADD_TO_SHORT`: To add to an existing SHORT position (pyramiding).
5.  `HOLD`: To maintain the current position or do nothing if there is no position.
6.  `CLOSE`: To close the current position entirely and take profit or cut loss.

**JSON Response Rules:**

-   For **`NEW_LONG`** or **`NEW_SHORT`**: You MUST provide `reason`, `leverage`, `trade_size_percentage`, `take_profit_price`, and `stop_loss_price`.
-   For **`ADD_TO_LONG`** or **`ADD_TO_SHORT`**: You MUST provide `reason`, `trade_size_percentage` (for the additional size), `take_profit_price` (for the whole position), and `stop_loss_price` (for the whole position).
-   For **`HOLD`** or **`CLOSE`**: You only need to provide `reason`.

**Important Considerations:**
-   `trade_size_percentage` is the percentage of the *available balance* to use as MARGIN for the new order.
-   `take_profit_price` and `stop_loss_price` should be sensible prices based on your analysis (e.g., key support/resistance levels).

**Example 1: Opening a new LONG position.**
(Current Position: None)
{
  "decision": "NEW_LONG",
  "reason": "Price broke a key resistance level with high volume, and RSI confirms bullish momentum. Good entry point.",
  "leverage": 10,
  "trade_size_percentage": 25,
  "take_profit_price": 72500.5,
  "stop_loss_price": 69500.0
}

**Example 2: Adding to an existing LONG position.**
(Current Position: LONG)
{
  "decision": "ADD_TO_LONG",
  "reason": "The uptrend is confirmed with a successful retest of the previous resistance, which is now support. Adding to the position to maximize gains.",
  "trade_size_percentage": 15,
  "take_profit_price": 75000.0,
  "stop_loss_price": 71000.0
}

**Example 3: Holding a position.**
(Current Position: LONG)
{
  "decision": "HOLD",
  "reason": "The trend is still bullish, but the price is approaching a major resistance. It's better to wait and see before adding more."
}

**Example 4: Closing a position.**
(Current Position: LONG)
{
  "decision": "CLOSE",
  "reason": "The price is showing bearish divergence on the RSI and has formed a double top pattern, indicating a likely reversal."
}

Now, analyze the following user-provided data and provide your response.
"""
    # AI에게 최신 5개 캔들 데이터와 현재 포지션 상태를 전달
    recent_data = market_df.tail(5)
    data_prompt = ""
    for i, row in recent_data.iterrows():
        data_prompt += (
            f"Candle {i - len(recent_data) + 1}:\n"
            f"- Time: {row['timestamp'].strftime('%Y-%m-%d %H:%M')}\n"
            f"- Open: {row['open']}\n"
            f"- High: {row['high']}\n"
            f"- Low: {row['low']}\n"
            f"- Close: {row['close']}\n"
            f"- Volume: {row['volume']}\n"
            f"- SMA(20): {row['SMA_20']:.2f}\n"
            f"- RSI(14): {row['RSI_14']:.2f}\n\n"
        )
    
    position_prompt = f"My current position is: {current_pos_side if current_pos_side else 'None'}"

    user_prompt = f"""
Here is the latest 15-minute candle data for {symbol}:
{data_prompt}
{position_prompt}
"""
    messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]
    payload = {"messages": messages, "temperature": 0.5, "max_tokens": 300} # max_tokens 증가
    if LM_STUDIO_MODEL_NAME:
        payload['model'] = LM_STUDIO_MODEL_NAME
    try:
        response = requests.post(LM_STUDIO_ENDPOINT, headers=headers, json=payload, timeout=60)
        response.raise_for_status()
        ai_response_content = response.json()['choices'][0]['message']['content']
        
        if not ai_response_content or not ai_response_content.strip():
            logger.error("AI 모델이 비어 있는 응답을 반환했습니다. 모델이 로드되었는지, 정상 작동하는지 확인하세요.")
            return None
        
        logger.info(f"AI 모델 원본 응답: {ai_response_content}")
        # JSON 객체만 추출하기 위한 추가 처리
        try:
            # 모델이 JSON 마크다운(` ```json ... ``` `)으로 감싸서 보내는 경우 처리
            if '```json' in ai_response_content:
                json_part = ai_response_content.split('```json')[1].split('```')[0].strip()
            # 일반 텍스트에서 JSON 부분만 찾기
            else:
                 json_part = ai_response_content[ai_response_content.find('{'):ai_response_content.rfind('}')+1]
            return json.loads(json_part)
        except (json.JSONDecodeError, IndexError) as e:
            logger.error(f"AI 응답에서 JSON 객체를 파싱하는 데 실패했습니다: {e}")
            logger.error(f"원본 응답 내용: {ai_response_content}")
            return None
        
    except Exception as e:
        logger.error(f"AI 결정 요청 중 오류 발생: {e}", exc_info=True)
        return None

def _place_order_common(session: HTTP, decision_data: dict, latest_data: pd.Series, is_adding: bool, symbol: str):
    """
    신규 주문 또는 추가 주문을 위한 공통 로직을 처리합니다.
    """
    ai_decision = decision_data.get('decision')
    side = "Buy" if "LONG" in ai_decision else "Sell"
    
    # 레버리지 및 증거금 사용률 가져오기 (안전한 기본값 포함)
    try:
        leverage = int(decision_data.get('leverage', 1)) if not is_adding else 0
        if not is_adding and not 1 <= leverage <= 10:
            logger.warning(f"AI 제안 레버리지({leverage})가 허용 범위(1-10)를 벗어나 1로 조정합니다.")
            leverage = 1
    except (ValueError, TypeError):
        leverage = 1
        logger.warning("잘못된 레버리지 값으로 인해 1로 설정합니다.")
        
    try:
        trade_size_percentage = float(decision_data.get('trade_size_percentage', 10))
        if not 1 <= trade_size_percentage <= 95:
            logger.warning(f"AI 제안 거래 규모({trade_size_percentage}%)가 허용 범위(1-95%)를 벗어나 10%로 조정합니다.")
            trade_size_percentage = 10
    except (ValueError, TypeError):
        trade_size_percentage = 10
        logger.warning("잘못된 거래 규모 값으로 인해 10%로 설정합니다.")

    # TP/SL 가격 가져오기 (필수)
    try:
        tp_price = float(decision_data['take_profit_price'])
        sl_price = float(decision_data['stop_loss_price'])
    except (KeyError, ValueError, TypeError) as e:
        logger.error(f"AI가 유효한 take_profit_price 또는 stop_loss_price를 제공하지 않았습니다. 주문을 실행하지 않습니다. 오류: {e}")
        return

    try:
        # 레버리지 설정 (신규 포지션일 때만)
        if not is_adding:
            leverage_str = str(leverage)
            logger.info(f"AI 결정에 따라 레버리지를 {leverage_str}배로 설정합니다...")
            try:
                session.set_leverage(category="linear", symbol=symbol, buyLeverage=leverage_str, sellLeverage=leverage_str)
                logger.info("레버리지 설정 완료.")
            except InvalidRequestError as e:
                if "110043" in str(e):
                    logger.warning(f"레버리지가 이미 {leverage_str}배이거나 현재 변경할 수 없습니다. 계속 진행합니다.")
                else:
                    raise e
        
        # 잔고 확인 및 주문 수량 계산
        balance_info = session.get_wallet_balance(accountType="UNIFIED", coin="USDT")['result']['list'][0]['coin'][0]
        wallet_balance = Decimal(balance_info.get('walletBalance', '0') or '0')
        available_balance = Decimal(balance_info.get('availableBalance', '0') or '0')
        
        balance_for_trading = available_balance
        if balance_for_trading <= 1 and wallet_balance > 1:
            logger.warning("데모 환경 우회: '거래 가능 잔고'가 0이므로 '총 보유량'으로 주문 수량을 계산합니다.")
            balance_for_trading = wallet_balance
        
        if balance_for_trading <= 1:
            logger.error("주문 실행 불가: 거래 가능한 잔고가 너무 적습니다.")
            return

        margin_to_use = balance_for_trading * (Decimal(trade_size_percentage) / Decimal('100'))
        # 신규 진입 시에만 레버리지를 곱하여 총 포지션 가치 계산
        notional_value = margin_to_use * Decimal(leverage) if not is_adding else margin_to_use
        
        current_price = Decimal(str(latest_data['close']))
        
        # TP/SL 가격 유효성 검사
        if side == "Buy": # 롱 포지션
            if sl_price >= float(current_price):
                logger.error(f"주문 오류(롱): 손절가({sl_price})는 현재가({current_price})보다 낮아야 합니다. 주문을 취소합니다.")
                return
            if tp_price <= float(current_price):
                logger.error(f"주문 오류(롱): 익절가({tp_price})는 현재가({current_price})보다 높아야 합니다. 주문을 취소합니다.")
                return
        elif side == "Sell": # 숏 포지션
            if sl_price <= float(current_price):
                logger.error(f"주문 오류(숏): 손절가({sl_price})는 현재가({current_price})보다 높아야 합니다. 주문을 취소합니다.")
                return
            if tp_price >= float(current_price):
                logger.error(f"주문 오류(숏): 익절가({tp_price})는 현재가({current_price})보다 낮아야 합니다. 주문을 취소합니다.")
                return
        
        preliminary_qty = notional_value / current_price
        
        instrument_info = session.get_instruments_info(category="linear", symbol=symbol)['result']['list'][0]
        qty_step = Decimal(instrument_info['lotSizeFilter']['qtyStep'])
        adjusted_qty = round(preliminary_qty / qty_step) * qty_step
        final_qty_str = f"{adjusted_qty:.{abs(qty_step.as_tuple().exponent)}f}"

        if adjusted_qty <= 0:
            logger.error("주문 실행 불가: 계산된 수량이 0 또는 그 이하입니다.")
            return

        order_type_msg = "신규" if not is_adding else "추가"
        logger.info(f"AI 추천: 증거금 사용률 {trade_size_percentage}% / TP: {tp_price} / SL: {sl_price}")
        logger.info(f"{order_type_msg} 주문: {ai_decision} {final_qty_str} {symbol[:-4]} (사용 증거금: 약 {margin_to_use:.2f} USDT)")

        # 주문 실행
        order = session.place_order(
            category="linear",
            symbol=symbol,
            side=side,
            orderType="Market",
            qty=final_qty_str,
            takeProfit=str(tp_price),
            stopLoss=str(sl_price)
        )

        if order and order.get('retCode') == 0:
            logger.info(f"✅ {order_type_msg} 주문 성공! Order ID: {order['result']['orderId']}")
        else:
            logger.error(f"❌ {order_type_msg} 주문 실패. 원인: {order.get('retMsg', 'Unknown error')}")

    except Exception as e:
        logger.error(f"주문 실행 중 예외 발생: {e}", exc_info=True)

def close_all_positions(session: HTTP, symbol: str) -> bool:
    """
    특정 심볼에 대한 모든 포지션을 즉시 종료합니다.
    """
    global logger
    try:
        # 현재 포지션 정보 가져오기
        pos_side, pos_size = get_current_position(session, symbol)
        
        if not pos_side or pos_size == 0:
            logger.info(f"{symbol}에 대한 활성화된 포지션이 없어 종료 절차를 건너뜁니다.")
            return True

        # 반대 사이드 설정
        close_side = "Sell" if pos_side == 'LONG' else "Buy"
        
        # 포지션 전체를 종료하는 주문 실행
        logger.info(f"포지션 종료 주문 실행: {close_side} {pos_size} {symbol}")
        order = session.place_order(
            category="linear",
            symbol=symbol,
            side=close_side,
            orderType="Market",
            qty=str(pos_size),
            reduceOnly=True  # 포지션을 감소시키는 주문으로 설정
        )

        if order and order.get('retCode') == 0:
            logger.info(f"✅ 포지션 종료 주문 성공! Order ID: {order['result']['orderId']}")
            # 포지션이 완전히 종료될 때까지 잠시 대기
            time.sleep(5) # 5초 대기 후 포지션 재확인
            final_pos_side, final_pos_size = get_current_position(session, symbol)
            if final_pos_size == 0:
                logger.info("포지션이 성공적으로 종료되었습니다.")
                return True
            else:
                logger.warning(f"포지션 종료 후에도 잔여 포지션이 남아있습니다: {final_pos_side} {final_pos_size}")
                return False
        else:
            logger.error(f"❌ 포지션 종료 주문 실패. 원인: {order.get('retMsg', 'Unknown error')}")
            return False

    except Exception as e:
        logger.error(f"포지션 종료 중 예외 발생: {e}", exc_info=True)
        return False

def execute_futures_trade(session: HTTP, decision_data: dict, market_df: pd.DataFrame, current_pos_side: str, current_pos_size: Decimal, symbol: str):
    """
    AI 결정과 현재 포지션에 따라 지능적으로 매매를 실행합니다.
    """
    ai_decision = decision_data.get('decision')
    latest_data = market_df.iloc[-1]

    if ai_decision == 'HOLD':
        if current_pos_side:
            logger.info(f"AI 결정: HOLD. 현재 {current_pos_side} 포지션을 계속 유지합니다.")
        else:
            logger.info("AI 결정: HOLD. 포지션 없이 관망합니다.")
        return

    if ai_decision == 'CLOSE':
        if current_pos_side:
            logger.info(f"AI 결정: CLOSE. 현재 {current_pos_side} 포지션을 청산합니다.")
            close_all_positions(session, symbol=symbol)
        else:
            logger.info("AI 결정: CLOSE. 청산할 포지션이 없습니다.")
        return

    # 신규 진입 (LONG 또는 SHORT)
    if ai_decision in ['NEW_LONG', 'NEW_SHORT']:
        if current_pos_side:
            logger.warning(f"AI가 신규 진입({ai_decision})을 원하지만, 이미 {current_pos_side} 포지션이 있습니다. 포지션을 먼저 전환/종료해야 합니다.")
            # 필요시 포지션 전환 로직 추가 (예: close_all_positions 후 신규 진입)
        else:
            logger.info(f"AI 결정: {ai_decision}. 신규 포지션에 진입합니다.")
            _place_order_common(session, decision_data, latest_data, is_adding=False, symbol=symbol)
        return

    # 추가 진입 (ADD_TO_LONG 또는 ADD_TO_SHORT)
    if ai_decision in ['ADD_TO_LONG', 'ADD_TO_SHORT']:
        expected_side = 'LONG' if ai_decision == 'ADD_TO_LONG' else 'SHORT'
        if not current_pos_side:
            logger.warning(f"AI가 추가 진입({ai_decision})을 원하지만, 보유 포지션이 없습니다. 신규 진입으로 처리합니다.")
            decision_data['decision'] = f"NEW_{expected_side}" # 결정을 신규 진입으로 변경
            _place_order_common(session, decision_data, latest_data, is_adding=False, symbol=symbol)
        elif current_pos_side == expected_side:
            logger.info(f"AI 결정: {ai_decision}. 현재 {current_pos_side} 포지션에 추가 진입합니다.")
            _place_order_common(session, decision_data, latest_data, is_adding=True, symbol=symbol)
        else:
            logger.error(f"AI가 {expected_side} 포지션에 추가 진입을 원하지만, 현재 보유 포지션은 {current_pos_side} 입니다. 주문을 실행하지 않습니다.")
        return
    
    # 포지션 전환 로직 (선택적) - 현재는 AI가 명시적으로 CLOSE 후 NEW_ 로 결정하도록 유도
    if current_pos_side and ((current_pos_side == 'LONG' and ai_decision == 'NEW_SHORT') or \
                            (current_pos_side == 'SHORT' and ai_decision == 'NEW_LONG')):
        logger.info(f"AI 결정: {ai_decision}. 포지션 전환을 위해 현재 {current_pos_side} 포지션을 종료하고 신규 진입합니다.")
        if close_all_positions(session, symbol=symbol):
            _place_order_common(session, decision_data, latest_data, is_adding=False, symbol=symbol)
        else:
            logger.error("포지션 전환 실패: 기존 포지션 청산에 실패했습니다.")
        return

def generate_daily_pnl_report(session: HTTP, logger: logging.Logger, symbol: str, report_date: datetime.date, initial_capital: float = None):
    """
    Bybit API를 통해 P&L 데이터를 가져와 지정된 심볼과 날짜에 대한 일일 요약 보고서를 생성합니다.
    """
    try:
        # Fetch closed P&L data for the specific symbol
        # Increased limit for more data, but should eventually iterate through pages for full history
        response = session.get_closed_pnl(category="linear", symbol=symbol, limit=1000)
        pnl_data = response['result']['list']
        
        if not pnl_data:
            logger.info(f"P&L 보고서 생성: {symbol}에 대한 P&L 데이터를 찾을 수 없습니다.")
            return

        df = pd.DataFrame(pnl_data)

        df['closedPnl'] = pd.to_numeric(df['closedPnl'])
        df['cumEntryValue'] = pd.to_numeric(df['cumEntryValue'])

        df['updatedTime'] = pd.to_datetime(pd.to_numeric(df['updatedTime']), unit='ms').dt.tz_localize('UTC').dt.tz_convert('Asia/Seoul')

        # Filter for the specific report_date
        period_trades = df[df['updatedTime'].dt.date == report_date].copy()

        report_symbol_tag = f"_{symbol}"
        report_title_symbol = f" ({symbol})"
        report_period_str = report_date.strftime('%Y-%m-%d')
        md_filename = f"reports/pnl_summary_daily_{report_period_str}{report_symbol_tag}.md"
            
        if period_trades.empty:
            logger.info(f"보고서 생성: {report_period_str}{report_title_symbol} 기간에 거래 내역이 없습니다.")
            with open(md_filename, 'w', encoding='utf-8') as f:
                f.write(f"# P&L 요약 ({report_period_str}){report_title_symbol}\n\n")
                f.write("해당 기간에 거래 내역이 없습니다.\n")
            logger.info(f"{md_filename}가 생성되었습니다.")
            return

        total_trades = len(period_trades)
        wins = period_trades[period_trades['closedPnl'] > 0]
        losses = period_trades[period_trades['closedPnl'] <= 0]
        
        num_wins = len(wins)
        num_losses = len(losses)
        win_rate = (num_wins / total_trades) * 100 if total_trades > 0 else 0
        total_net_pnl = period_trades['closedPnl'].sum()
        total_cum_entry_value = period_trades['cumEntryValue'].sum()

        avg_profit = wins['closedPnl'].mean() if num_wins > 0 else 0
        avg_loss = losses['closedPnl'].mean() if num_losses > 0 else 0
        
        portfolio_return_rate = None
        if initial_capital is not None and initial_capital > 0:
            portfolio_return_rate = (total_net_pnl / initial_capital) * 100

        summary_df = period_trades[['updatedTime', 'symbol', 'side', 'closedPnl']].copy()
        summary_df.rename(columns={
            'updatedTime': '시간', 'symbol': '심볼', 'side': '포지션', 'closedPnl': '순수익 (USDT)',
        }, inplace=True)
        summary_df['포지션'] = summary_df['포지션'].map({'Sell': 'Long (청산)', 'Buy': 'Short (청산)'}).fillna(summary_df['포지션'])
        summary_df['시간'] = summary_df['시간'].dt.strftime('%Y-%m-%d %H:%M:%S')

        with open(md_filename, 'w', encoding='utf-8') as f:
            f.write(f"# P&L 요약 ({report_period_str}){report_title_symbol}\n\n")
            f.write("## 요약\n")
            f.write(f"- **총 거래:** {total_trades}회\n")
            f.write(f"- **승리:** {num_wins}회 / **패배:** {num_losses}회\n")
            f.write(f"- **승률:** {win_rate:.2f}%\n")
            f.write(f"- **최종 순수익:** **{total_net_pnl:.4f} USDT**\n")
            if portfolio_return_rate is not None:
                f.write(f"- **초기 자본 대비 수익률:** **{portfolio_return_rate:.2f}%**\n")
            f.write("\n### 통계\n")
            f.write(f"- **평균 수익 (익절 시):** {avg_profit:.4f} USDT\n")
            f.write(f"- **평균 손실 (손절 시):** {avg_loss:.4f} USDT\n")
            f.write("---\n\n")
            f.write("## 거래 내역\n")
            report_table = summary_df[['시간', '심볼', '포지션', '순수익 (USDT)']]
            f.write(report_table.to_markdown(index=False))

        logger.info(f"P&L summary saved to {md_filename}")

    except Exception as e:
        logger.error(f"P&L 보고서 생성 중 오류 발생: {e}", exc_info=True)

def get_initial_capital_from_script():
    """
    check_balance.py를 실행하여 초기 자본(USDT 잔고)을 가져옵니다.
    """
    global logger
    try:
        # check_balance.py 스크립트 실행
        result = subprocess.run(
            ['python', 'check_balance.py'], 
            capture_output=True, 
            text=True, 
            check=True, 
            encoding='utf-8'
        )
        
        # 스크립트 출력에서 잔고 파싱
        output = result.stdout
        
        # "USDT Balance: <value>" 라인 찾기
        match = re.search(r"USDT Balance: (\d+\.?\d*)", output)
        
        if match:
            balance_str = match.group(1)
            balance = float(balance_str)
            logger.info(f"check_balance.py를 통해 확인된 초기 자본: {balance} USDT")
            return balance
        else:
            logger.error("check_balance.py 출력에서 USDT 잔고를 찾을 수 없습니다.")
            logger.debug(f"check_balance.py 전체 출력:\n{output}")
            return None
            
    except FileNotFoundError:
        logger.error("python을 실행할 수 없습니다. PATH에 python이 설정되어 있는지 확인하세요.")
        return None
    except subprocess.CalledProcessError as e:
        logger.error(f"check_balance.py 실행 중 오류 발생: {e.stderr}")
        return None
    except Exception as e:
        logger.error(f"초기 자본을 가져오는 중 예외 발생: {e}", exc_info=True)
        return None


def main():
    """
    메인 자동매매 로직 실행
    """
    global logger # 전역 logger 사용 선언

    # 심볼 선택
    symbol_map = {"1": "BTCUSDT", "2": "ETHUSDT"}
    
    while True:
        choice = input("거래할 심볼을 선택하세요 (1: BTCUSDT, 2: ETHUSDT): ")
        if choice in symbol_map:
            symbol = symbol_map[choice]
            break
        else:
            print("잘못된 선택입니다. 1 또는 2를 입력해주세요.")

    logger = setup_logger(symbol) # 선택된 심볼로 로거 초기화

    logger.info("="*60)
    logger.info(f"Bybit 지능형 자동매매 봇 ({symbol})을 시작합니다. (종료: Ctrl+C)")
    logger.info("="*60)
    
    if not all([BYBIT_API_KEY, BYBIT_API_SECRET]):
        logger.critical(".env 파일에서 API 키를 찾을 수 없습니다. 프로그램을 종료합니다.")
        return

    # 초기 자본 설정
    logger.info("check_balance.py를 실행하여 초기 자본을 확인합니다...")
    initial_capital = get_initial_capital_from_script()

    if initial_capital is None:
        logger.warning("초기 자본을 자동으로 확인할 수 없습니다. P&L 보고서의 수익률 계산이 비활성화됩니다.")
    
    # 마지막 보고서 생성 날짜 추적
    last_report_date = datetime.now(tz=ZoneInfo("Asia/Seoul")).date() - timedelta(days=1) # 봇 시작 시 이전 날짜로 설정하여 시작 즉시 보고서 생성 방지

    try:
        bybit_session = HTTP(testnet=False, demo=True, api_key=BYBIT_API_KEY, api_secret=BYBIT_API_SECRET)
        # 초기 연결 확인
        bybit_session.get_instruments_info(category="linear", limit=1)
        logger.info("Bybit 데모 세션 연결에 성공했습니다.")
    except Exception as e:
        logger.critical(f"Bybit 세션 생성 실패: {e}. API 키와 네트워크를 확인하세요.", exc_info=True)
        return

    while True:
        try:
            current_date_kst = datetime.now(tz=ZoneInfo("Asia/Seoul")).date()
            if current_date_kst > last_report_date:
                # 자정에 이전 날짜의 보고서 생성
                report_for_date = last_report_date
                logger.info(f"자정 이후, 이전 날짜({report_for_date})에 대한 P&L 보고서를 생성합니다.")
                generate_daily_pnl_report(bybit_session, logger, symbol, report_for_date, initial_capital)
                last_report_date = current_date_kst # 보고서 생성 날짜 업데이트
                logger.info(f"현재 날짜({current_date_kst})로 마지막 보고서 생성 날짜를 업데이트했습니다.")

            logger.info("-" * 60)
            logger.info(f"[{datetime.now(tz=ZoneInfo('Asia/Seoul')).strftime('%Y-%m-%d %H:%M:%S')}] 새로운 사이클 시작")

            # 1. 시장 데이터 가져오기
            market_df = get_market_data_manual_ta(symbol, '15', 100)

            if market_df is None or market_df.empty:
                logger.warning("시장 데이터를 가져올 수 없습니다. 다음 사이클까지 대기합니다.")
                time.sleep(60) # 데이터 못가져오면 1분 대기
                continue

            # 2. 현재 포지션 확인
            current_pos_side, current_pos_size = get_current_position(bybit_session, symbol=symbol)
            if current_pos_side:
                logger.info(f"현재 포지션: {current_pos_side}, 크기: {current_pos_size}")
            else:
                logger.info("현재 보유 포지션 없음.")

            # 3. AI에게 결정 요청
            logger.info("AI 에이전트에게 매매 결정을 요청합니다...")
            ai_decision_data = get_ai_decision(market_df, current_pos_side, symbol)

            # 4. 결정에 따른 매매 실행
            if ai_decision_data and ai_decision_data.get('decision'):
                logger.info(f"AI 결정 수신: {ai_decision_data.get('decision')}")
                execute_futures_trade(bybit_session, ai_decision_data, market_df, current_pos_side, current_pos_size, symbol)
            else:
                logger.warning("AI로부터 유효한 결정을 받지 못했습니다. 다음 사이클까지 대기합니다.")

            # 다음 사이클 대기 (15분)
            logger.info("다음 사이클까지 15분 대기합니다...")
            time.sleep(900)

        except KeyboardInterrupt:
            logger.info("사용자에 의해 프로그램이 중단되었습니다.")
            break
        except Exception as e:
            logger.error(f"메인 루프에서 예상치 못한 오류 발생: {e}", exc_info=True)
            logger.info("1분 후 재시도합니다...")
            time.sleep(60)

if __name__ == "__main__":
    main()