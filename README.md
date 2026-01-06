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

봇을 종료하려면 터미널에서 `Ctrl+C`를 누르세요.

---

## 사용법 - P&L 보고서 생성

`summarize_pnl.py` 스크립트는 Bybit API를 통해 직접 거래 데이터를 가져온 후, 이를 분석하여 상세한 통계가 포함된 Markdown 형식의 보고서를 생성합니다.

**기본 사용법 (오늘 날짜의 일일 보고서 생성):**
```bash
python summarize_pnl.py
```

**옵션:**
- `--period`: 보고서 기간을 선택합니다. (`daily`, `weekly`, `monthly`, 기본값: `daily`)
- `--date YYYY-MM-DD`: 보고서의 기준 날짜를 지정합니다. (기본값: 오늘)

**초기 자본 입력:**
스크립트를 실행하면 초기 자본을 입력하라는 메시지가 표시됩니다. 자본을 입력하면 보고서에 **초기 자본 대비 수익률**이 포함됩니다. 입력하지 않고 Enter를 누르면 해당 항목은 표시되지 않습니다.

**사용 예시:**

- **오늘의 일일 보고서 생성:**
  ```bash
  python summarize_pnl.py
  # 초기 자본을 입력하라는 메시지가 표시됨
  ```

- **2026년 1월 6일의 일일 보고서 생성:**
  ```bash
  python summarize_pnl.py --period daily --date 2026-01-06
  ```

- **2026년 1월 6일로 끝나는 주간 보고서 생성:**
  ```bash
  python summarize_pnl.py --period weekly --date 2026-01-06
  ```

- **2026년 1월 월간 보고서 생성:**
  ```bash
  python summarize_pnl.py --period monthly --date 2026-01-06
  ```

### 3. 보고서 자동화 (Windows 작업 스케줄러)

매일 밤 11시 59분에 `summarize_pnl.py`를 자동으로 실행하여 그날의 일일 보고서를 생성할 수 있습니다.

1.  **명령 프롬프트(cmd) 또는 PowerShell을 관리자 권한으로 실행**합니다.
2.  아래 명령어 템플릿을 **사용자 환경에 맞게 수정한 후** 복사하여 붙여넣습니다.

    ```powershell
    schtasks /create /tn "Bybit PNL Summary" /tr "'YOUR_PYTHON_PATH' 'YOUR_SCRIPT_PATH'" /sc daily /st 23:59
    ```

    **경로 확인 방법:**
    -   `YOUR_PYTHON_PATH`: 사용 중인 파이썬 실행 파일의 전체 경로입니다. 터미널에서 아래 명령어로 확인할 수 있습니다.
        ```bash
        python -c "import sys; print(sys.executable)"
        ```
    -   `YOUR_SCRIPT_PATH`: `summarize_pnl.py` 파일의 전체 경로입니다. (예: `C:\Users\YourUser\Documents\bybit\summarize_pnl.py`)

**참고:** 자동화된 보고서에는 초기 자본을 입력할 수 없으므로 `초기 자본 대비 수익률` 항목은 빠지게 됩니다.