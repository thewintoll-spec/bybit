import React from 'react';
import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { Candle, Trade } from '../types';

interface ChartProps {
  data: Candle[];
  trades: Trade[];
}

const Chart: React.FC<ChartProps> = ({ data, trades }) => {
  
  const formatTime = (time: number) => {
    const date = new Date(time);
    return `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  const minPrice = Math.min(...data.map(d => d.low)) * 0.999;
  const maxPrice = Math.max(...data.map(d => d.high)) * 1.001;

  return (
    <div className="w-full h-[400px] bg-[#161a1e] rounded-lg p-4 border border-gray-800">
      <h3 className="text-gray-400 text-sm mb-2 font-semibold">BTC/USDT • 1분봉 (선물)</h3>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data}>
          <defs>
            <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f6465d" stopOpacity={0.1}/>
              <stop offset="95%" stopColor="#f6465d" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="colorUp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#0ecb81" stopOpacity={0.1}/>
              <stop offset="95%" stopColor="#0ecb81" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#2b2f36" vertical={false} />
          <XAxis 
            dataKey="time" 
            tickFormatter={formatTime} 
            stroke="#848e9c" 
            tick={{fontSize: 12}}
            minTickGap={30}
          />
          <YAxis 
            domain={[minPrice, maxPrice]} 
            orientation="right" 
            stroke="#848e9c"
            tick={{fontSize: 12}}
            tickFormatter={(val) => val.toFixed(2)}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1e2026', border: 'none', borderRadius: '4px', color: '#fff' }}
            itemStyle={{ color: '#fff' }}
            labelFormatter={(label) => formatTime(label)}
            formatter={(value: number) => [value.toFixed(2), '가격(USDT)']}
          />
          
          {/* We visualize close price as a line for simplicity in this demo */}
          <Area type="monotone" dataKey="close" stroke="#fcd535" fillOpacity={1} fill="url(#colorUp)" strokeWidth={2} dot={false} />

          {/* Render Trade Markers */}
          {trades.map((trade) => (
             <ReferenceLine 
                key={trade.id} 
                x={trade.timestamp} 
                stroke={trade.side === 'Buy' ? '#0ecb81' : '#f6465d'} 
                label={{ 
                    position: 'top', 
                    value: trade.side === 'Buy' ? 'Long' : 'Short', 
                    fill: trade.side === 'Buy' ? '#0ecb81' : '#f6465d',
                    fontSize: 12,
                    fontWeight: 'bold'
                }} 
             />
          ))}

        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default Chart;