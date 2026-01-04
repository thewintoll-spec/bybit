import requests
import json
import os
import pandas as pd
import time
import logging
from datetime import datetime
from dotenv import load_dotenv
from pybit.unified_trading import HTTP
from pybit.exceptions import InvalidRequestError
from market_data import get_market_data_manual_ta
from decimal import Decimal

def setup_logger():
    """
    로그 설정을 초기화하고 로거 객체를 반환합니다.
    """
    # 로거 생성
    logger = logging.getLogger("TradingBot")
    logger.setLevel(logging.INFO)

    # 이미 핸들러가 설정되어 있다면 중복 추가 방지
    if logger.hasHandlers():
        logger.handlers.clear()

    # 로그 포맷 설정
    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s', datefmt='%Y-%m-%d %H:%M:%S')

    # 콘솔 핸들러 (터미널 출력)
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    # 파일 핸들러 (파일 기록)
    file_handler = logging.FileHandler('trading_bot.log', encoding='utf-8')
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    return logger

def get_current_position(session: HTTP, symbol="BTCUSDT"):
    """
    현재 열려있는 포지션 정보를 가져옵니다.
    :return: (포지션 사이드, 포지션 크기) 튜플 또는 (None, None)
    """
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

# 전역 로거 객체 생성
logger = setup_logger()

# .env 파일 로드 및 API 키 설정
load_dotenv()
LM_STUDIO_ENDPOINT = "http://localhost:1234/v1/chat/completions"
LM_STUDIO_MODEL_NAME = os.getenv('LM_STUDIO_MODEL_NAME')
BYBIT_API_KEY = os.getenv('BYBIT_API_KEY')
BYBIT_API_SECRET = os.getenv('BYBIT_API_SECRET')


def get_ai_decision(market_df: pd.DataFrame, current_pos_side: str) -> dict:
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
Here is the latest 15-minute candle data for BTCUSDT:
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

def close_all_positions(session: HTTP, symbol="BTCUSDT") -> bool:
    """
    특정 심볼의 모든 열린 선물 포지션을 시장가로 청산합니다.
    """
    logger.info(f"'{symbol}'의 모든 열린 포지션을 청산 시도하는 중...")
    try:
        side, size = get_current_position(session, symbol)
        if not side:
            logger.info("청산할 열린 포지션이 없습니다.")
            return True

        close_side = "Sell" if side == "LONG" else "Buy"
        order = session.place_order(
            category="linear",
            symbol=symbol,
            side=close_side,
            orderType="Market",
            qty=str(size),
            reduceOnly=True
        )
        if order and order.get('retCode') == 0:
            logger.info(f"✅ 포지션 청산 주문 성공! Order ID: {order['result']['orderId']}")
            time.sleep(5) # 포지션이 완전히 청산될 시간을 줍니다.
            return True
        else:
            logger.error(f"❌ 포지션 청산 주문 실패. 원인: {order.get('retMsg', 'Unknown error')}")
            return False
    except Exception as e:
        logger.error(f"포지션 청산 중 예외 발생: {e}", exc_info=True)
        return False

def _place_order_common(session: HTTP, decision_data: dict, latest_data: pd.Series, is_adding: bool):
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
                session.set_leverage(category="linear", symbol="BTCUSDT", buyLeverage=leverage_str, sellLeverage=leverage_str)
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
            balance_for_trading = wallet_balance
            logger.warning("데모 환경 우회: '거래 가능 잔고'가 0이므로 '총 보유량'으로 주문 수량을 계산합니다.")
        
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
        
        instrument_info = session.get_instruments_info(category="linear", symbol="BTCUSDT")['result']['list'][0]
        qty_step = Decimal(instrument_info['lotSizeFilter']['qtyStep'])
        adjusted_qty = round(preliminary_qty / qty_step) * qty_step
        final_qty_str = f"{adjusted_qty:.{abs(qty_step.as_tuple().exponent)}f}"

        if adjusted_qty <= 0:
            logger.error("주문 실행 불가: 계산된 수량이 0 또는 그 이하입니다.")
            return

        order_type_msg = "신규" if not is_adding else "추가"
        logger.info(f"AI 추천: 증거금 사용률 {trade_size_percentage}% / TP: {tp_price} / SL: {sl_price}")
        logger.info(f"{order_type_msg} 주문: {ai_decision} {final_qty_str} BTC (사용 증거금: 약 {margin_to_use:.2f} USDT)")

        # 주문 실행
        order = session.place_order(
            category="linear",
            symbol="BTCUSDT",
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

def execute_futures_trade(session: HTTP, decision_data: dict, market_df: pd.DataFrame, current_pos_side: str, current_pos_size: Decimal):
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
            close_all_positions(session)
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
            _place_order_common(session, decision_data, latest_data, is_adding=False)
        return

    # 추가 진입 (ADD_TO_LONG 또는 ADD_TO_SHORT)
    if ai_decision in ['ADD_TO_LONG', 'ADD_TO_SHORT']:
        expected_side = 'LONG' if ai_decision == 'ADD_TO_LONG' else 'SHORT'
        if not current_pos_side:
            logger.warning(f"AI가 추가 진입({ai_decision})을 원하지만, 보유 포지션이 없습니다. 신규 진입으로 처리합니다.")
            decision_data['decision'] = f"NEW_{expected_side}" # 결정을 신규 진입으로 변경
            _place_order_common(session, decision_data, latest_data, is_adding=False)
        elif current_pos_side == expected_side:
            logger.info(f"AI 결정: {ai_decision}. 현재 {current_pos_side} 포지션에 추가 진입합니다.")
            _place_order_common(session, decision_data, latest_data, is_adding=True)
        else:
            logger.error(f"AI가 {expected_side} 포지션에 추가 진입을 원하지만, 현재 보유 포지션은 {current_pos_side} 입니다. 주문을 실행하지 않습니다.")
        return
    
    # 포지션 전환 로직 (선택적) - 현재는 AI가 명시적으로 CLOSE 후 NEW_ 로 결정하도록 유도
    if current_pos_side and ((current_pos_side == 'LONG' and ai_decision == 'NEW_SHORT') or \
                            (current_pos_side == 'SHORT' and ai_decision == 'NEW_LONG')):
        logger.info(f"AI 결정: {ai_decision}. 포지션 전환을 위해 현재 {current_pos_side} 포지션을 종료하고 신규 진입합니다.")
        if close_all_positions(session):
            _place_order_common(session, decision_data, latest_data, is_adding=False)
        else:
            logger.error("포지션 전환 실패: 기존 포지션 청산에 실패했습니다.")
        return

def main():
    """
    메인 자동매매 로직 실행
    """
    logger.info("="*60)
    logger.info("Bybit 지능형 자동매매 봇을 시작합니다. (종료: Ctrl+C)")
    logger.info("="*60)
    
    if not all([BYBIT_API_KEY, BYBIT_API_SECRET]):
        logger.critical(".env 파일에서 API 키를 찾을 수 없습니다. 프로그램을 종료합니다.")
        return

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
            logger.info("-" * 60)
            logger.info("새로운 매매 사이클 시작...")
            
            # 1. 시장 데이터 가져오기
            market_df = get_market_data_manual_ta()
            if market_df is None or market_df.empty:
                logger.error("시장 데이터를 가져오지 못했습니다. 다음 사이클까지 대기합니다.")
                time.sleep(60)
                continue

            # 데이터 유효성 검사 (RSI, SMA 계산 확인)
            if market_df.iloc[-1][['RSI_14', 'SMA_20']].isnull().any():
                logger.warning("기술 지표가 아직 계산되지 않았습니다 (데이터 부족). 다음 사이클까지 대기합니다.")
                time.sleep(60)
                continue
            
            logger.info("최신 시장 데이터 확인 완료.")

            # 2. 현재 포지션 확인
            current_pos_side, current_pos_size = get_current_position(bybit_session)
            if current_pos_side:
                logger.info(f"현재 포지션: {current_pos_side} (크기: {current_pos_size})")
            else:
                logger.info("현재 보유 포지션 없음.")

            # 3. AI에게 매매 결정 요청
            logger.info("AI 에이전트에게 매매 결정을 요청하는 중...")
            ai_result = get_ai_decision(market_df, current_pos_side)

            # 4. AI 결정에 따른 거래 실행
            if ai_result:
                decision_details = f"🤖 AI 결정: " + ", ".join(f"'{k}': '{v}'" for k, v in ai_result.items())
                logger.info(decision_details)
                execute_futures_trade(bybit_session, ai_result, market_df, current_pos_side, current_pos_size)
            else:
                logger.error("AI로부터 유효한 결정을 받아오지 못했습니다.")

            logger.info(f"사이클 완료. 다음 사이클까지 15분 대기합니다...")
            time.sleep(15 * 60)

        except KeyboardInterrupt:
            logger.info("사용자에 의해 프로그램이 중단되었습니다. 자동매매 봇을 종료합니다.")
            break
        except Exception as e:
            logger.critical(f"메인 루프에서 예상치 못한 오류 발생: {e}", exc_info=True)
            logger.info("60초 후 다음 사이클을 시도합니다.")
            time.sleep(60)

if __name__ == "__main__":
    main()
