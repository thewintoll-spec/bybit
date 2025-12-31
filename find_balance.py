import os
from dotenv import load_dotenv
from pybit.unified_trading import HTTP
from decimal import Decimal

def find_my_money():
    """
    Bybit 데모 계정의 모든 계정 유형을 조회하여 USDT 잔고가 어디에 있는지 상세히 찾습니다.
    """
    load_dotenv()
    api_key = os.getenv('BYBIT_API_KEY')
    api_secret = os.getenv('BYBIT_API_SECRET')

    if not api_key or not api_secret:
        print(">> .env 파일에서 API 키를 찾을 수 없습니다.")
        return

    print(">> Bybit 데모 서버에 연결하는 중...")
    session = None
    try:
        session = HTTP(testnet=False, demo=True, api_key=api_key, api_secret=api_secret)
    except TypeError:
        session = HTTP(testnet=False, domain="bybit", api_key=api_key, api_secret=api_secret)

    if not session:
        print(">> Bybit 세션 생성에 실패했습니다.")
        return

    # 조회할 모든 계정 유형
    account_types = ["UNIFIED", "CONTRACT", "SPOT", "FUND", "OPTION"]
    found_any_balance = False

    print("\n" + "="*60)
    print("계정 유형별 잔고 상세 정보 조회를 시작합니다...")
    print("="*60)

    for acc_type in account_types:
        try:
            response = session.get_wallet_balance(accountType=acc_type)

            if response and response.get('retCode') == 0:
                result_list = response.get('result', {}).get('list', [])
                if result_list and result_list[0].get('coin'):
                    
                    # 해당 계정 유형에서 잔고를 찾았음을 표시
                    if not found_any_balance:
                        found_any_balance = True

                    print(f"\n--- 🔎 [{acc_type}] 계정에서 잔고를 찾았습니다! ---")
                    
                    for coin_info in result_list[0]['coin']:
                        coin_name = coin_info.get('coin', 'N/A')
                        
                        # USDT인 경우 더 상세히 출력
                        if "USD" in coin_name:
                            print(f"\n  🪙  Coin: {coin_name}")
                            
                            wallet_balance = coin_info.get('walletBalance', '0')
                            available_balance = coin_info.get('availableBalance', '0')
                            available_to_withdraw = coin_info.get('availableToWithdraw', '0')
                            equity = coin_info.get('equity', '0')

                            print(f"    - 총 보유 잔고 (walletBalance): {wallet_balance}")
                            print(f"    - 거래 가능 잔고 (availableBalance): {available_balance}")
                            print(f"    - 인출 가능 잔고 (availableToWithdraw): {available_to_withdraw}")
                            print(f"    - 순자산 (equity): {equity}")
                else:
                    # API 호출은 성공했으나 잔고 목록이 비어있는 경우
                    print(f"\n--- 텅 빔 --- [{acc_type}] 계정에는 잔고가 없습니다.")

            else:
                # API 호출 자체가 실패한 경우 (예: 지원하지 않는 계정 유형)
                print(f"\n--- 오류 발생 --- [{acc_type}] 계정 정보를 가져올 수 없습니다. (에러: {response.get('retMsg', 'Unknown')})")

        except Exception as e:
            print(f"\n--- 오류 발생 --- [{acc_type}] 계정 조회 중 예외가 발생했습니다: {e}")

    print("\n" + "="*60)
    if not found_any_balance:
        print("모든 계정 유형에서 어떠한 잔고도 찾지 못했습니다.")
    else:
        print("잔고 상세 정보 조회가 완료되었습니다.")
        print("\n[분석] '거래 가능 잔고 (availableBalance)'가 0이 아닌 USDT를 찾아보세요.")
        print("      만약 'UNIFIED' 계정이 아닌 다른 곳에 있다면, 자금 종류가 다른 것입니다.")


if __name__ == "__main__":
    find_my_money()
