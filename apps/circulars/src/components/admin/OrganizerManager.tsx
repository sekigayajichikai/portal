/**
 * 団体マスタ管理（「マスタ」タブの中の1枚）
 *
 * 予定の主催と、回覧板PDFの発行元を1つの一覧でまとめて管理する（2026-10-01 一本化）。
 * 2026-10-05 から中身はカレンダー（book-system）と同じ団体マスタ（booking_organizations）。
 * ここに出るのは主催・発行元の候補にしている団体だけ。ゴミ箱ボタンは「候補から外す」で、団体は消さない。
 * 会場マスタと同じく、別名（揺れた表記・誤字）に当たるものは正式名に自動で置き換える。
 * 「主催」「発行元」のチェックで、どちらの候補に出すかを決める。
 */

import React, { useEffect, useState } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, Users } from 'lucide-react';
import {
  getOrganizers,
  addOrganizer,
  updateOrganizer,
  deleteOrganizer,
  type Organizer,
} from '@cc-saas/shared';
import { showError, showToast, appConfirm } from '@/components/ui/feedback';

/** 「、」「,」「／」区切りの別名を配列に */
const parseAliases = (s: string) =>
  s
    .split(/[、,，／/\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

export const OrganizerManager: React.FC = () => {
  const [organizers, setOrganizers] = useState<Organizer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAliases, setNewAliases] = useState('');
  const [newAsOrganizer, setNewAsOrganizer] = useState(true);
  const [newAsPublisher, setNewAsPublisher] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editAliases, setEditAliases] = useState('');
  const [editAsOrganizer, setEditAsOrganizer] = useState(true);
  const [editAsPublisher, setEditAsPublisher] = useState(false);

  const load = async () => {
    setIsLoading(true);
    try {
      setOrganizers(await getOrganizers());
      setUnavailable(false);
    } catch (e) {
      console.error('団体読み込みエラー:', e);
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
      const order = organizers.length > 0 ? Math.max(...organizers.map((o) => o.display_order)) + 1 : 10;
      await addOrganizer(name, undefined, order, {
        aliases: parseAliases(newAliases),
        useAsOrganizer: newAsOrganizer,
        useAsPublisher: newAsPublisher,
      });
      setNewName('');
      setNewAliases('');
      setNewAsOrganizer(true);
      setNewAsPublisher(false);
      await load();
    } catch (e: any) {
      console.error('団体追加エラー:', e);
      showError(/duplicate|unique/i.test(String(e?.message)) ? `「${name}」はすでに登録されています。` : '追加できませんでした。');
    }
  };

  const handleUpdate = async (id: string) => {
    const name = editName.trim();
    if (!name) return;
    try {
      await updateOrganizer(id, {
        name,
        aliases: parseAliases(editAliases),
        use_as_organizer: editAsOrganizer,
        use_as_publisher: editAsPublisher,
      });
      setEditingId(null);
      await load();
      showToast('団体を更新しました');
    } catch (e) {
      console.error('団体更新エラー:', e);
      showError('更新できませんでした。');
    }
  };

  const handleDelete = async (o: Organizer) => {
    const ok = await appConfirm({
      title: `「${o.name}」を候補から外しますか？`,
      message: '主催・発行元の候補に出なくなります。団体そのものはカレンダーの団体マスタに残り、予定の主催の文字もそのまま残ります。もう一度同じ名前で追加すると候補に戻ります。',
      confirmLabel: '候補から外す',
    });
    if (!ok) return;
    try {
      await deleteOrganizer(o.id);
      await load();
    } catch (e) {
      console.error('団体を候補から外すエラー:', e);
      showError('候補から外せませんでした。');
    }
  };

  const handleMove = async (index: number, dir: 'up' | 'down') => {
    const j = dir === 'up' ? index - 1 : index + 1;
    if (j < 0 || j >= organizers.length) return;
    const a = organizers[index];
    const b = organizers[j];
    try {
      // 表示順が同じだと入れ替わらないので、その場合は連番を振り直す
      if (a.display_order === b.display_order) {
        for (let i = 0; i < organizers.length; i++) await updateOrganizer(organizers[i].id, { display_order: (i + 1) * 10 });
        const fresh = await getOrganizers();
        const a2 = fresh[index];
        const b2 = fresh[j];
        await updateOrganizer(a2.id, { display_order: b2.display_order });
        await updateOrganizer(b2.id, { display_order: a2.display_order });
      } else {
        await updateOrganizer(a.id, { display_order: b.display_order });
        await updateOrganizer(b.id, { display_order: a.display_order });
      }
      await load();
    } catch (e) {
      console.error('団体並び替えエラー:', e);
      showError('並べ替えできませんでした。');
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col">
      <div className="flex items-center gap-2 p-5 border-b border-slate-200">
        <Users size={18} className="text-sky-600" />
        <h3 className="font-bold text-lg text-slate-800">団体</h3>
        <span className="text-xs text-slate-400">予定の主催と、回覧板の発行元（カレンダーの団体マスタと共通）</span>
      </div>

      {unavailable && (
        <p className="m-4 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          団体マスタを読めませんでした。設定が足りないかもしれません。管理者に連絡してください。
        </p>
      )}

      {/* 追加 */}
      <div className="p-4 border-b border-slate-100 bg-slate-50">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="正式名（必須。例: 釜利谷地区センター）"
            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
            }}
          />
          <input
            type="text"
            value={newAliases}
            onChange={(e) => setNewAliases(e.target.value)}
            placeholder="別名（「、」区切り。例: 地区センター、金利谷地区センター）"
            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
            }}
          />
          <button onClick={handleAdd} disabled={!newName.trim()} className="px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition">
            <Plus size={18} />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-4 mt-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={newAsOrganizer} onChange={(e) => setNewAsOrganizer(e.target.checked)} className="rounded border-slate-300" />
            予定の主催に出す
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={newAsPublisher} onChange={(e) => setNewAsPublisher(e.target.checked)} className="rounded border-slate-300" />
            回覧板の発行元に出す
          </label>
        </div>
        <p className="text-[11px] text-slate-400 mt-1.5">
          別名に登録した表記は、抽出時と予定の編集で自動的に正式名へ置き換わります。誤字を見つけたら別名に足しておくと、次から勝手に直ります。
          カレンダーの団体マスタにすでにある団体名を入れると、その団体が候補に加わります。無い団体は「地域の団体・施設」として登録されます（会館は予約しない団体）。
        </p>
      </div>

      {/* 一覧 */}
      <div className="p-4">
        <p className="text-xs text-slate-500 mb-3">上下ボタンで表示順を変更。名前をクリックで編集。名前を変えるとカレンダー側の団体名も変わります。</p>
        {isLoading ? (
          <p className="text-center text-slate-500 py-8">読み込み中…</p>
        ) : organizers.length === 0 ? (
          <p className="text-center text-slate-500 py-8">団体が登録されていません</p>
        ) : (
          <div className="space-y-1">
            {organizers.map((o, index) => (
              <div key={o.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg group">
                <div className="flex flex-col shrink-0">
                  <button onClick={() => handleMove(index, 'up')} disabled={index === 0} className="p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-20 transition">
                    <ArrowUp size={14} />
                  </button>
                  <button onClick={() => handleMove(index, 'down')} disabled={index === organizers.length - 1} className="p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-20 transition">
                    <ArrowDown size={14} />
                  </button>
                </div>
                <span className="text-xs text-slate-400 w-6 text-center shrink-0">{index + 1}</span>
                {editingId === o.id ? (
                  <div className="flex flex-col gap-2 flex-1">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="flex-1 px-2 py-1 border border-slate-300 rounded text-sm" autoFocus />
                      <input
                        type="text"
                        value={editAliases}
                        onChange={(e) => setEditAliases(e.target.value)}
                        placeholder="別名（「、」区切り）"
                        className="flex-1 px-2 py-1 border border-slate-300 rounded text-sm"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-1.5 text-xs text-slate-600">
                        <input type="checkbox" checked={editAsOrganizer} onChange={(e) => setEditAsOrganizer(e.target.checked)} className="rounded border-slate-300" />
                        主催
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-slate-600">
                        <input type="checkbox" checked={editAsPublisher} onChange={(e) => setEditAsPublisher(e.target.checked)} className="rounded border-slate-300" />
                        発行元
                      </label>
                      <div className="flex gap-1 ml-auto">
                        <button onClick={() => handleUpdate(o.id)} className="text-xs px-2 py-1 bg-primary-600 text-white rounded">
                          保存
                        </button>
                        <button onClick={() => setEditingId(null)} className="text-xs px-2 py-1 bg-slate-200 rounded">
                          キャンセル
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      className="flex-1 cursor-pointer min-w-0"
                      onClick={() => {
                        setEditingId(o.id);
                        setEditName(o.name);
                        setEditAliases(o.aliases.join('、'));
                        setEditAsOrganizer(o.use_as_organizer);
                        setEditAsPublisher(o.use_as_publisher);
                      }}
                    >
                      <p className="text-sm font-medium text-slate-700 truncate">
                        {o.name}
                        {o.use_as_publisher && (
                          <span className="ml-2 align-middle text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">発行元</span>
                        )}
                        {o.group_name && (
                          <span className="ml-1 align-middle text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700">{o.group_name}</span>
                        )}
                        {!o.use_as_organizer && (
                          <span className="ml-1 align-middle text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-500">主催に出さない</span>
                        )}
                      </p>
                      {o.aliases.length > 0 && <p className="text-xs text-slate-400 truncate">別名: {o.aliases.join('、')}</p>}
                    </div>
                    <button onClick={() => handleDelete(o)} title="候補から外す" className="p-1.5 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition shrink-0">
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
