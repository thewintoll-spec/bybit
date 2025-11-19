
import React, { useState, useEffect } from 'react';
import { validateBybitKeys } from '../services/bybitService';
import { getOllamaModels } from '../services/ollamaService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (key: string, secret: string, balance: number, baseUrl: string, leverage: number) => void;
  
  // AI Settings (Local Only)
  ollamaUrl: string;
  ollamaModel: string;
  onSaveAISettings: (url: string, model: string) => void;
}

const ENVIRONMENTS = [
    { name: 'Bybit 데모 트레이딩 (Demo Trading)', url: 'https://api-demo.bybit.com' },
];

const SettingsModal: React.FC<SettingsModalProps> = ({ 
    isOpen, onClose, onConnect,
    ollamaUrl, ollamaModel, onSaveAISettings
}) => {
  // Bybit State
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [baseUrl, setBaseUrl] = useState(ENVIRONMENTS[0].url);
  const [leverage, setLeverage] = useState(10);
  
  // AI State
  const [localUrl, setLocalUrl] = useState(ollamaUrl);
  const [localModel, setLocalModel] = useState(ollamaModel);
  const [availableModels, setAvailableModels] = useState<string[]>([]); // List of fetched models
  
  // OS Selection for Help Command
  const [osType, setOsType] = useState<'win-cmd' | 'win-ps' | 'mac'>('win-cmd');

  const [isLoading, setIsLoading] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | null; text: string }>({ type: null, text: '' });
  const [ollamaMsg, setOllamaMsg] = useState<{ type: 'success' | 'error' | null; text: string }>({ type: null, text: '' });

  // Reset message when opening
  useEffect(() => {
      if (isOpen) {
          setOllamaMsg({ type: null, text: '' });
      }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFetchModels = async () => {
      setIsModelLoading(true);
      setOllamaMsg({ type: null, text: '모델 목록 조회 중...' });
      
      try {
          // Wrap in try-finally to ensure loading state is reset
          const result = await getOllamaModels(localUrl);
          
          if (result.success) {
              setAvailableModels(result.models);
              setOllamaMsg({ type: 'success', text: `${result.message} (${result.models.length}개 발견)` });
              
              // If current model is not in list, default to first one
              if (result.models.length > 0 && !result.models.includes(localModel)) {
                  setLocalModel(result.models[0]);
              }
          } else {
              setAvailableModels([]);
              setOllamaMsg({ type: 'error', text: result.message });
          }
      } catch (error: any) {
          setOllamaMsg({ type: 'error', text: `오류 발생: ${error.message}` });
      } finally {
          setIsModelLoading(false);
      }
  };

  const handleCheck = async () => {
    if (!localModel) {
        setOllamaMsg({ type: 'error', text: "사용할 AI 모델을 선택해주세요." });
        return;
    }

    // Save AI Settings first
    onSaveAISettings(localUrl, localModel);

    if (!apiKey || !apiSecret) {
        setStatusMsg({ type: 'error', text: 'API 키와 시크릿을 입력해주세요.' });
        return;
    }

    setIsLoading(true);
    setStatusMsg({ type: null, text: '키 검증 중...' });

    const result = await validateBybitKeys(baseUrl, apiKey, apiSecret);

    setIsLoading(false);
    if (result.success) {
        setStatusMsg({ type: 'success', text: `${result.message} (잔고: ${result.balance} USDT)` });
        setTimeout(() => {
            onConnect(apiKey, apiSecret, result.balance || 0, baseUrl, leverage);
            onClose();
        }, 1000);
    } else {
        setStatusMsg({ type: 'error', text: result.message });
    }
  };

  const getOllamaCommand = (os: 'win-cmd' | 'win-ps' | 'mac') => {
      switch(os) {
          case 'win-cmd': return 'set OLLAMA_ORIGINS=* && ollama serve';
          case 'win-ps': return '$env:OLLAMA_ORIGINS="*"; ollama serve';
          case 'mac': return 'OLLAMA_ORIGINS="*" ollama serve';
      }
      return '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#1e2026] w-full max-w-lg rounded-lg border border-gray-700 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            ⚙️ 봇 설정 (Exchange & AI)
          </h2>
          
          {/* --- AI Settings Section --- */}
          <div className="mb-8 p-4 bg-[#0b0e11] rounded border border-gray-700">
              <h3 className="text-sm font-bold text-green-400 mb-3 uppercase">1. AI 모델 설정 (Local Ollama)</h3>
              
              <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                   <div>
                       <label className="text-xs text-gray-400 block mb-1">Ollama URL</label>
                       <div className="flex gap-2">
                           <input 
                                type="text" 
                                value={localUrl}
                                onChange={(e) => setLocalUrl(e.target.value)}
                                placeholder="http://127.0.0.1:11434"
                                className="flex-1 bg-[#1e2026] border border-gray-600 rounded px-3 py-2 text-sm text-white focus:border-[#fcd535] outline-none"
                           />
                           <button 
                                onClick={handleFetchModels}
                                disabled={isModelLoading}
                                className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded text-xs whitespace-nowrap font-bold"
                           >
                               {isModelLoading ? '조회 중...' : '모델 목록 조회'}
                           </button>
                       </div>
                       <p className="text-[9px] text-gray-500 mt-1">* 기본값: http://127.0.0.1:11434 (Windows는 localhost 대신 127.0.0.1 권장)</p>
                   </div>
                   
                   <div>
                       <label className="text-xs text-gray-400 block mb-1">사용할 모델 선택</label>
                       {availableModels.length > 0 ? (
                           <select 
                                value={localModel}
                                onChange={(e) => setLocalModel(e.target.value)}
                                className="w-full bg-[#1e2026] border border-gray-600 rounded px-3 py-2 text-sm text-white focus:border-[#fcd535] outline-none"
                           >
                               {availableModels.map((model) => (
                                   <option key={model} value={model}>{model}</option>
                               ))}
                           </select>
                       ) : (
                           <div className="relative">
                                <input 
                                        type="text" 
                                        value={localModel}
                                        onChange={(e) => setLocalModel(e.target.value)}
                                        placeholder="먼저 [모델 목록 조회] 버튼을 누르세요"
                                        className="w-full bg-[#1e2026] border border-gray-600 rounded px-3 py-2 text-sm text-white focus:border-[#fcd535] outline-none opacity-50"
                                        readOnly
                                />
                                <div className="absolute inset-0 bg-transparent cursor-not-allowed" title="모델 목록을 먼저 조회해주세요"></div>
                           </div>
                       )}
                       {availableModels.length === 0 && (
                           <p className="text-[9px] text-gray-500 mt-1">
                               * 목록이 안 보이면 '모델 목록 조회'를 누르거나 Ollama가 실행 중인지 확인하세요.
                           </p>
                       )}
                   </div>

                   {/* Error Message & Troubleshooting */}
                   {ollamaMsg.text && (
                       <div className={`text-xs p-2 rounded mt-2 border ${ollamaMsg.type === 'success' ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                           {ollamaMsg.text}
                           
                           {/* Troubleshooting Guide */}
                           {ollamaMsg.type === 'error' && (
                               <div className="mt-2 pt-2 border-t border-red-500/20">
                                   <p className="font-bold mb-1">⚠️ 연결 실패 시 해결 방법 (터미널 실행):</p>
                                   
                                   {window.location.protocol === 'https:' && (
                                        <p className="mb-2 text-yellow-400 font-bold">
                                            * HTTPS 환경에서는 로컬 연결이 차단됩니다. 로컬(http://localhost)에서 실행하세요.
                                        </p>
                                   )}

                                   <div className="flex gap-1 mb-2">
                                       <button onClick={() => setOsType('win-cmd')} className={`text-[9px] px-2 py-1 rounded border ${osType === 'win-cmd' ? 'bg-gray-600 border-gray-400 text-white' : 'border-gray-600 text-gray-400'}`}>Win (CMD)</button>
                                       <button onClick={() => setOsType('win-ps')} className={`text-[9px] px-2 py-1 rounded border ${osType === 'win-ps' ? 'bg-gray-600 border-gray-400 text-white' : 'border-gray-600 text-gray-400'}`}>Win (PS)</button>
                                       <button onClick={() => setOsType('mac')} className={`text-[9px] px-2 py-1 rounded border ${osType === 'mac' ? 'bg-gray-600 border-gray-400 text-white' : 'border-gray-600 text-gray-400'}`}>Mac/Linux</button>
                                   </div>

                                   <div className="bg-black p-2 rounded font-mono text-[9px] text-gray-300 break-all relative group">
                                       {getOllamaCommand(osType)}
                                       <button 
                                          onClick={() => navigator.clipboard.writeText(getOllamaCommand(osType))}
                                          className="absolute right-1 top-1 bg-gray-700 px-1.5 rounded opacity-0 group-hover:opacity-100 text-white"
                                       >
                                          Copy
                                       </button>
                                   </div>
                                   <p className="mt-1 text-[9px] text-red-300 font-bold">
                                       * 중요: 기존 Ollama 아이콘 우클릭 → 'Quit Ollama' 후 실행하세요.
                                   </p>
                                   <p className="text-[9px] text-gray-400 mt-1">
                                       (만약 "bind: Only one usage" 에러가 뜨면 이미 실행 중인 겁니다. 끄고 다시 하세요.)
                                   </p>
                               </div>
                           )}
                       </div>
                   )}

                   {/* AI Only Save Button */}
                   <button 
                        onClick={() => {
                            if (!localModel) {
                                setOllamaMsg({ type: 'error', text: "모델을 선택해주세요." });
                                return;
                            }
                            onSaveAISettings(localUrl, localModel);
                            setOllamaMsg({ type: 'success', text: `AI 모델이 '${localModel}'로 변경되었습니다!` });
                            setTimeout(onClose, 1000); // 1초 뒤 닫기
                        }}
                        className="w-full mt-3 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded text-xs font-bold border border-gray-600 transition-colors"
                   >
                       🔄 AI 모델만 즉시 변경 (매매 유지)
                   </button>
              </div>
          </div>

          {/* --- Bybit Keys Section --- */}
          <div className="space-y-4">
              <h3 className="text-sm font-bold text-[#fcd535] uppercase">2. Bybit API 연결</h3>
              <div>
                <label className="text-xs text-gray-400 block mb-1">연결할 서버 (Environment)</label>
                <select 
                    value={baseUrl} 
                    onChange={(e) => setBaseUrl(e.target.value)}
                    className="w-full bg-[#0b0e11] border border-gray-600 rounded px-3 py-2 text-sm text-white focus:border-[#fcd535] outline-none"
                >
                    {ENVIRONMENTS.map(env => (
                        <option key={env.url} value={env.url}>{env.name}</option>
                    ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1">API Key</label>
                <input 
                  type="text" 
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Bybit API Key 입력"
                  className="w-full bg-[#0b0e11] border border-gray-600 rounded px-3 py-2 text-sm text-white focus:border-[#fcd535] outline-none font-mono"
                />
              </div>
              
              <div>
                <label className="text-xs text-gray-400 block mb-1">API Secret</label>
                <input 
                  type="password" 
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  placeholder="Bybit API Secret 입력"
                  className="w-full bg-[#0b0e11] border border-gray-600 rounded px-3 py-2 text-sm text-white focus:border-[#fcd535] outline-none font-mono"
                />
              </div>

              <div>
                  <label className="text-xs text-gray-400 block mb-1 flex justify-between">
                      <span>레버리지 설정 (Leverage)</span>
                      <span className="text-[#fcd535] font-bold">{leverage}x</span>
                  </label>
                  <input 
                      type="range" 
                      min="1" max="50" step="1"
                      value={leverage}
                      onChange={(e) => setLeverage(parseInt(e.target.value))}
                      className="w-full accent-[#fcd535] h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-gray-500 mt-1">
                      <span>1x (안전)</span>
                      <span>25x</span>
                      <span>50x (위험)</span>
                  </div>
              </div>
          </div>

          {statusMsg.text && (
              <div className={`mt-4 text-xs p-2 rounded text-center font-bold ${statusMsg.type === 'success' ? 'bg-green-500/20 text-green-400' : statusMsg.type === 'error' ? 'bg-red-500/20 text-red-400' : 'text-gray-400'}`}>
                  {statusMsg.text}
              </div>
          )}

          <div className="mt-6 flex gap-3">
             <button 
                onClick={onClose}
                className="flex-1 py-3 rounded font-bold text-sm bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
              >
                취소
              </button>
              <button 
                onClick={handleCheck}
                disabled={isLoading}
                className={`flex-1 py-3 rounded font-bold text-sm text-black transition-colors ${isLoading ? 'bg-gray-500 cursor-not-allowed' : 'bg-[#fcd535] hover:bg-[#e4c02f]'}`}
              >
                {isLoading ? '연결 확인 중...' : '저장 및 연결'}
              </button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
