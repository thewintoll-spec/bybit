# Bybit 지능형 자동매매 봇

LM Studio와 Bybit API를 활용하여 BTCUSDT 및 ETHUSDT 선물을 자동으로 매매하는 지능형 트레이딩 봇입니다. AI 에이전트가 시장 데이터를 분석하여 매매 결정을 내립니다.

## 주요 기능

- **AI 기반 매매 결정**: 로컬에서 실행되는 LM Studio의 언어 모델을 통해 시장 데이터를 분석하고 매매 결정을 내립니다.
- **다중 암호화폐 지원**: BTCUSDT와 ETHUSDT 거래를 지원합니다.
- **자동 포지션 관리**: AI의 결정에 따라 자동으로 신규 주문, 추가 주문, 포지션 종료 등을 실행합니다.
- **레버리지 및 TP/SL 설정**: AI가 제안하는 레버리지, 익절(Take Profit), 손절(Stop Loss) 가격을 주문에 자동으로 적용합니다.
- **실시간 로깅**: 모든 매매 활동과 AI의 결정 과정을 로그 파일(`trading_bot.log`)에 기록하여 추적할 수 있습니다.

## 설치 방법

### 1. 저장소 복제

```bash
git clone https://github.com/thewintoll-spec/bybit.git
cd bybit
```

### 2. 가상 환경 생성 및 활성화

프로젝트 의존성을 시스템에 직접 설치하지 않고 격리된 환경에 설치하는 것이 좋습니다.

```bash
# Windows
python -m venv venv
venv\Scripts\activate

# macOS/Linux
python3 -m venv venv
source venv/bin/activate
```

### 3. 의존성 설치

`requirements.txt` 파일에 명시된 라이브러리들을 설치합니다.

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

- `YOUR_BYBIT_API_KEY`, `YOUR_BYBIT_API_SECRET`: Bybit에서 발급받은 API 키와 시크릿 키로 교체하세요. (테스트넷 또는 데모 계정 권장)
- `YOUR_LM_STUDIO_MODEL_NAME`: 사용하려는 LM Studio 모델의 이름을 입력합니다. 이 값은 LM Studio 서버 로그에서 확인할 수 있습니다.

## 사용법

1.  **LM Studio 서버 실행**: 자동매매 봇을 실행하기 전에, 반드시 LM Studio를 열고 **Developer** 탭에서 모델을 로드한 후 서버를 시작해야 합니다.

2.  **자동매매 봇 실행**: 터미널에서 다음 명령어를 실행합니다.

    ```bash
    python ai_agent.py
    ```

3.  **심볼 선택**: 프로그램이 시작되면 거래할 암호화폐를 선택하라는 메시지가 표시됩니다.
    - `1`을 입력하면 **BTCUSDT** 거래를 시작합니다.
    - `2`를 입력하면 **ETHUSDT** 거래를 시작합니다.

    봇은 15분마다 새로운 시장 데이터를 가져와 AI에게 분석을 요청하고, 그 결정에 따라 매매를 실행합니다.

    봇을 종료하려면 터미널에서 `Ctrl+C`를 누르세요.

## 병렬 실행 (BTC와 ETH 동시 거래)

BTC와 ETH를 동시에 거래하고 싶다면, 터미널(CLI)을 두 개 열고 각각의 터미널에서 봇을 개별적으로 실행하면 됩니다.

- **터미널 1**: `python ai_agent.py` 실행 후 `1` (BTCUSDT) 선택
- **터미널 2**: `python ai_agent.py` 실행 후 `2` (ETHUSDT) 선택

이렇게 하면 두 개의 독립적인 봇이 각각의 암호화폐를 동시에 거래하게 됩니다.
