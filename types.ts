
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Trade {
  id: string;
  symbol: string;
  side: 'Buy' | 'Sell';
  price: number;
  amount: number;
  timestamp: number;
  status: 'Open' | 'Closed';
  stopLoss?: number;
  takeProfit?: number;
  fee?: number;        // 수수료
  realizedPnL?: number; // 실현 손익
  entryReason?: string; // 진입 당시 AI 근거 (피드백용)
}

export interface Position {
  symbol: string;
  side: 'Buy' | 'Sell';
  size: number;
  entryPrice: number;
  leverage: number;
  unrealizedPnL: number;
  estEntryFee?: number; // 추정 진입 수수료
  liquidationPrice?: number;
}

export interface AIDecision {
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reasoning: string;
  stopLoss?: number;
  takeProfit?: number;
  feedback?: string; // AI 자가 피드백 (반성 및 전략 수정)
}

export interface AIDecisionLog extends AIDecision {
  timestamp: number;
}

export interface Wallet {
  balanceUSDT: number;
  balanceBTC: number;
  todayRealizedPnL?: number; // 금일 실현 손익
}

export enum LoadingState {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}