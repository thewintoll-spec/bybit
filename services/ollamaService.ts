
import { Candle, AIDecision, Trade, Position } from '../types';

// --- Technical Analysis Helpers (Standalone) ---

const calculateSMA = (prices: number[], period: number): number | null => {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return sum / period;
};

const calculateEMA = (prices: number[], period: number): number | null => {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let ema = prices[0];
  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
};

const calculateStandardDeviation = (prices: number[], period: number): number | null => {
  if (prices.length < period) return null;
  const sma = calculateSMA(prices, period);
  if (!sma) return null;
  
  const slice = prices.slice(-period);
  const squareDiffs = slice.map(value => Math.pow(value - sma, 2));
  const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / period;
  return Math.sqrt(avgSquareDiff);
};

const calculateBollingerBands = (prices: number[], period: number = 20, multiplier: number = 2) => {
  const sma = calculateSMA(prices, period);
  const stdDev = calculateStandardDeviation(prices, period);
  if (!sma || !stdDev) return null;
  return {
    upper: sma + (stdDev * multiplier),
    middle: sma,
    lower: sma - (stdDev * multiplier)
  };
};

const calculateRSI = (prices: number[], period: number = 14): number | null => {
  if (prices.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
};

const calculateMACD = (prices: number[]) => {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  if (!ema12 || !ema26) return null;
  return { macdLine: ema12 - ema26 };
};

// --- Main Ollama Analysis Function ---

// Normalize URL to prevent double slashes
const normalizeUrl = (url: string) => {
    return url.replace(/\/+$/, '');
};

// Helper: Retry logic for robust connection
async function fetchWithRetry(url: string, options: any, retries = 3, backoff = 2000): Promise<Response> {
    try {
        const response = await fetch(url, options);
        if (!response.ok && response.status !== 404) {
            // 404(모델 없음)가 아닌 500번대 에러 등은 재시도 가치 있음
            throw new Error(`Server returned ${response.status}`);
        }
        return response;
    } catch (err) {
        if (retries <= 0) throw err;
        console.warn(`[Ollama] Request failed, retrying in ${backoff}ms... (${retries} left)`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        return fetchWithRetry(url, options, retries - 1, backoff * 1.5); // 점진적으로 대기 시간 증가
    }
}

// Fetch installed models from Ollama
export const getOllamaModels = async (baseUrl: string): Promise<{ success: boolean; models: string[]; message: string }> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 타임아웃 30초로 대폭 연장

    try {
        const cleanUrl = normalizeUrl(baseUrl);
        console.log(`[Ollama] Fetching models from: ${cleanUrl}/api/tags`);

        const res = await fetchWithRetry(`${cleanUrl}/api/tags`, { 
            credentials: 'omit',
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!res.ok) throw new Error(`서버 응답 오류 (${res.status})`);
        
        const data = await res.json();
        const models = (data.models || []).map((m: any) => m.name);

        if (models.length === 0) {
            return { success: false, models: [], message: "설치된 모델이 없습니다. (ollama pull [모델명] 필요)" };
        }

        return { success: true, models, message: "모델 목록 조회 성공!" };
    } catch (e: any) {
        clearTimeout(timeoutId);
        console.error("[Ollama Connection Error]", e);
        
        if (e.name === 'AbortError') {
             return { success: false, models: [], message: "연결 시간 초과 (30초). 다른 봇이 AI를 사용 중일 수 있습니다." };
        }
        return { success: false, models: [], message: `연결 실패: ${e.message}. (CORS 설정 또는 터미널 실행 여부 확인)` };
    }
};

export const analyzeMarketOllama = async (
    candles: Candle[], 
    baseUrl: string = 'http://127.0.0.1:11434', 
    model: string = 'gemma3:4b',
    pastTrades: Trade[] = [],
    currentPosition: Position | null = null // New: Pass current position
): Promise<AIDecision> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60초 분석 타임아웃 (대기열 고려)

  try {
    const closePrices = candles.map(c => c.close);
    const currentRSI = calculateRSI(closePrices, 9); // RSI 9 for scalping
    const bb = calculateBollingerBands(closePrices, 20, 2);
    const macd = calculateMACD(closePrices);

    const recentData = candles.slice(-15);
    const currentPrice = closePrices[closePrices.length - 1];

    // Construct Feedback String
    let feedbackContext = "";
    if (pastTrades.length > 0) {
        const history = pastTrades.map((t, i) => {
            const pnl = t.realizedPnL || 0;
            const result = pnl > 0 ? "익절(성공)" : "손절(실패)";
            return `${i+1}. ${t.side === 'Buy' ? 'LONG' : 'SHORT'} -> ${result} (${pnl.toFixed(2)} USDT) | 당시 근거: ${t.entryReason || '없음'}`;
        }).join('\n');
        
        feedbackContext = `
        [자가 피드백 데이터 - 최근 매매 기록]
        ${history}
        위 과거 기록을 보고, 실패한 패턴을 반복하지 않도록 전략을 수정하세요.
        `;
    }

    // Construct Position Context
    let positionContext = "현재 보유 중인 포지션이 없습니다. 적극적으로 신규 진입 자리를 찾으세요.";
    if (currentPosition) {
        const posSide = currentPosition.side === 'Buy' ? 'LONG' : 'SHORT';
        const pnl = currentPosition.unrealizedPnL;
        positionContext = `
        [★중요★ 현재 포지션 보유 중]
        - 방향: ${posSide}
        - 진입가: ${currentPosition.entryPrice}
        - 현재 미실현 손익: ${pnl.toFixed(2)} USDT
        
        행동 지침:
        1. 현재 추세가 내 포지션(${posSide})과 같다면 'HOLD'를 선택하여 수익을 극대화하세요.
        2. 추세가 반전되었다고 확신할 때만 반대 방향(스위칭) 신호를 보내세요. (이 경우 자동으로 청산됩니다.)
        3. 굳이 불필요한 매매를 하지 마세요. 관망도 훌륭한 전략입니다.
        `;
    }

    // Korean Prompt for Local AI
    const prompt = `
    당신은 비트코인 선물(BTC/USDT) 트레이딩 전문가 봇입니다.
    제공된 1분봉 차트 데이터와 보조지표를 분석하여 매매 포지션(LONG, SHORT, HOLD)을 결정하십시오.

    ${positionContext}

    ${feedbackContext}

    시장 데이터:
    - 현재가: ${currentPrice}
    - RSI(9): ${currentRSI?.toFixed(2) || 'N/A'} (과매수/과매도 판단)
    - 볼린저 밴드: 상단 ${bb?.upper.toFixed(2)} / 하단 ${bb?.lower.toFixed(2)}
    - MACD: ${macd?.macdLine.toFixed(2) || 'N/A'}

    매매 전략 (신중한 스캘핑):
    1. 수수료(0.12%)를 고려하여 확실한 수익 구간이 보일 때만 행동하세요.
    2. 애매하면 무조건 HOLD 하세요.

    응답 형식 (JSON):
    반드시 아래 JSON 형식으로만 응답해야 합니다. 마크다운이나 사족을 붙이지 마세요.
    "reasoning"과 "feedback"은 반드시 "한국어"로 작성하세요.

    Example:
    {
      "action": "BUY",
      "confidence": 90,
      "stopLoss": 90000,
      "takeProfit": 91000,
      "reasoning": "RSI가 30 이하에서 반등하고 있으며 볼린저 하단 지지가 확인됨.",
      "feedback": "지난번 손실을 만회하기 위해 더 보수적으로 진입 시점을 잡음."
    }
    `;

    const cleanUrl = normalizeUrl(baseUrl);

    const response = await fetchWithRetry(`${cleanUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        signal: controller.signal,
        body: JSON.stringify({
            model: model,
            prompt: prompt,
            stream: false,
            format: "json"
        })
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
        if (response.status === 404) {
             throw new Error(`모델 '${model}'을(를) 찾을 수 없습니다.`);
        }
        throw new Error(`Ollama connection failed: ${response.statusText}`);
    }

    const result = await response.json();
    
    try {
        let cleanJson = result.response;
        const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            cleanJson = jsonMatch[0];
        }

        const decision = JSON.parse(cleanJson);
        const action = (decision.action || 'HOLD').toUpperCase();
        
        return {
            action: ['BUY', 'SELL', 'HOLD'].includes(action) ? (action as any) : 'HOLD',
            confidence: Number(decision.confidence) || 0,
            reasoning: decision.reasoning || "분석 결과 없음",
            feedback: decision.feedback || "피드백 데이터 부족",
            stopLoss: decision.stopLoss ? Number(decision.stopLoss) : undefined,
            takeProfit: decision.takeProfit ? Number(decision.takeProfit) : undefined
        };
    } catch (parseError) {
        console.error("Failed to parse Ollama JSON:", result.response);
        return { action: 'HOLD', confidence: 0, reasoning: "Ollama 응답 파싱 실패", feedback: "분석 실패" };
    }

  } catch (error: any) {
    clearTimeout(timeoutId);
    console.error("Ollama Analysis Failed:", error);
    throw error;
  }
};

// --- New Chat Functionality ---
export const chatWithOllama = async (
    message: string,
    candles: Candle[],
    trades: Trade[],
    baseUrl: string,
    model: string
): Promise<string> => {
    try {
        const closePrices = candles.map(c => c.close);
        const currentRSI = calculateRSI(closePrices, 9);
        const currentPrice = closePrices[closePrices.length - 1];
        const recentHistory = candles.slice(-20).map(c => ({ t: new Date(c.time).toLocaleTimeString(), p: c.close }));
        
        const prompt = `
        [System]
        당신은 비트코인 트레이딩 전문가 AI 어시스턴트입니다.
        현재 실행 중인 로컬 AI 모델은 "${model}"입니다. 
        사용자가 어떤 AI 모델을 사용 중인지 물어보면, 위 모델 이름을 정확하게 답변하십시오.
        
        사용자의 질문에 대해 현재 시장 데이터와 거래 내역을 기반으로 분석적인 답변을 제공하세요.
        답변은 반드시 "한국어"로 친절하고 명확하게 작성하세요.

        [Market Context]
        - 현재가: ${currentPrice}
        - RSI(9): ${currentRSI?.toFixed(2) || 'N/A'}
        - 최근 20분 가격 추이: ${JSON.stringify(recentHistory)}
        - 최근 거래 내역: ${JSON.stringify(trades.slice(-5))}

        [User Question]
        ${message}
        `;

        const cleanUrl = normalizeUrl(baseUrl);
        const response = await fetchWithRetry(`${cleanUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'omit',
            body: JSON.stringify({
                model: model,
                prompt: prompt,
                stream: false,
            })
        });

        if (!response.ok) throw new Error("Chat request failed");
        const result = await response.json();
        return result.response;

    } catch (e: any) {
        console.error("Chat Error:", e);
        return `오류가 발생했습니다: ${e.message}`;
    }
};
