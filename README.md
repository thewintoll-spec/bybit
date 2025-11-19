# Bybit AI Auto-Trader (Local AI Edition)

이 프로젝트는 **Bybit 선물 거래(Demo/Live)**를 위해 **로컬 AI (Ollama)**를 활용하여 차트를 분석하고 자동으로 매매를 수행하는 봇입니다.

클라우드 API(Gemini, GPT 등)를 사용하지 않으므로, **API 비용이 0원**이며 **사용량 제한(Rate Limit)** 걱정 없이 무제한으로 분석할 수 있습니다.

## 🚀 주요 기능
- **100% 로컬 AI 분석**: 내 컴퓨터의 GPU/CPU를 사용하여 차트 분석 (Ollama 연동)
- **실시간 차트 & 보조지표**: RSI, 볼린저 밴드, MACD 등을 계산하여 AI에게 제공
- **자동 매매 (Auto-Trading)**: AI 판단(LONG/SHORT/HOLD)에 따라 Bybit API로 주문 실행
- **AI 자가 피드백**: 매매 결과를 스스로 복기하여 전략을 수정하는 강화학습 루프
- **AI 채팅 어시스턴트**: 봇과 대화하며 현재 시장 상황에 대해 질의응답 가능

## 🛠️ 필수 준비 사항

### 1. Node.js 설치
[Node.js 공식 홈페이지](https://nodejs.org/)에서 LTS 버전을 설치하세요.

### 2. Ollama 설치 및 모델 다운로드
이 봇은 Ollama가 백그라운드에서 실행되어야 합니다.
1. [Ollama.com](https://ollama.com)에서 다운로드 및 설치
2. 터미널에서 사용할 모델 다운로드 (추천: gemma2, llama3, mistral 등)
   ```bash
   ollama pull gemma2:2b
   # 또는
   ollama pull llama3
   ```

## ⚙️ 설치 및 실행 방법

### 1. 프로젝트 설치
```bash
npm install
```

### 2. Ollama 서버 실행 (필수: CORS 설정)
웹 브라우저에서 로컬 AI에 접속하기 위해 **반드시** 아래 명령어로 Ollama를 실행해야 합니다. (기존에 켜져 있다면 끄고 다시 실행하세요)

**Windows (CMD)**
```cmd
set OLLAMA_ORIGINS=* && ollama serve
```

**Windows (PowerShell)**
```powershell
$env:OLLAMA_ORIGINS="*"; ollama serve
```

**Mac/Linux**
```bash
OLLAMA_ORIGINS="*" ollama serve
```

### 3. 웹 앱 실행
새 터미널을 열고 실행하세요.
```bash
npm run dev
```
브라우저에서 `http://127.0.0.1:5173`으로 접속합니다.

## 🔑 Bybit API 연결
1. 웹 앱 우측 상단의 **[⚙️ 설정]** 버튼 클릭
2. **AI 모델 설정**: 위에서 실행한 Ollama가 연결되는지 확인 (기본값 127.0.0.1:11434)
3. **Bybit API 연결**:
   - [Bybit Testnet](https://testnet.bybit.com) 또는 [Mainnet](https://bybit.com)에서 API Key 발급
   - **권한**: `Orders` (읽기/쓰기), `Positions` (읽기/쓰기) 필수
   - 키 입력 후 **[저장 및 연결]** 클릭

## ⚠️ 주의사항
- 이 봇은 실험용 프로젝트입니다. 실제 자금을 운용하기 전에 반드시 **데모 트레이딩**으로 충분히 테스트하세요.
- 로컬 AI 모델의 성능(지능)에 따라 매매 결과가 크게 달라질 수 있습니다. (작은 모델은 멍청할 수 있습니다.)
