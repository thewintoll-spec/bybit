
import React, { useState } from 'react';
import { Wallet, Trade, AIDecision, Position } from '../types';

interface TradingPanelProps {
  wallet: Wallet;
  trades: Trade[];
  position?: Position | null;
  lastDecision: AIDecision | null;
  isAutoTrading: boolean;
  onToggleAutoTrade: () => void;
  currentPrice: number;
  isConnected?: boolean;
  environmentName?: string;
  aiModel?: string; // Added aiModel prop
}

const TradingPanel: React.FC<TradingPanelProps> = ({ 
  wallet, 
  trades, 
  position,
  lastDecision, 
  isAutoTrading, 
  onToggleAutoTrade,
  currentPrice,
  isConnected = false,
  environmentName = '데모 트레이딩',
  aiModel = 'Local AI' // Default value
}) => {
  
  const [activeTab, setActiveTab] = useState<'history' | 'feedback'>('history');

  // Calculate Unrealized PnL for open positions (Simulated) if no real position object
  const openTrades = trades.filter(t => t.status === 'Open');
  const simUnrealizedPnL = openTrades.reduce((acc, trade) => {
    if (trade.side === 'Buy') {
        return acc + ((currentPrice - trade.price) * trade.amount);
    } else {
        return acc + ((trade.price - currentPrice) * trade.amount);
    }
  }, 0);

  // Use Real Position PnL if available, else Sim PnL
  const displayPnL = position ? position.unrealizedPnL : simUnrealizedPnL;
  const hasActivePosition = !!position || openTrades.length > 0;

  // Calculate ROE % (Return on Equity)
  // Margin = (Entry Price * Size) / Leverage
  // ROE = (PnL / Margin) * 100
  const calcEntryPrice = position?.entryPrice || openTrades[0]?.price || 0;
  const calcSize = position?.size || openTrades[0]?.amount || 0;
  const calcLeverage = position?.leverage || 1;
  
  const margin = (calcEntryPrice * calcSize) / (calcLeverage || 1);
  const pnlPercentage = margin > 0 ? (displayPnL / margin) * 100 : 0;

  const todayPnL = wallet.todayRealizedPnL || 0;

  return (
    <div className="flex flex-col gap-4 h-full">
        {/* Wallet Section */}
      <div className="bg-[#161a1e] p-4 rounded-lg border border-gray-800 relative overflow-hidden">
        {isConnected && <div className="absolute top-0 right-0 p-1.5 bg-green-500/10 rounded-bl text-[10px] text-green-400 font-bold border-l border-b border-green-500/20">실시간 ({environmentName})</div>}
        
        <h2 className="text-gray-400 text-xs uppercase tracking-wider mb-3 font-bold">자산 현황 {isConnected ? `(${environmentName})` : '(시뮬레이션)'}</h2>
        <div className="grid grid-cols-2 gap-4">
            <div>
                <span className="text-gray-500 text-xs block">USDT 잔고 (Equity)</span>
                <span className="text-white text-lg font-mono">{wallet.balanceUSDT.toFixed(2)}</span>
            </div>
            <div>
                <span className="text-gray-500 text-xs block">금일 실현 손익 (Today PnL)</span>
                <span className={`text-lg font-mono font-bold ${todayPnL >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                    {todayPnL > 0 ? '+' : ''}{todayPnL.toFixed(2)} USDT
                </span>
            </div>
        </div>
      </div>

      {/* Active Position Card */}
      {hasActivePosition && (
        <div className="bg-[#1e2026] p-4 rounded-lg border border-[#fcd535]/30 shadow-lg shadow-[#fcd535]/5 relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#fcd535]"></div>
            <h2 className="text-[#fcd535] text-xs uppercase tracking-wider mb-3 font-bold flex justify-between">
                현재 보유 포지션
                {position?.leverage && <span className="text-gray-400 text-[10px] border border-gray-600 px-1 rounded">{position.leverage}x</span>}
            </h2>
            
            <div className="grid grid-cols-2 gap-y-2 text-sm">
                <div className="flex flex-col">
                     <span className="text-gray-500 text-[10px]">Symbol / Side</span>
                     <div className="font-bold flex items-center gap-2">
                        BTCUSDT 
                        <span className={`px-1.5 rounded text-[10px] ${
                            (position?.side || openTrades[0]?.side) === 'Buy' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                            {(position?.side || openTrades[0]?.side) === 'Buy' ? 'LONG' : 'SHORT'}
                        </span>
                     </div>
                </div>
                <div className="flex flex-col text-right">
                     <span className="text-gray-500 text-[10px]">Size (BTC)</span>
                     <span className="font-mono">{position?.size || openTrades[0]?.amount}</span>
                </div>
                
                <div className="flex flex-col">
                     <span className="text-gray-500 text-[10px]">진입 가격</span>
                     <span className="font-mono text-gray-300">
                         {(position?.entryPrice || openTrades[0]?.price)?.toLocaleString(undefined, {minimumFractionDigits:2})}
                     </span>
                </div>

                <div className="flex flex-col text-right">
                     <span className="text-gray-500 text-[10px]">미실현 손익 (ROE %)</span>
                     <div className={`font-mono font-bold text-lg flex flex-col items-end leading-tight ${displayPnL >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                        <span>{displayPnL > 0 ? '+' : ''}{displayPnL.toFixed(2)}</span>
                        <span className="text-xs opacity-80">
                            ({pnlPercentage > 0 ? '+' : ''}{pnlPercentage.toFixed(2)}%)
                        </span>
                     </div>
                </div>

                {/* Fee Display */}
                {(position?.estEntryFee || (openTrades[0] && (openTrades[0].amount * openTrades[0].price * 0.0006))) && (
                   <div className="col-span-2 flex justify-between items-center border-t border-gray-700 pt-2 mt-1">
                       <span className="text-gray-500 text-[10px]">진입 수수료 (Est.)</span>
                       <span className="font-mono text-red-400 text-xs">
                           -{position?.estEntryFee?.toFixed(2) || (openTrades[0].amount * openTrades[0].price * 0.0006).toFixed(2)} USDT
                       </span>
                   </div>
                )}
            </div>
        </div>
      )}

      {/* AI Control Section */}
      <div className="bg-[#161a1e] p-4 rounded-lg border border-gray-800 flex-grow flex flex-col">
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-gray-400 text-xs uppercase tracking-wider font-bold">
                AI 자동매매 <span className="text-[#fcd535] ml-1">({aiModel})</span>
            </h2>
            <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isAutoTrading ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`}></span>
                <span className="text-xs text-gray-400">{isAutoTrading ? '작동 중' : '중지됨'}</span>
            </div>
        </div>
        
        <button
            onClick={onToggleAutoTrade}
            className={`w-full py-3 rounded font-bold text-sm transition-all mb-4 ${
                isAutoTrading 
                ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30 border border-red-500/50' 
                : 'bg-[#fcd535] text-black hover:bg-[#e4c02f]'
            }`}
        >
            {isAutoTrading ? 'AI 자동매매 중지' : 'AI 자동매매 시작'}
        </button>

        {/* AI Decision Display (Simplified) */}
        <div className="bg-[#0b0e11] rounded p-3 mb-4 border border-gray-800">
            <h3 className="text-gray-500 text-[10px] uppercase font-bold mb-2">최근 AI 판단</h3>
            {lastDecision ? (
                <div className="flex justify-between items-center">
                    <span className={`text-lg font-black px-3 py-1 rounded ${
                        lastDecision.action === 'BUY' ? 'bg-green-500/20 text-[#0ecb81] border border-green-500/30' : 
                        lastDecision.action === 'SELL' ? 'bg-red-500/20 text-[#f6465d] border border-red-500/30' : 
                        'bg-gray-700 text-gray-300 border border-gray-600'
                    }`}>
                        {lastDecision.action === 'BUY' ? 'LONG 🚀' : lastDecision.action === 'SELL' ? 'SHORT 📉' : 'HOLD ✋'}
                    </span>
                    <div className="text-right">
                         <div className="text-[10px] text-gray-500">신뢰도</div>
                         <div className={`text-lg font-bold ${lastDecision.confidence >= 80 ? 'text-[#fcd535]' : 'text-gray-400'}`}>
                             {lastDecision.confidence}%
                         </div>
                    </div>
                </div>
            ) : (
                <p className="text-xs text-gray-600 italic text-center py-2">
                    데이터 분석 대기 중...
                </p>
            )}
        </div>

        {/* Tabbed Section: History & Feedback (Design Updated) */}
        <div className="mt-auto">
            <div className="flex bg-gray-800/50 p-1 rounded mb-2">
                <button 
                    onClick={() => setActiveTab('history')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded transition-all ${activeTab === 'history' ? 'bg-[#fcd535] text-black shadow' : 'text-gray-400 hover:text-white'}`}
                >
                    📋 최근 거래
                </button>
                <button 
                    onClick={() => setActiveTab('feedback')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded transition-all ${activeTab === 'feedback' ? 'bg-[#fcd535] text-black shadow' : 'text-gray-400 hover:text-white'}`}
                >
                    🤖 AI 피드백
                </button>
            </div>

            {activeTab === 'history' ? (
                <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1 min-h-[100px]">
                    {trades.length === 0 && <p className="text-xs text-gray-600 text-center py-4">거래 내역 없음</p>}
                    {[...trades].reverse().map(trade => (
                        <div key={trade.id} className={`flex flex-col text-xs bg-[#0b0e11] p-2 rounded border-l-2 ${trade.status === 'Closed' ? 'border-gray-600 opacity-70' : 'border-transparent hover:border-[#fcd535]'}`}>
                            <div className="flex justify-between items-center mb-1">
                                <div>
                                    <span className={`font-bold ${trade.side === 'Buy' ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                                        {trade.side === 'Buy' ? 'Long' : 'Short'}
                                    </span>
                                    <span className="text-gray-500 mx-1">•</span>
                                    <span className="text-gray-300">{trade.amount} BTC</span>
                                </div>
                                <div className="text-gray-300">{trade.price.toLocaleString()} USDT</div>
                            </div>
                            
                            {/* Fee and Realized PnL row */}
                            {trade.status === 'Closed' && (
                                 <div className="flex justify-between items-center pt-1 border-t border-gray-800 mt-1 text-[10px]">
                                    <span className="text-gray-500">
                                        수수료: <span className="text-red-400">-{trade.fee?.toFixed(4) || '0.00'}</span>
                                    </span>
                                    <span className="text-gray-500">
                                        손익: <span className={(trade.realizedPnL || 0) >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}>
                                            {(trade.realizedPnL || 0) > 0 ? '+' : ''}{(trade.realizedPnL || 0).toFixed(2)}
                                        </span>
                                    </span>
                                 </div>
                            )}

                             {/* Time */}
                             <div className="text-right text-[9px] text-gray-600 mt-0.5">
                                 {new Date(trade.timestamp).toLocaleTimeString()}
                             </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="bg-[#0b0e11] p-3 rounded border border-gray-800 h-[150px] overflow-y-auto min-h-[100px]">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] text-[#fcd535] border border-[#fcd535] px-1 rounded">SELF-CORRECTION</span>
                        <span className="text-[10px] text-gray-500 font-bold">AI 전략 회고록</span>
                    </div>
                    <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">
                        {lastDecision?.feedback ? lastDecision.feedback : (
                            <span className="text-gray-500 italic">
                                "아직 분석된 피드백이 없습니다. 거래가 종료되면 AI가 복기를 시작합니다."
                            </span>
                        )}
                    </p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default TradingPanel;
