/**
 * 発行元マスター管理ダイアログ
 */

import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { getPublishers, addPublisher, type Publisher } from '@cc-saas/shared';
import { getSupabaseClient } from '@cc-saas/shared/services/supabaseClient';

interface PublisherManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PublisherManager: React.FC<PublisherManagerProps> = ({ isOpen, onClose }) => {
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [newShortName, setNewShortName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editShortName, setEditShortName] = useState('');

  useEffect(() => {
    if (isOpen) loadPublishers();
  }, [isOpen]);

  const loadPublishers = async () => {
    setIsLoading(true);
    try {
      const data = await getPublishers();
      setPublishers(data);
    } catch {
      alert('発行元の読み込みに失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    try {
      await addPublisher(newName.trim(), newShortName.trim() || undefined);
      setNewName('');
      setNewShortName('');
      await loadPublishers();
    } catch {
      alert('追加に失敗しました');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`「${name}」を削除しますか？`)) return;
    try {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      await supabase.from('publishers').delete().eq('id', id);
      await loadPublishers();
    } catch {
      alert('削除に失敗しました');
    }
  };

  const handleUpdate = async (id: string) => {
    try {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      await supabase.from('publishers').update({
        name: editName,
        short_name: editShortName || null,
      }).eq('id', id);
      setEditingId(null);
      await loadPublishers();
    } catch {
      alert('更新に失敗しました');
    }
  };

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= publishers.length) return;

    const supabase = getSupabaseClient();
    if (!supabase) return;

    // 入れ替え対象のdisplay_orderを交換
    const a = publishers[index];
    const b = publishers[targetIndex];
    try {
      await supabase.from('publishers').update({ display_order: b.display_order }).eq('id', a.id);
      await supabase.from('publishers').update({ display_order: a.display_order }).eq('id', b.id);
      await loadPublishers();
    } catch {
      alert('並び替えに失敗しました');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[80vh] overflow-hidden shadow-2xl flex flex-col">
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h3 className="font-bold text-lg text-slate-800">発行元の管理</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
            <X size={22} />
          </button>
        </div>

        {/* 追加フォーム */}
        <div className="p-4 border-b border-slate-100 bg-slate-50">
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="発行元名（必須）"
              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            />
            <input
              type="text"
              value={newShortName}
              onChange={(e) => setNewShortName(e.target.value)}
              placeholder="略称"
              className="w-24 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            />
            <button
              onClick={handleAdd}
              disabled={!newName.trim()}
              className="px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>

        {/* 一覧 */}
        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-xs text-slate-500 mb-3">上下ボタンで表示順を変更。名前をクリックで編集。</p>
          {isLoading ? (
            <p className="text-center text-slate-500 py-8">読み込み中...</p>
          ) : publishers.length === 0 ? (
            <p className="text-center text-slate-500 py-8">発行元が登録されていません</p>
          ) : (
            <div className="space-y-1">
              {publishers.map((pub, index) => (
                <div key={pub.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg group">
                  {/* 並び替えボタン */}
                  <div className="flex flex-col shrink-0">
                    <button
                      onClick={() => handleMove(index, 'up')}
                      disabled={index === 0}
                      className="p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-20 transition"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      onClick={() => handleMove(index, 'down')}
                      disabled={index === publishers.length - 1}
                      className="p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-20 transition"
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>

                  {/* 順番 */}
                  <span className="text-xs text-slate-400 w-6 text-center shrink-0">{index + 1}</span>

                  {/* 名前 */}
                  {editingId === pub.id ? (
                    <div className="flex gap-2 flex-1">
                      <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 px-2 py-1 border border-slate-300 rounded text-sm" autoFocus />
                      <input type="text" value={editShortName} onChange={(e) => setEditShortName(e.target.value)}
                        placeholder="略称" className="w-20 px-2 py-1 border border-slate-300 rounded text-sm" />
                      <button onClick={() => handleUpdate(pub.id)} className="text-xs px-2 py-1 bg-primary-600 text-white rounded">保存</button>
                      <button onClick={() => setEditingId(null)} className="text-xs px-2 py-1 bg-slate-200 rounded">取消</button>
                    </div>
                  ) : (
                    <>
                      <div
                        className="flex-1 cursor-pointer min-w-0"
                        onClick={() => { setEditingId(pub.id); setEditName(pub.name); setEditShortName(pub.short_name || ''); }}
                      >
                        <p className="text-sm font-medium text-slate-700 truncate">{pub.name}</p>
                        {pub.short_name && <p className="text-xs text-slate-400">略称: {pub.short_name}</p>}
                      </div>
                      <button
                        onClick={() => handleDelete(pub.id, pub.name)}
                        className="p-1.5 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition shrink-0"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
