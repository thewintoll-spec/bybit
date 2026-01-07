import pandas as pd
from pybit.unified_trading import HTTP
from dotenv import load_dotenv
import os

def calculate_sma(data, window):
    """Pandas를 사용하여 단순 이동 평균(SMA)을 계산합니다."""
    return data.rolling(window=window).mean()

def calculate_rsi(data, window=14):
    """Pandas를 사용하여 상대 강도 지수(RSI)를 계산합니다."""
    delta = data.diff()
    gain = delta.where(delta > 0, 0)
    loss = -delta.where(delta < 0, 0)
    avg_gain = gain.ewm(com=window - 1, min_periods=window).mean()
    avg_loss = loss.ewm(com=window - 1, min_periods=window).mean()
    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))
    return rsi

def get_market_data_manual_ta(symbol="BTCUSDT", interval=15, limit=200):
    """
    Bybit 선물(Linear) K-line 데이터를 가져와 기술 지표(RSI, SMA)를 계산합니다.
    """
    load_dotenv()
    api_key = os.getenv('BYBIT_API_KEY')
    api_secret = os.getenv('BYBIT_API_SECRET')
    if not api_key or not api_secret:
        print("BYBIT_API_KEY 또는 BYBIT_API_SECRET 환경 변수를 찾을 수 없습니다.")
        return None

    session = None
    try:
        session = HTTP(testnet=False, demo=True, api_key=api_key, api_secret=api_secret)
    except TypeError:
        session = HTTP(testnet=False, domain="bybit", api_key=api_key, api_secret=api_secret)

    if not session:
        print("Bybit HTTP 세션을 생성할 수 없습니다.")
        return None

    try:
        effective_limit = limit + 40
        # category를 "linear"로 수정
        response = session.get_kline(
            category="linear",
            symbol=symbol,
            interval=str(interval),
            limit=effective_limit
        )

        if response and response.get('retCode') == 0:
            kline_data = response['result']['list']
            df = pd.DataFrame(kline_data, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume', 'turnover'])
            df = df.iloc[::-1].reset_index(drop=True)
            
            for col in ['open', 'high', 'low', 'close', 'volume']:
                df[col] = pd.to_numeric(df[col])
            
            df['timestamp'] = pd.to_datetime(pd.to_numeric(df['timestamp']), unit='ms')
            df['SMA_20'] = calculate_sma(df['close'], 20)
            df['RSI_14'] = calculate_rsi(df['close'], 14)
            df = df.drop(columns=['turnover'])
            return df.tail(limit).reset_index(drop=True)
        else:
            print(f"K-line 데이터 가져오기 실패: {response.get('retMsg', 'Unknown error')}")
            return None

    except Exception as e:
        print(f"데이터 처리 중 오류 발생: {e}")
        return None

if __name__ == '__main__':
    # BTC 데이터 테스트
    print("--- BTCUSDT 데이터 테스트 ---")
    market_df_btc = get_market_data_manual_ta(symbol="BTCUSDT")
    if market_df_btc is not None:
        print("BTCUSDT 선물 15분봉 데이터 및 수동 계산된 기술 지표:")
        print(market_df_btc.tail())
    
    print("\n" + "="*50 + "\n")

    # ETH 데이터 테스트
    print("--- ETHUSDT 데이터 테스트 ---")
    market_df_eth = get_market_data_manual_ta(symbol="ETHUSDT")
    if market_df_eth is not None:
        print("ETHUSDT 선물 15분봉 데이터 및 수동 계산된 기술 지표:")
        print(market_df_eth.tail())
