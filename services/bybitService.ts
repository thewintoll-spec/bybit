
import { Position } from '../types';

export interface BybitResponse {
  retCode: number;
  retMsg: string;
  result: any;
}

// Helper to generate HMAC-SHA256 signature using Web Crypto API
async function hmacSha256(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const msgData = encoder.encode(message);

  const cryptoKey = await window.crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await window.crypto.subtle.sign("HMAC", cryptoKey, msgData);
  
  // Convert ArrayBuffer to Hex string
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// Generic helper for Bybit Requests
async function bybitRequest(
    baseUrl: string,
    endpoint: string, 
    method: 'GET' | 'POST', 
    params: Record<string, any>, 
    apiKey: string, 
    apiSecret: string
) {
    const timestamp = Date.now().toString();
    const recvWindow = "5000";
    
    let queryString = "";
    let bodyString = "";
    let payload = "";

    if (method === 'GET') {
        queryString = new URLSearchParams(params).toString();
        payload = timestamp + apiKey + recvWindow + queryString;
    } else {
        // Filter out undefined values from params
        const cleanParams = Object.fromEntries(Object.entries(params).filter(([_, v]) => v !== undefined));
        bodyString = JSON.stringify(cleanParams);
        payload = timestamp + apiKey + recvWindow + bodyString;
    }

    const signature = await hmacSha256(apiSecret, payload);
    const url = `${baseUrl}${endpoint}${queryString ? '?' + queryString : ''}`;

    const headers: HeadersInit = {
        'X-BAPI-API-KEY': apiKey,
        'X-BAPI-SIGN': signature,
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': recvWindow,
        'Content-Type': 'application/json; charset=utf-8'
    };

    try {
        const response = await fetch(url, {
            method,
            headers,
            body: method === 'POST' ? bodyString : undefined
        });

        const text = await response.text();
        
        if (!response.ok) {
            throw new Error(`HTTP 오류 ${response.status}: ${text}`);
        }

        if (!text) {
            throw new Error("Bybit API로부터 빈 응답을 받았습니다.");
        }

        try {
            return JSON.parse(text);
        } catch (e) {
             console.error("JSON Parse Error:", text);
             throw new Error(`서버 응답 형식이 올바르지 않습니다 (JSON 파싱 실패).`);
        }

    } catch (error) {
        console.error("Bybit Request Failed:", error);
        throw error;
    }
}

export const validateBybitKeys = async (baseUrl: string, apiKey: string, apiSecret: string): Promise<{ success: boolean; balance?: number; message: string }> => {
  try {
    // Check Unified Trading Account wallet balance
    const data = await bybitRequest(
        baseUrl,
        '/v5/account/wallet-balance', 
        'GET', 
        { accountType: 'UNIFIED', coin: 'USDT' }, 
        apiKey, 
        apiSecret
    );

    if (data.retCode === 0) {
        const account = data.result?.list?.[0];
        const usdtCoin = account?.coin?.find((c: any) => c.coin === 'USDT');
        const balance = usdtCoin ? usdtCoin.walletBalance : account?.totalWalletBalance;
        
        return { 
            success: true, 
            balance: parseFloat(balance || 0),
            message: "연결 성공!" 
        };
    } else {
        return { 
            success: false, 
            message: `Bybit 오류: ${data.retMsg} (코드: ${data.retCode})` 
        };
    }
  } catch (error: any) {
    return { 
        success: false, 
        message: error.message || "네트워크 오류. 콘솔을 확인하세요." 
    };
  }
};

export const placeOrder = async (
    baseUrl: string,
    apiKey: string, 
    apiSecret: string, 
    side: 'Buy' | 'Sell', 
    qty: number,
    reduceOnly: boolean = false
): Promise<{ success: boolean; orderId?: string; price?: number; message: string }> => {
    try {
        const params = {
            category: 'linear',
            symbol: 'BTCUSDT',
            side: side,
            orderType: 'Market',
            qty: qty.toString(),
            reduceOnly: reduceOnly
        };

        const data = await bybitRequest(
            baseUrl,
            '/v5/order/create',
            'POST',
            params,
            apiKey,
            apiSecret
        );

        if (data.retCode === 0) {
            return {
                success: true,
                orderId: data.result.orderId,
                message: `주문 체결됨: ${side === 'Buy' ? 'Long' : 'Short'} ${qty} BTC`
            };
        } else {
            return {
                success: false,
                message: `주문 실패: ${data.retMsg} (${data.retCode})`
            };
        }

    } catch (e: any) {
        return {
            success: false,
            message: `실행 오류: ${e.message}`
        };
    }
}

export const getWalletBalance = async (baseUrl: string, apiKey: string, apiSecret: string): Promise<number> => {
    try {
        const data = await bybitRequest(
            baseUrl,
            '/v5/account/wallet-balance', 
            'GET', 
            { accountType: 'UNIFIED', coin: 'USDT' }, 
            apiKey, 
            apiSecret
        );
        if (data.retCode === 0) {
            const account = data.result?.list?.[0];
            const usdtCoin = account?.coin?.find((c: any) => c.coin === 'USDT');
            return parseFloat(usdtCoin ? usdtCoin.walletBalance : (account?.totalWalletBalance || 0));
        }
    } catch (e) {
        console.error("잔고 조회 실패", e);
    }
    return 0;
};

export const getPosition = async (
    baseUrl: string,
    apiKey: string,
    apiSecret: string
): Promise<Position | null> => {
    try {
        const data = await bybitRequest(
            baseUrl,
            '/v5/position/list',
            'GET',
            { category: 'linear', symbol: 'BTCUSDT' },
            apiKey,
            apiSecret
        );

        if (data.retCode === 0 && data.result?.list?.length > 0) {
            // Find the active position (size > 0)
            const pos = data.result.list.find((p: any) => parseFloat(p.size) > 0);
            
            if (pos) {
                const size = parseFloat(pos.size);
                const entryPrice = parseFloat(pos.avgPrice);
                
                // Calculate Estimated Entry Fee
                // Standard Taker Fee is around 0.055% (0.00055)
                const TAKER_FEE_RATE = 0.00055;
                const estEntryFee = size * entryPrice * TAKER_FEE_RATE;

                return {
                    symbol: pos.symbol,
                    side: pos.side, // 'Buy' or 'Sell'
                    size: size,
                    entryPrice: entryPrice,
                    leverage: parseFloat(pos.leverage),
                    unrealizedPnL: parseFloat(pos.unrealisedPnl),
                    estEntryFee: estEntryFee,
                    liquidationPrice: pos.liqPrice ? parseFloat(pos.liqPrice) : undefined
                };
            }
        }
    } catch (e) {
        console.error("포지션 조회 실패", e);
    }
    return null;
};

// 최근 청산된 거래의 PnL과 수수료 정보를 가져옵니다.
export const getLastClosedPnL = async (
    baseUrl: string,
    apiKey: string,
    apiSecret: string
): Promise<{ closedPnl: number; fee: number; grossPnl: number; netPnl: number } | null> => {
    try {
        // Fetch Closed PnL for Linear (Futures)
        const data = await bybitRequest(
            baseUrl,
            '/v5/position/closed-pnl',
            'GET',
            { category: 'linear', symbol: 'BTCUSDT', limit: '1' },
            apiKey,
            apiSecret
        );

        if (data.retCode === 0 && data.result?.list?.length > 0) {
            const item = data.result.list[0];
            
            // 'closedPnl' in Bybit response is usually Gross PnL (excluding fees)
            const grossPnl = parseFloat(item.closedPnl);
            
            let fee = 0;
            
            // 1. Try to get explicit fee from response
            if (item.cumEntryFee && parseFloat(item.cumEntryFee) > 0) {
                fee = parseFloat(item.cumEntryFee) + parseFloat(item.cumExitFee || '0');
            } 
            // 2. Fallback: Calculate from Value * Taker Fee (0.055%)
            else {
                const entryVal = parseFloat(item.cumEntryValue || '0');
                const exitVal = parseFloat(item.cumExitValue || '0');
                // Using 0.055% as standard taker fee for estimation if API returns 0
                fee = (entryVal + exitVal) * 0.00055; 
            }

            // Net PnL = Gross PnL - Fees
            // Note: If PnL is negative, subtracting fee makes it more negative.
            const netPnl = grossPnl - fee;

            return { 
                grossPnl: grossPnl,
                fee: fee,
                closedPnl: grossPnl, // Deprecated alias
                netPnl: netPnl
            };
        }
    } catch (e) {
        console.error("PnL 조회 실패", e);
    }
    return null;
};

export const getTodayRealizedPnL = async (
    baseUrl: string,
    apiKey: string,
    apiSecret: string
): Promise<number> => {
    try {
        // Start of today (UTC)
        const now = new Date();
        const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).getTime();

        const data = await bybitRequest(
            baseUrl,
            '/v5/position/closed-pnl',
            'GET',
            { 
                category: 'linear', 
                symbol: 'BTCUSDT', 
                startTime: startOfDay.toString(),
                limit: '50' // Max limit for simple sum
            },
            apiKey,
            apiSecret
        );

        if (data.retCode === 0 && data.result?.list) {
            return data.result.list.reduce((acc: number, item: any) => {
                const grossPnl = parseFloat(item.closedPnl);
                // Estimate fee if not present
                let fee = 0;
                if (item.cumEntryFee && parseFloat(item.cumEntryFee) > 0) {
                    fee = parseFloat(item.cumEntryFee) + parseFloat(item.cumExitFee || '0');
                } else {
                    const entryVal = parseFloat(item.cumEntryValue || '0');
                    const exitVal = parseFloat(item.cumExitValue || '0');
                    fee = (entryVal + exitVal) * 0.00055;
                }
                return acc + (grossPnl - fee); // Net PnL
            }, 0);
        }
    } catch (e) {
        console.error("금일 손익 조회 실패", e);
    }
    return 0;
};

export const setLeverage = async (
    baseUrl: string,
    apiKey: string,
    apiSecret: string,
    leverage: number
) => {
    try {
        await bybitRequest(
            baseUrl,
            '/v5/position/set-leverage',
            'POST',
            { category: 'linear', symbol: 'BTCUSDT', buyLeverage: leverage.toString(), sellLeverage: leverage.toString() },
            apiKey,
            apiSecret
        );
        console.log(`Leverage set to ${leverage}x`);
    } catch (e: any) {
        if (!e.message.includes("not modified")) {
            console.warn("Set Leverage Warning:", e.message);
        }
    }
}
