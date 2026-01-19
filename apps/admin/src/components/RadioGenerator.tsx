import React, { useState } from 'react';
import { generateRadioScript, generateRadioAudio } from '@/services/geminiService';
import { Mic, Play, FileText, Loader2, Music, Download } from 'lucide-react';
import { RadioProgram } from '@shared/types';

export const RadioGenerator: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [generatedScript, setGeneratedScript] = useState('');
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const handleGenerateScript = async () => {
    if (!inputText) return;
    setIsGeneratingScript(true);
    setAudioUrl(null); // Reset audio if source changes
    try {
      const script = await generateRadioScript(inputText);
      setGeneratedScript(script);
    } catch (e) {
      alert("スクリプト生成に失敗しました");
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const handleGenerateAudio = async () => {
    if (!generatedScript) return;
    setIsGeneratingAudio(true);
    try {
      const url = await generateRadioAudio(generatedScript);
      setAudioUrl(url);
    } catch (e) {
      alert("音声生成に失敗しました");
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-pink-500 rounded-xl text-white shadow-md">
          <Mic size={24} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">AI ラジオ制作スタジオ</h2>
          <p className="text-sm text-slate-500">広報誌や回覧板から、Spotify等で配信できるラジオ番組を自動生成します。</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Input */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <label className="block text-sm font-bold text-slate-700 mb-2">
              1. 元原稿を入力 (広報誌・回覧板テキスト)
            </label>
            <textarea 
              className="w-full h-48 p-4 border border-slate-200 rounded-xl focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-none text-slate-600"
              placeholder="ここにテキストを貼り付けてください..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
            <div className="mt-4 flex justify-end">
              <button 
                onClick={handleGenerateScript}
                disabled={isGeneratingScript || !inputText}
                className="flex items-center gap-2 bg-slate-800 text-white px-5 py-2.5 rounded-xl hover:bg-slate-700 disabled:opacity-50 transition-all font-bold"
              >
                {isGeneratingScript ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
                ラジオ台本を作成
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Output */}
        <div className="space-y-6">
          <div className={`bg-white p-6 rounded-2xl shadow-sm border border-slate-200 transition-opacity duration-300 ${!generatedScript ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              2. 生成された台本 (編集可能)
            </label>
            <textarea 
              className="w-full h-48 p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-none font-medium text-slate-700 leading-relaxed"
              value={generatedScript}
              onChange={(e) => setGeneratedScript(e.target.value)}
            />
            <div className="mt-4 flex justify-between items-center">
              <span className="text-xs text-slate-400">※内容を確認・修正してください</span>
              <button 
                onClick={handleGenerateAudio}
                disabled={isGeneratingAudio || !generatedScript}
                className="flex items-center gap-2 bg-pink-500 text-white px-5 py-2.5 rounded-xl hover:bg-pink-600 disabled:opacity-50 transition-all font-bold shadow-md shadow-pink-200"
              >
                {isGeneratingAudio ? <Loader2 size={18} className="animate-spin" /> : <Music size={18} />}
                音声収録 (TTS)
              </button>
            </div>
          </div>

          {audioUrl && (
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6 rounded-2xl shadow-lg text-white animate-in slide-in-from-bottom-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-pink-500 rounded-full flex items-center justify-center animate-pulse">
                     <Play size={20} fill="currentColor" />
                  </div>
                  <div>
                    <h3 className="font-bold">生成されたラジオ番組</h3>
                    <p className="text-xs text-slate-400">AI DJ Session #001</p>
                  </div>
                </div>
                <a 
                  href={audioUrl} 
                  download="radio-broadcast.wav"
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <Download size={20} />
                </a>
              </div>
              <audio controls src={audioUrl} className="w-full h-8" />
              <div className="mt-4 flex gap-2">
                 <button className="flex-1 py-2 bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold text-sm rounded-lg flex items-center justify-center gap-2 transition-colors">
                    Spotifyへアップロード
                 </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
