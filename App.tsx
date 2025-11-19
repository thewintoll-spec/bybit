
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Candle, Wallet, Trade, AIDecision, Position, AIDecisionLog } from './types';
import { fetchMarketData, fetchLatestCandle } from './services/marketService';
import { analyzeMarketOllama } from './services/ollamaService';
import { placeOrder, getWalletBalance, setLeverage, getLastClosedPnL, getPosition, getTodayRealizedPnL } from './services/bybitService';
import Chart from './components/Chart';
import TradingPanel from './components/TradingPanel';
import SettingsModal from './components/SettingsModal';
import ChatInterface from './components/ChatInterface';

const App: React.FC = () => {
  // Data State
  const [candles, setCandles] = useState<Candle[]>([]);
  const [wallet, setWallet] = useState<Wallet>({ balanceUSDT: 10000, balanceBTC: 0, todayRealizedPnL: 0 });
  const [trades, setTrades] = useState<Trade[]>([]);
  const [currentPosition, setCurrentPosition] = useState<Position | null>(null);
  const [isAutoTrading, setIsAutoTrading] = useState(false);
  const [lastDecision, setLastDecision] = useState<AIDecision | null>(null);
  const [aiHistory, setAiHistory] = useState<AIDecisionLog[]>([]); // History log
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [systemLogs, setSystemLogs] = useState<string[]>([]);
  
  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [bybitConfig, setBybitConfig] = useState<{key: string, secret: string, baseUrl: string, leverage: number} | null>(null);
  
  // AI Settings (Local Only)
  const [ollamaUrl, setOllamaUrl] = useState('http://127.0.0.1:11434');
  const [ollamaModel, setOllamaModel] = useState('gemma3:4b');

  // Refs
  const walletRef = useRef(wallet);
  const candlesRef = useRef(candles);
  const isAutoTradingRef = useRef(isAutoTrading);
  const bybitConfigRef = useRef(bybitConfig);
  const tradesRef = useRef(trades);
  const currentPositionRef = useRef(currentPosition);
  const lastAiCallRef = useRef<number>(0);

  // Sync Refs
  useEffect(() => { walletRef.current = wallet; }, [wallet]);
  useEffect(() => { candlesRef.current = candles; }, [candles]);
  useEffect(() => { isAutoTradingRef.current = isAutoTrading; }, [isAutoTrading]);
  useEffect(() => { bybitConfigRef.current = bybitConfig; }, [bybitConfig]);
  useEffect(() => { tradesRef.current = trades; }, [trades]);
  useEffect(() => { currentPositionRef.current = currentPosition; }, [currentPosition]);

  const addLog = (msg: string) => {
      setSystemLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 49)]);
  };

  const updateWalletData = async () => {
      const config = bybitConfigRef.current;
      if (config) {
          const bal = await getWalletBalance(config.baseUrl, config.key, config.secret);
          const pnl = await getTodayRealizedPnL(config.baseUrl, config.key, config.secret);
          if (bal > 0) {
              setWallet(prev => ({ ...prev, balanceUSDT: bal, todayRealizedPnL: pnl }));
          }
      }
  };

  // Init
  useEffect(() => {
    const initData = async () => {
        addLog("Bybit 메인넷(선물) 시장 데이터 연결 중...");
        const data = await fetchMarketData(100);
        setCandles(data);
    };
    initData();
  }, []);

  const handleConnectBybit = async (key: string, secret: string, initialBalance: number, baseUrl: string, leverage: number = 10) => {
      setBybitConfig({ key, secret, baseUrl, leverage });
      if (initialBalance > 0) setWallet(prev => ({ ...prev, balanceUSDT: initialBalance }));
      
      addLog(`레버리지 ${leverage}배 설정 중...`);
      await setLeverage(baseUrl, key, secret, leverage);
      await updateWalletData();
      addLog(`Bybit 데모 트레이딩 API 연결 성공.`);
  };

  const handleSaveAISettings = (url: string, model: string) => {
      setOllamaUrl(url);
      setOllamaModel(model);
      addLog(`AI 설정 변경됨: Local Ollama (${model})`);
  };

  // --- Trade Logic (Execute & Close) ---
  const executeTrade = useCallback(async (decision: AIDecision, currentPrice: number) => {
    const currentWallet = walletRef.current;
    const config = bybitConfigRef.current;
    const existingPosition = currentPositionRef.current;
    
    if (decision.action === 'HOLD') return;
    if (existingPosition) {
         addLog(`진입 불가: 이미 포지션 보유 중 (${existingPosition.side})`);
         return;
    }

    const leverage = config ? config.leverage : 1;
    const availableUSDT = currentWallet.balanceUSDT;
    const safeUsdtAmount = availableUSDT * 0.98 * leverage; 
    const tradeAmountBTC = Math.floor((safeUsdtAmount / currentPrice) * 1000) / 1000;

    if (tradeAmountBTC < 0.001) {
        addLog(`주문 취소: 잔고 부족 (최소 0.001 BTC 필요)`);
        return;
    }

    const actionLabel = decision.action === 'BUY' ? 'LONG' : 'SHORT';

    if (config) {
        addLog(`AI 신호: ${actionLabel}. 주문 실행 (${tradeAmountBTC} BTC)...`);
        const result = await placeOrder(config.baseUrl, config.key, config.secret, decision.action === 'BUY' ? 'Buy' : 'Sell', tradeAmountBTC);
        
        if (result.success) {
            addLog(`성공: ${result.message}`);
            const newTrade: Trade = {
                id: result.orderId || Date.now().toString(),
                symbol: 'BTCUSDT',
                side: decision.action === 'BUY' ? 'Buy' : 'Sell',
                price: currentPrice,
                amount: tradeAmountBTC,
                timestamp: Date.now(),
                status: 'Open',
                stopLoss: decision.stopLoss,
                takeProfit: decision.takeProfit,
                entryReason: decision.reasoning // Save reasoning for feedback
            };
            setTrades(prev => [...prev, newTrade]);
            setTimeout(updateWalletData, 1000);
        } else {
            addLog(`실패: ${result.message}`);
        }
    } else {
        // Sim
        addLog(`AI 신호: ${actionLabel}. 시뮬레이션 진입 (${tradeAmountBTC} BTC)`);
        const newTrade: Trade = {
            id: Date.now().toString(),
            symbol: 'BTCUSDT',
            side: decision.action === 'BUY' ? 'Buy' : 'Sell',
            price: currentPrice,
            amount: tradeAmountBTC,
            timestamp: Date.now(),
            status: 'Open',
            stopLoss: decision.stopLoss,
            takeProfit: decision.takeProfit,
            entryReason: decision.reasoning
        };
        setTrades(prev => [...prev, newTrade]);
    }
  }, []);

  const closePosition = useCallback(async (trade: Trade, currentPrice: number, reason: string) => {
      const config = bybitConfigRef.current;
      const side = trade.side === 'Buy' ? 'Sell' : 'Buy';

      if (config) {
          addLog(`${reason}: 포지션 청산 중...`);
          const result = await placeOrder(config.baseUrl, config.key, config.secret, side, trade.amount, true);
          if (result.success) {
              addLog(`청산 완료: ${result.message}`);
              setTimeout(async () => {
                  await updateWalletData();
                  const pnlData = await getLastClosedPnL(config.baseUrl, config.key, config.secret);
                  if (pnlData) {
                      setTrades(prev => prev.map(t => t.id === trade.id ? { ...t, status: 'Closed', realizedPnL: pnlData.netPnl, fee: pnlData.fee } : t));
                      addLog(`수익 확정: ${pnlData.netPnl.toFixed(4)} USDT (수수료 -${pnlData.fee.toFixed(4)})`);
                  } else {
                      setTrades(prev => prev.map(t => t.id === trade.id ? { ...t, status: 'Closed' } : t));
                  }
                  setCurrentPosition(null);
              }, 2500);
          } else {
               addLog(`청산 실패: ${result.message}`);
          }
      } else {
          // Sim
          addLog(`${reason}: 시뮬레이션 포지션 종료.`);
          const rawPnl = trade.side === 'Buy' ? (currentPrice - trade.price) * trade.amount : (trade.price - currentPrice) * trade.amount;
          const fee = currentPrice * trade.amount * 0.0012; // 0.12% round trip sim
          const netPnl = rawPnl - fee;
          setTrades(prev => prev.map(t => t.id === trade.id ? { ...t, status: 'Closed', realizedPnL: netPnl, fee: fee } : t));
          setWallet(prev => ({
               ...prev,
               balanceUSDT: prev.balanceUSDT + netPnl,
               todayRealizedPnL: (prev.todayRealizedPnL || 0) + netPnl
          }));
          addLog(`시뮬레이션 수익: ${netPnl.toFixed(4)} USDT`);
          setCurrentPosition(null);
      }
  }, []);

  // --- Polling Loops ---

  // 1. Position & TP/SL Monitor
  useEffect(() => {
      const loop = setInterval(async () => {
          const config = bybitConfigRef.current;
          
          // Sync Position
          if (config) {
              const pos = await getPosition(config.baseUrl, config.key, config.secret);
              setCurrentPosition(pos);
          } else {
              // Sim Position Sync
              const openTrades = tradesRef.current.filter(t => t.status === 'Open');
              const currentPrice = candlesRef.current.length > 0 ? candlesRef.current[candlesRef.current.length - 1].close : 0;
              if (openTrades.length > 0 && currentPrice > 0) {
                  const t = openTrades[0];
                  const pnl = t.side === 'Buy' ? (currentPrice - t.price) * t.amount : (t.price - currentPrice) * t.amount;
                  setCurrentPosition({
                      symbol: 'BTCUSDT', side: t.side, size: t.amount, entryPrice: t.price, leverage: 1, unrealizedPnL: pnl,
                      estEntryFee: t.price * t.amount * 0.0006
                  });
              } else {
                  setCurrentPosition(null);
              }
          }

          // TP/SL Check
          const currentPrice = candlesRef.current.length > 0 ? candlesRef.current[candlesRef.current.length - 1].close : 0;
          if (currentPrice === 0) return;
          
          const openTrades = tradesRef.current.filter(t => t.status === 'Open');
          openTrades.forEach(t => {
              if (t.side === 'Buy') {
                  if (t.takeProfit && currentPrice >= t.takeProfit) closePosition(t, currentPrice, '익절(TP)');
                  else if (t.stopLoss && currentPrice <= t.stopLoss) closePosition(t, currentPrice, '손절(SL)');
              } else {
                  if (t.takeProfit && currentPrice <= t.takeProfit) closePosition(t, currentPrice, '익절(TP)');
                  else if (t.stopLoss && currentPrice >= t.stopLoss) closePosition(t, currentPrice, '손절(SL)');
              }
          });

      }, 1000);
      return () => clearInterval(loop);
  }, [closePosition]);

  // 2. Market Data & AI Analysis
  useEffect(() => {
      const loop = setInterval(async () => {
          // Update Candles
          const latest = await fetchLatestCandle();
          if (!latest) return;
          
          const currentCandles = candlesRef.current;
          let updatedCandles = [...currentCandles];
          if (updatedCandles.length > 0 && updatedCandles[updatedCandles.length-1].time === latest.time) {
              updatedCandles[updatedCandles.length-1] = latest;
          } else {
              updatedCandles.push(latest);
              if (updatedCandles.length > 100) updatedCandles = updatedCandles.slice(-100);
          }
          setCandles(updatedCandles);

          // AI Logic
          const now = Date.now();
          const cooldown = 2000; // Local AI is fast
          
          if (isAutoTradingRef.current && !isAiThinking && (now - lastAiCallRef.current > cooldown)) {
              setIsAiThinking(true);
              try {
                  // Prepare recent closed trades for feedback
                  const recentClosedTrades = tradesRef.current
                      .filter(t => t.status === 'Closed')
                      .slice(-5);

                  const decision = await analyzeMarketOllama(
                      updatedCandles, 
                      ollamaUrl, 
                      ollamaModel,
                      recentClosedTrades, // Pass feedback data
                      currentPositionRef.current // ★ PASS CURRENT POSITION ★
                  );
                  
                  setLastDecision(decision);
                  setAiHistory(prev => [...prev, { ...decision, timestamp: Date.now() }].slice(-20)); // Log to history
                  lastAiCallRef.current = Date.now();

                  const currentPos = currentPositionRef.current;
                  
                  // Position Logic (Auto Liquidation / Entry)
                  if (currentPos) {
                       // Check Reversal
                       const isLong = currentPos.side === 'Buy';
                       // AI says SELL while LONG (and confident) -> Close
                       if (isLong && decision.action === 'SELL' && decision.confidence >= 80) {
                           const tradeToClose = tradesRef.current.find(t => t.status === 'Open') || { 
                               id: 'synced', symbol: currentPos.symbol, side: currentPos.side, price: currentPos.entryPrice, amount: currentPos.size, status: 'Open', timestamp: Date.now() 
                           } as Trade;
                           closePosition(tradeToClose, latest.close, 'AI 추세 전환 (Long -> Short)');
                       }
                       // AI says BUY while SHORT (and confident) -> Close
                       else if (!isLong && decision.action === 'BUY' && decision.confidence >= 80) {
                            const tradeToClose = tradesRef.current.find(t => t.status === 'Open') || { 
                               id: 'synced', symbol: currentPos.symbol, side: currentPos.side, price: currentPos.entryPrice, amount: currentPos.size, status: 'Open', timestamp: Date.now() 
                           } as Trade;
                           closePosition(tradeToClose, latest.close, 'AI 추세 전환 (Short -> Long)');
                       }
                       
                  } else {
                      // Entry
                      if (decision.action !== 'HOLD' && decision.confidence >= 85) {
                          executeTrade(decision, latest.close);
                      }
                  }

              } catch (e: any) {
                  console.error("AI Error:", e);
                  addLog("Ollama 연결 실패. 설정에서 URL(127.0.0.1) 확인.");
                  lastAiCallRef.current = Date.now() + 5000; 
              } finally {
                  setIsAiThinking(false);
              }
          }

      }, 3000);
      return () => clearInterval(loop);
  }, [ollamaUrl, ollamaModel, executeTrade, closePosition]);

  return (
    <div className="min-h-screen bg-[#0b0e11] text-white p-4 md:p-6 font-sans relative">
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)}
        onConnect={handleConnectBybit}
        ollamaUrl={ollamaUrl}
        ollamaModel={ollamaModel}
        onSaveAISettings={handleSaveAISettings}
      />

      <header className="flex justify-between items-center mb-6 pb-4 border-b border-gray-800">
        <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#fcd535] rounded flex items-center justify-center">
               <span className="text-black font-bold text-xs">AI</span>
            </div>
            <div>
                <h1 className="font-bold text-lg leading-none">Bybit AI 트레이더</h1>
                <div className="flex gap-2 text-xs mt-1">
                    <span className="text-gray-500">Engine: <span className="text-green-400">Local Ollama</span></span>
                    <span className="text-gray-500">•</span>
                    <span className="text-gray-500">Market: <span className={bybitConfig ? "text-green-400" : "text-gray-400"}>{bybitConfig ? 'Live Demo' : 'Sim'}</span></span>
                </div>
            </div>
        </div>
        
        <button 
           onClick={() => setIsSettingsOpen(true)}
           className={`text-xs px-4 py-2 rounded border transition-all font-bold ${bybitConfig ? 'border-green-500 bg-green-500/10 text-green-400' : 'border-[#fcd535] text-[#fcd535] hover:bg-[#fcd535] hover:text-black'}`}
        >
           ⚙️ 설정 (거래소/AI)
        </button>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
            <Chart data={candles} trades={trades} />
            <div className="bg-[#161a1e] p-4 rounded-lg border border-gray-800 h-[200px] overflow-y-auto font-mono text-xs">
                <h3 className="text-gray-500 font-bold mb-2 sticky top-0 bg-[#161a1e]">System Log</h3>
                <div className="space-y-1">
                    {systemLogs.map((log, i) => <div key={i} className="text-gray-400 border-b border-gray-800/50 pb-0.5">{log}</div>)}
                    {isAiThinking && <div className="text-[#fcd535] animate-pulse">...AI Thinking (Ollama)...</div>}
                </div>
            </div>
        </div>
        <div className="lg:col-span-1">
            <TradingPanel 
                wallet={wallet} trades={trades} position={currentPosition} lastDecision={lastDecision}
                isAutoTrading={isAutoTrading} onToggleAutoTrade={() => setIsAutoTrading(!isAutoTrading)}
                currentPrice={candles.length > 0 ? candles[candles.length - 1].close : 0}
                isConnected={!!bybitConfig} environmentName={bybitConfig ? 'Demo Trading' : undefined}
                aiModel={ollamaModel}
                aiHistory={aiHistory}
            />
        </div>
      </main>
      
      {/* Chat Bot Interface */}
      <ChatInterface 
         candles={candles}
         trades={trades}
         ollamaUrl={ollamaUrl}
         ollamaModel={ollamaModel}
      />
    </div>
  );
};

export default App;
