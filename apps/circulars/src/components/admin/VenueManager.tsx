/**
 * 会場マスター管理（「マスタ」タブの中の1枚）
 *
 * 予定カードの実施場所を事前登録する。抽出時に AI へ登録名を渡して表記を揃え、
 * 別名（揺れた表記）に当たるものは正式名に自動で置き換える（resolveVenueName）。
 * 正式名は「施設名＋部屋名」（例: 西金沢コミュニティハウス 2階）で書く。
 */

import React, { useEffect, useState } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, MapPin } from 'lucide-react';
import { getVenues, addVenue, updateVenue, deleteVenue, type Venue } from '@cc-saas/shared';
import { showError, showToast, appConfirm } from '@/components/ui/feedback';

/** 「、」「,」「／」区切りの別名を配列に */
const parseAliases = (s: string) =>
  s
    .split(/[、,，／/\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

export const VenueManager: React.FC = () => {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAliases, setNewAliases] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editAliases, setEditAliases] = useState('');

  const load = async () => {
    setIsLoading(true);
    try {
      setVenues(await getVenues());
      setUnavailable(false);
    } catch (e) {
      console.error('会場読み込みエラー:', e);
      setUnavailable(true);
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const order = venues.length > 0 ? Math.max(...venues.map((v) => v.display_order)) + 1 : 10;
      await addVenue(name, parseAliases(newAliases), order);
      setNewName('');
      setNewAliases('');
      await load();
    } catch (e: any) {
      console.error('会場追加エラー:', e);
      showError(/duplicate|unique/i.test(String(e?.message)) ? `「${name}」はすでに登録されています。` : '追加できませんでした。');
    }
  };

  const handleUpdate = async (id: string) => {
    const name = editName.trim();
    if (!name) return;
    try {
      await updateVenue(id, { name, aliases: parseAliases(editAliases) });
      setEditingId(null);
      await load();
      showToast('会場を更新しました');
    } catch (e) {
      console.error('会場更新エラー:', e);
      showError('更新できませんでした。');
    }
  };

  const handleDelete = async (v: Venue) => {
    const ok = await appConfirm({
      title: `「${v.name}」を削除しますか？`,
      message: '予定に入っている場所の文字はそのまま残ります（マスタから消えるだけ）。',
      confirmLabel: '削除する',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteVenue(v.id);
      await load();
    } catch (e) {
      console.error('会場削除エラー:', e);
      showError('削除できませんでした。');
    }
  };

  const handleMove = async (index: number, dir: 'up' | 'down') => {
    const j = dir === 'up' ? index - 1 : index + 1;
    if (j < 0 || j >= venues.length) return;
    const a = venues[index];
    const b = venues[j];
    try {
      // 表示順が同じだと入れ替わらないので、その場合は連番を振り直す
      if (a.display_order === b.display_order) {
        for (let i = 0; i < venues.length; i++) await updateVenue(venues[i].id, { display_order: (i + 1) * 10 });
        const fresh = await getVenues();
        const a2 = fresh[index];
        const b2 = fresh[j];
        await updateVenue(a2.id, { display_order: b2.display_order });
        await updateVenue(b2.id, { display_order: a2.display_order });
      } else {
        await updateVenue(a.id, { display_order: b.display_order });
        await updateVenue(b.id, { display_order: a.display_order });
      }
      await load();
    } catch (e) {
      console.error('会場並び替えエラー:', e);
      showError('並べ替えできませんでした。');
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col">
      <div className="flex items-center gap-2 p-5 border-b border-slate-200">
        <MapPin size={18} className="text-emerald-600" />
        <h3 className="font-bold text-lg text-slate-800">会場</h3>
        <span className="text-xs text-slate-400">予定の場所。正式名は「施設名＋部屋名」で</span>
      </div>

      {unavailable && (
        <p className="m-4 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          会場マスタを読めませんでした。設定が足りないかもしれません。管理者に連絡してください。
        </p>
      )}

      {/* 追加 */}
      <div className="p-4 border-b border-slate-100 bg-slate-50">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="正式名（必須。例: 西金沢コミュニティハウス 2階）"
            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
            }}
          />
          <input
            type="text"
            value={newAliases}
            onChange={(e) => setNewAliases(e.target.value)}
            placeholder="別名（「、」区切り。例: コミュニティハウス 2階、コミハ2階）"
            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
            }}
          />
          <button onClick={handleAdd} disabled={!newName.trim()} className="px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition">
            <Plus size={18} />
          </button>
        </div>
        <p className="text-[11px] text-slate-400 mt-1.5">
          別名に登録した表記は、抽出時と予定の編集で自動的に正式名へ置き換わります。AIにも正式名の一覧を渡して、この表記に揃えるよう指示します。
        </p>
      </div>

      {/* 一覧 */}
      <div className="p-4">
        <p className="text-xs text-slate-500 mb-3">上下ボタンで表示順を変更。名前をクリックで編集。</p>
        {isLoading ? (
          <p className="text-center text-slate-500 py-8">読み込み中…</p>
        ) : venues.length === 0 ? (
          <p className="text-center text-slate-500 py-8">会場が登録されていません</p>
        ) : (
          <div className="space-y-1">
            {venues.map((v, index) => (
              <div key={v.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg group">
                <div className="flex flex-col shrink-0">
                  <button onClick={() => handleMove(index, 'up')} disabled={index === 0} className="p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-20 transition">
                    <ArrowUp size={14} />
                  </button>
                  <button onClick={() => handleMove(index, 'down')} disabled={index === venues.length - 1} className="p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-20 transition">
                    <ArrowDown size={14} />
                  </button>
                </div>
                <span className="text-xs text-slate-400 w-6 text-center shrink-0">{index + 1}</span>
                {editingId === v.id ? (
                  <div className="flex flex-col sm:flex-row gap-2 flex-1">
                    <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="flex-1 px-2 py-1 border border-slate-300 rounded text-sm" autoFocus />
                    <input
                      type="text"
                      value={editAliases}
                      onChange={(e) => setEditAliases(e.target.value)}
                      placeholder="別名（「、」区切り）"
                      className="flex-1 px-2 py-1 border border-slate-300 rounded text-sm"
                    />
                    <div className="flex gap-1">
                      <button onClick={() => handleUpdate(v.id)} className="text-xs px-2 py-1 bg-primary-600 text-white rounded">
                        保存
                      </button>
                      <button onClick={() => setEditingId(null)} className="text-xs px-2 py-1 bg-slate-200 rounded">
                        キャンセル
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      className="flex-1 cursor-pointer min-w-0"
                      onClick={() => {
                        setEditingId(v.id);
                        setEditName(v.name);
                        setEditAliases(v.aliases.join('、'));
                      }}
                    >
                      <p className="text-sm font-medium text-slate-700 truncate">{v.name}</p>
                      {v.aliases.length > 0 && <p className="text-xs text-slate-400 truncate">別名: {v.aliases.join('、')}</p>}
                    </div>
                    <button onClick={() => handleDelete(v)} className="p-1.5 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition shrink-0">
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
  );
};
