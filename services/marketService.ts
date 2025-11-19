import { Candle } from '../types';

// Fallback price if API fails entirely (Updated to ~91k range)
const DEFAULT_START_PRICE = 91460;

export const generateInitialData = (count: number = 100): Candle[] => {
  const data: Candle[] = [];
  let price = DEFAULT_START_PRICE;
  let time = Date.now() - count * 60 * 1000;

  for (let i = 0; i < count; i++) {
    const volatility = (Math.random() - 0.5) * 200;
    const open = price;
    const close = price + volatility;
    const high = Math.max(open, close) + Math.random() * 50;
    const low = Math.min(open, close) - Math.random() * 50;
    const volume = Math.random() * 10 + 1;

    data.push({
      time,
      open,
      high,
      low,
      close,
      volume
    });

    price = close;
    time += 60 * 1000;
  }
  return data;
};

// Helper to parse Bybit response format
const parseBybitCandle = (item: string[]): Candle => ({
  time: parseInt(item[0]),
  open: parseFloat(item[1]),
  high: parseFloat(item[2]),
  low: parseFloat(item[3]),
  close: parseFloat(item[4]),
  volume: parseFloat(item[5]),
});

export const fetchMarketData = async (count: number = 100): Promise<Candle[]> => {
  try {
    // Using Bybit Mainnet API for real prices (Linear/Futures)
    const res = await fetch(`https://api.bybit.com/v5/market/kline?category=linear&symbol=BTCUSDT&interval=1&limit=${count}`);
    const data = await res.json();

    if (data.retCode === 0 && data.result?.list) {
       // Bybit returns newest first, so reverse for chart (oldest -> newest)
       const candles: Candle[] = data.result.list.map(parseBybitCandle).reverse();
       return candles;
    }
    throw new Error("Bybit API returned invalid structure");
  } catch (e) {
    console.warn("Failed to fetch live data from Bybit Mainnet, using simulation fallback.", e);
    return generateInitialData(count);
  }
};

export const fetchLatestCandle = async (): Promise<Candle | null> => {
  try {
    // Fetch just the latest 1-minute candle (Linear/Futures)
    const res = await fetch(`https://api.bybit.com/v5/market/kline?category=linear&symbol=BTCUSDT&interval=1&limit=1`);
    const data = await res.json();

    if (data.retCode === 0 && data.result?.list?.length > 0) {
       return parseBybitCandle(data.result.list[0]);
    }
    return null;
  } catch (e) {
    console.error("Failed to fetch latest candle:", e);
    return null;
  }
};