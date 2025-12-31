from pybit.unified_trading import HTTP
from dotenv import load_dotenv
import os

# .env 파일 로드 (스크립트와 같은 디렉토리에 있는 .env 파일을 찾습니다)
load_dotenv()

# 환경 변수에서 API 키와 시크릿 읽기
api_key = os.getenv('BYBIT_API_KEY')
api_secret = os.getenv('BYBIT_API_SECRET')

if not api_key or not api_secret:
    print("BYBIT_API_KEY 또는 BYBIT_API_SECRET 환경 변수가 .env 파일에 설정되지 않았습니다.")
    exit()

session = None
try:
    # 최신 pybit 버전의 데모 트레이딩 연결 방식 (testnet=False, demo=True)
    session = HTTP(
        testnet=False,
        demo=True,
        api_key=api_key,
        api_secret=api_secret
    )
    print("Successfully connected using demo=True.")
except TypeError:
    # demo=True 파라미터를 지원하지 않는 구버전 pybit를 위한 대체 방식
    print("Warning: 'demo=True' is not supported in this pybit version. Falling back to domain='bybit'.")
    session = HTTP(
        testnet=False,
        domain="bybit",  # bybit.com 프로덕션 도메인으로 데모 트레이딩
        api_key=api_key,
        api_secret=api_secret
    )
    print("Successfully connected using domain='bybit'.")


if not session:
    print("Failed to create Bybit HTTP session.")
    exit()

try:
    # 계좌 잔고 조회 (통합 계정)
    response = session.get_wallet_balance(accountType="UNIFIED", coin="USDT")
    
    usdt_balance = None
    if response and response.get('retCode') == 0:
        result_list = response.get('result', {}).get('list', [])
        if result_list:
            # 통합 계정(UNIFIED)의 잔고 정보
            account_info = result_list[0]
            for coin_info in account_info.get('coin', []):
                if coin_info.get('coin') == 'USDT':
                    usdt_balance = coin_info.get('walletBalance')
                    break
    
    if usdt_balance is not None:
        print(f"USDT Balance: {usdt_balance}")
    else:
        print("Could not find USDT balance.")
        print(f"Full API Response: {response}")

except Exception as e:
    print(f"An error occurred while fetching balance: {e}")