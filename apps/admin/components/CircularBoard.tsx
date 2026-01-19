import React, { useState } from 'react';
import { Circular, PublicEvent } from '../../../packages/shared/types';
import { MOCK_CIRCULARS } from '../constants';
import { extractEventsFromText } from '../services/geminiService';
import { Sparkles, Send, Eye, Loader2, Calendar } from 'lucide-react';

interface CircularBoardProps {
  onEventsExtracted: (events: PublicEvent[]) => void;
}

export const CircularBoard: React.FC<CircularBoardProps> = ({ onEventsExtracted }) => {
  const [circulars, setCirculars] = useState<Circular[]>(MOCK_CIRCULARS);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);

  const handleCreate = async () => {
    if (!newTitle || !newContent) return;

    const newCircular: Circular = {
      id: Date.now().toString(),
      title: newTitle,
      content: newContent,
      date: new Date().toISOString().split('T')[0],
      category: 'notice',
      author: '管理者',
      readCount: 0,
      totalTarget: 124,
    };

    setCirculars([newCircular, ...circulars]);
    setIsCreating(false);
    setNewTitle('');
    setNewContent('');
  };

  const handleExtractEvents = async (circular: Circular) => {
    if (circular.extractedEvents) return; // Already extracted
    
    setIsExtracting(true);
    try {
      const events = await extractEventsFromText(circular.content);
      const updatedCirculars = circulars.map(c => 
        c.id === circular.id ? { ...c, extractedEvents: events } : c
      );
      setCirculars(updatedCirculars);
      
      if (events.length > 0) {
        onEventsExtracted(events);
      }
    } catch (e) {
      alert("イベント抽出に失敗しました。");
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-700">デジタル回覧板</h2>
        <button 
          onClick={() => setIsCreating(!isCreating)}
          className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-xl shadow-sm transition-colors flex items-center gap-2 font-medium"
        >
          <Send size={18} />
          新規作成・配信
        </button>
      </div>

      {isCreating && (
        <div className="bg-white p-6 rounded-2xl shadow border border-primary-100 animate-in fade-in slide-in-from-top-4">
          <h3 className="font-bold text-slate-800 mb-4">新しい回覧板を作成</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">タイトル</label>
              <input 
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="例: 防災訓練のお知らせ"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">内容</label>
              <textarea 
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                className="w-full p-2 border border-slate-200 rounded-lg h-32 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="詳細を入力してください..."
              />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setIsCreating(false)} className="px-4 py-2 text-slate-500 hover:bg-slate-50 rounded-lg">キャンセル</button>
              <button onClick={handleCreate} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium">配信する</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {circulars.map((circular) => (
          <div key={circular.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-primary-200 transition-colors">
            <div className="flex justify-between items-start mb-3">
              <div className="flex gap-2 items-center">
                <span className={`text-xs px-2 py-1 rounded-md font-bold ${
                  circular.category === 'event' ? 'bg-blue-100 text-blue-700' : 
                  circular.category === 'notice' ? 'bg-slate-100 text-slate-700' : 'bg-orange-100 text-orange-700'
                }`}>
                  {circular.category.toUpperCase()}
                </span>
                <span className="text-sm text-slate-400">{circular.date}</span>
              </div>
              <div className="flex items-center text-xs text-slate-500 gap-1 bg-slate-50 px-2 py-1 rounded-full">
                <Eye size={14} />
                <span>既読: {circular.readCount} / {circular.totalTarget}</span>
              </div>
            </div>
            
            <h3 className="text-lg font-bold text-slate-800 mb-2">{circular.title}</h3>
            <p className="text-slate-600 text-sm whitespace-pre-wrap mb-4 leading-relaxed">{circular.content}</p>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <div className="text-xs text-slate-400">作成者: {circular.author}</div>
              
              {!circular.extractedEvents ? (
                <button 
                  onClick={() => handleExtractEvents(circular)}
                  disabled={isExtracting}
                  className="flex items-center gap-2 text-sm text-purple-600 hover:bg-purple-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isExtracting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  <span>AIでイベント情報を抽出・公開</span>
                </button>
              ) : (
                <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg">
                  <Calendar size={16} />
                  <span>公開カレンダーに反映済み ({circular.extractedEvents.length}件)</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
