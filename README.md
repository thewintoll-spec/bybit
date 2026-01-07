# Bybit 지능형 자동매매 봇 및 P&L 리포터

LM Studio와 Bybit API를 활용하여 BTCUSDT 및 ETHUSDT 선물을 자동으로 매매하고, 거래 내역을 분석하여 일간, 주간, 월간 P&L 보고서를 생성하는 프로젝트입니다.

## 주요 기능

- **AI 기반 매매 결정**: 로컬에서 실행되는 LM Studio의 언어 모델을 통해 시장 데이터를 분석하고 매매 결정을 내립니다. (`ai_agent.py`)
- **자동 포지션 관리**: AI의 결정에 따라 자동으로 신규 주문, 추가 주문, 포지션 종료 등을 실행합니다.
- **상세한 P&L 리포트**: 거래 내역을 집계하여 일간, 주간, 월간 수익률 보고서를 생성합니다. (`summarize_pnl.py`)
- **사용자 맞춤 수익률 계산**: 초기 자본을 직접 입력받아 실제 투자 대비 수익률을 계산합니다.
- **보고서 자동화**: Windows 작업 스케줄러를 사용하여 매일 자동으로 보고서를 생성할 수 있습니다.

## 설치 방법

### 1. 저장소 복제

```bash
git clone https://github.com/thewintoll-spec/bybit.git
cd bybit
```

### 2. 가상 환경 생성 및 활성화

```bash
# Windows
python -m venv venv
venv\Scripts\activate

# macOS/Linux
python3 -m venv venv
source venv/bin/activate
```

### 3. 의존성 설치

```bash
pip install -r requirements.txt
```

### 4. .env 파일 설정

Bybit API 키와 LM Studio 모델 이름을 저장하기 위해 프로젝트 루트 디렉토리에 `.env` 파일을 생성하고 다음 내용을 추가합니다.

```
BYBIT_API_KEY="YOUR_BYBIT_API_KEY"
BYBIT_API_SECRET="YOUR_BYBIT_API_SECRET"
LM_STUDIO_MODEL_NAME="YOUR_LM_STUDIO_MODEL_NAME" # (예: "gemma-2b-it-q8_0.gguf")
```
- API 키는 **Unified Trading** 계정용이어야 합니다.

---

## 사용법 - 자동매매 봇

1.  **LM Studio 서버 실행**: 자동매매 봇을 실행하기 전에, 반드시 LM Studio를 열고 **Developer** 탭에서 모델을 로드한 후 서버를 시작해야 합니다.
2.  **자동매매 봇 실행**: 터미널에서 다음 명령어를 실행합니다.
    ```bash
    python ai_agent.py
    ```
3.  **심볼 선택**: 프로그램이 시작되면 거래할 암호화폐를 선택하라는 메시지가 표시됩니다.
    - `1`을 입력하면 **BTCUSDT** 거래를 시작하고 `btc_trading_bot.txt` 로그 파일에 기록합니다.
    - `2`을 입력하면 **ETHUSDT** 거래를 시작하고 `eth_trading_bot.txt` 로그 파일에 기록합니다.
4.  **자동 리포트 생성**: 봇이 시작되면 `check_balance.py`를 통해 계정의 USDT 잔고를 자동으로 확인하여 초기 자본으로 설정합니다. 이 자본은 자정(KST 기준) 이후 생성되는 일일 P&L 보고서의 수익률 계산에 사용됩니다. 보고서는 `reports/` 폴더 내에 `pnl_summary_daily_[날짜]_[심볼].md` 형식으로 저장됩니다.

봇을 종료하려면 터미널에서 `Ctrl+C`를 누르세요.

---
