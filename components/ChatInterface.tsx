
import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Loader2, Bot, User } from 'lucide-react';
import { chatWithOllama } from '../services/ollamaService';
import { Candle, Trade } from '../types';

interface ChatInterfaceProps {
  candles: Candle[];
  trades: Trade[];
  ollamaUrl: string;
  ollamaModel: string;
}

interface Message {
  role: 'user' | 'ai';
  text: string;
  time: number;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ candles, trades, ollamaUrl, ollamaModel }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', text: '안녕하세요! 현재 차트나 매매 내역에 대해 궁금한 점이 있으신가요?', time: Date.now() }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = { role: 'user', text: input, time: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
        const response = await chatWithOllama(userMsg.text, candles, trades, ollamaUrl, ollamaModel);
        setMessages(prev => [...prev, { role: 'ai', text: response, time: Date.now() }]);
    } catch (e) {
        setMessages(prev => [...prev, { role: 'ai', text: "죄송합니다. 답변을 생성하는 중에 오류가 발생했습니다.", time: Date.now() }]);
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {/* Chat Window */}
      {isOpen && (
        <div className="bg-[#1e2026] border border-gray-700 w-80 sm:w-96 h-[500px] rounded-lg shadow-2xl mb-4 flex flex-col animate-in slide-in-from-bottom-4 fade-in duration-200 overflow-hidden">
          {/* Header */}
          <div className="bg-[#161a1e] p-3 border-b border-gray-700 flex justify-between items-center">
            <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                <span className="text-sm font-bold text-white">AI 트레이딩 어시스턴트</span>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#0b0e11]">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'ai' ? 'bg-[#fcd535]' : 'bg-gray-600'}`}>
                  {msg.role === 'ai' ? <Bot size={16} className="text-black" /> : <User size={16} className="text-white" />}
                </div>
                <div className={`max-w-[80%] p-3 rounded-lg text-sm leading-relaxed ${
                    msg.role === 'ai' 
                    ? 'bg-[#1e2026] text-gray-200 border border-gray-700 rounded-tl-none' 
                    : 'bg-[#fcd535] text-black font-medium rounded-tr-none'
                }`}>
                   {msg.text}
                   <div className={`text-[9px] mt-1 text-right ${msg.role === 'ai' ? 'text-gray-500' : 'text-black/50'}`}>
                       {new Date(msg.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                   </div>
                </div>
              </div>
            ))}
            {isLoading && (
                <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#fcd535] flex items-center justify-center flex-shrink-0">
                        <Bot size={16} className="text-black" />
                    </div>
                    <div className="bg-[#1e2026] border border-gray-700 p-3 rounded-lg rounded-tl-none flex items-center gap-2">
                        <Loader2 size={14} className="animate-spin text-gray-400" />
                        <span className="text-xs text-gray-400">분석 중...</span>
                    </div>
                </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-3 bg-[#161a1e] border-t border-gray-700">
            <div className="relative">
                <input 
                    type="text" 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="차트에 대해 질문해보세요..."
                    className="w-full bg-[#0b0e11] text-white text-sm rounded-full border border-gray-600 pl-4 pr-12 py-3 focus:border-[#fcd535] outline-none transition-colors"
                />
                <button 
                    onClick={handleSend}
                    disabled={!input.trim() || isLoading}
                    className={`absolute right-1.5 top-1.5 p-1.5 rounded-full transition-colors ${
                        input.trim() && !isLoading ? 'bg-[#fcd535] text-black hover:bg-[#e4c02f]' : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    }`}
                >
                    <Send size={16} />
                </button>
            </div>
          </div>
        </div>
      )}

      {/* Toggle Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95 ${isOpen ? 'bg-gray-700 text-white' : 'bg-[#fcd535] text-black'}`}
      >
        {isOpen ? <X size={24} /> : <MessageSquare size={24} />}
      </button>
    </div>
  );
};

export default ChatInterface;
