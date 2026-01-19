
import React, { useState } from 'react';
import { getNeighborhoodTips } from '@cc-saas/shared';

interface AIChatProps {
  isSimpleMode: boolean;
}

const AIChat: React.FC<AIChatProps> = ({ isSimpleMode }) => {
  const [input, setInput] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setLoading(true);
    setResponse(null);
    const result = await getNeighborhoodTips(input, isSimpleMode);
    setResponse(result);
    setLoading(false);
  };

  const containerClass = isSimpleMode
    ? "bg-white rounded-xl p-6 shadow-sm border border-slate-300"
    : "bg-white rounded-3xl p-6 shadow-xl border-4 border-emerald-400";

  const iconClass = isSimpleMode
    ? "w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-xl"
    : "w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center text-2xl";

  const buttonClass = isSimpleMode
    ? "absolute right-2 top-1/2 -translate-y-1/2 w-20 h-9 bg-slate-800 text-white rounded-lg text-sm font-bold flex items-center justify-center hover:bg-slate-700"
    : "absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-emerald-400 rounded-xl flex items-center justify-center text-white hover:scale-105 active:scale-95 transition-all";

  return (
    <div className={containerClass}>
      <div className="flex items-center gap-3 mb-4">
        <div className={iconClass}>🤖</div>
        <div>
          <h3 className={`font-bold ${isSimpleMode ? 'text-slate-900 text-lg' : 'text-slate-800 font-extrabold'}`}>
            {isSimpleMode ? 'AI相談窓口' : 'AI町内会コンシェルジュ'}
          </h3>
          <p className="text-xs text-slate-500">
            {isSimpleMode ? '地域のことで分からないことがあればご質問ください。' : 'なんでも聞いてね！'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="relative mb-4">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isSimpleMode ? "ここに質問を入力してください" : "おすすめの散歩コースは？"}
          className={`w-full bg-slate-50 py-3 px-4 ${isSimpleMode ? 'pr-24 border border-slate-300 rounded-lg focus:border-slate-500 focus:ring-0' : 'pr-12 rounded-2xl border-2 border-transparent focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400'} outline-none transition-all text-sm`}
        />
        <button
          type="submit"
          className={buttonClass}
        >
          {isSimpleMode ? '送信' : '🚀'}
        </button>
      </form>

      {loading && (
        <div className="flex justify-center py-4">
          <div className={`w-6 h-6 border-4 border-t-transparent rounded-full animate-spin ${isSimpleMode ? 'border-slate-300 border-t-slate-800' : 'border-emerald-200 border-t-emerald-400'}`}></div>
        </div>
      )}

      {response && (
        <div className={`rounded-xl p-4 text-sm leading-relaxed whitespace-pre-wrap animate-in fade-in slide-in-from-bottom-2 duration-500 ${isSimpleMode ? 'bg-slate-50 text-slate-800 border border-slate-200' : 'bg-emerald-50 text-slate-700'}`}>
          {response}
        </div>
      )}
    </div>
  );
};

export default AIChat;
