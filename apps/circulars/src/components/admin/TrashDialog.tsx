import React, { useEffect, useState } from 'react';
import { listTrash, restoreFromTrash, purgeTrashItem, TrashItem, TrashKind } from '@cc-saas/shared';
import { Loader2, RotateCcw, Trash2, X } from 'lucide-react';
import { showToast, showError, appConfirm } from '@/components/ui/feedback';

const KIND_LABELS: Record<TrashKind, string> = {
  newsletter: '回覧板',
  article: '記事',
  event_card: '予定（回覧板）',
  calendar_event: 'カレンダーの予定',
  booking: '会館の予約',
};

const SOURCE_LABELS: Record<string, string> = {
  portal: '回覧板ポータル',
  calendar: 'カレンダー',
  import: '会館予定の取り込み',
};

/** 中に含まれる件数の説明（号なら記事と予定カードの数） */
function describeContents(item: TrashItem): string {
  const counts = item.payload
    .filter((p) => p.rows.length > 0 && p.table !== item.payload[0]?.table)
    .map((p) => {
      const name = p.table === 'articles' ? '記事' : p.table === 'event_cards' ? '予定（回覧板）' : p.table === 'calendar_events' ? '予定（カレンダー）' : p.table;
      return `${name}${p.rows.length}件`;
    });
  return counts.length > 0 ? `（${counts.join('・')}を含む）` : '';
}

/**
 * ゴミ箱。管理画面とカレンダーアプリで削除したものの控えを一覧し、元に戻す。
 */
export const TrashDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    try {
      setItems(await listTrash());
    } catch (e) {
      console.error('ゴミ箱の読み込みエラー:', e);
      showError('ゴミ箱を読み込めませんでした。時間をおいてもう一度お試しください。');
      setItems([]);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleRestore = async (item: TrashItem) => {
    setBusyId(item.id);
    try {
      await restoreFromTrash(item);
      showToast(`「${item.label}」を元に戻しました`);
      setItems((prev) => prev?.filter((i) => i.id !== item.id) ?? null);
    } catch (e) {
      console.error('復元エラー:', e);
      showError(
        item.kind === 'booking'
          ? '元に戻せませんでした。同じ日・時間帯・部屋に別の予約が入っていないか確かめてください。'
          : '元に戻せませんでした。時間をおいてもう一度お試しください。'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handlePurge = async (item: TrashItem) => {
    const ok = await appConfirm({
      title: `「${item.label}」を完全に削除しますか？`,
      message: 'ゴミ箱からも消えるので、もう元に戻せません。',
      confirmLabel: '完全に削除する',
      danger: true,
    });
    if (!ok) return;
    setBusyId(item.id);
    try {
      await purgeTrashItem(item.id);
      setItems((prev) => prev?.filter((i) => i.id !== item.id) ?? null);
    } catch (e) {
      console.error('完全削除エラー:', e);
      showError('削除できませんでした。時間をおいてもう一度お試しください。');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-slate-800">ゴミ箱</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              削除した回覧板・記事・予定・予約は、ここから元に戻せます。
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg" title="閉じる">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-4">
          {items === null ? (
            <div className="flex items-center justify-center gap-2 py-12 text-slate-500">
              <Loader2 size={18} className="animate-spin" />
              読み込み中…
            </div>
          ) : items.length === 0 ? (
            <p className="text-center text-slate-500 py-12">ゴミ箱は空です。</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((item) => (
                <li key={item.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 truncate">{item.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {KIND_LABELS[item.kind] ?? item.kind}
                      {describeContents(item)} ・ {SOURCE_LABELS[item.source] ?? item.source}で削除 ・{' '}
                      {new Date(item.deleted_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleRestore(item)}
                      disabled={busyId !== null}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg disabled:opacity-50"
                    >
                      {busyId === item.id ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                      元に戻す
                    </button>
                    <button
                      onClick={() => handlePurge(item)}
                      disabled={busyId !== null}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
                      title="完全に削除する"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
