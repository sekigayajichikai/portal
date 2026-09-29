/**
 * 「カレンダーに反映」ダイアログ
 *
 * 予定タブの予定（公開済みの号・今日以降）を、自治会カレンダー（calendar_events）に載せる。
 * 何をどう変えるかを先に見せて、選んでから書く。カレンダー側だけにある予定（会館予約など）には触れない。
 * 仕組みの説明は docs/カレンダー連携.md。
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  getCalendarRowsForSync,
  buildCalendarDiff,
  applyCalendarDiff,
  type CalendarDiffRow,
  type AdminEventCard,
} from '@cc-saas/shared';
import { Loader2, X, CalendarCheck, AlertTriangle } from 'lucide-react';
import { showError, showToast } from '@/components/ui/feedback';
import { isSameEventTitle } from './eventMatch';
import { siteUrl } from './weeklyDigestCore';

interface CalendarSyncDialogProps {
  /** 予定タブが読み込んでいる予定（この中から公開済みの号・今日以降を流す） */
  cards: AdminEventCard[];
  onClose: () => void;
  /** 反映が終わったとき（一覧の読み直しなど） */
  onDone?: () => void;
}

const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const md = (ymd: string) => {
  const d = new Date(ymd + 'T00:00:00');
  if (isNaN(d.getTime())) return ymd;
  return `${d.getMonth() + 1}/${d.getDate()}(${['日', '月', '火', '水', '木', '金', '土'][d.getDay()]})`;
};

const SECTIONS: Array<{ kind: CalendarDiffRow['kind']; title: string; note: string; defaultOn: boolean }> = [
  { kind: 'new', title: '新しく載せる', note: 'カレンダーにまだ無い予定です', defaultOn: true },
  { kind: 'update', title: '内容を更新する', note: '前に載せたあとで、回覧板側の内容が変わったものです', defaultOn: true },
  {
    kind: 'conflict',
    title: 'カレンダーに似た予定があります',
    note: '同じ日に似た名前の予定がカレンダーにあります（会館予約など）。載せると二重になるので、既定では載せません',
    defaultOn: false,
  },
  { kind: 'same', title: '変更なし', note: 'カレンダーの内容と同じです', defaultOn: false },
];

export const CalendarSyncDialog: React.FC<CalendarSyncDialogProps> = ({ cards, onClose, onDone }) => {
  const [diff, setDiff] = useState<CalendarDiffRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);

  /** 流す対象: 公開済みの号・日付あり・今日以降 */
  const target = useMemo(() => {
    const today = todayYmd();
    return cards.filter((c) => c.newsletter_status === 'published' && c.event_date && c.event_date >= today);
  }, [cards]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await getCalendarRowsForSync(todayYmd());
        if (cancelled) return;
        const d = buildCalendarDiff(target, rows, siteUrl(), isSameEventTitle);
        setDiff(d);
        setPicked(new Set(d.filter((r) => r.kind === 'new' || r.kind === 'update').map((r) => r.cardId)));
      } catch (e: any) {
        console.error('カレンダーの読み込みエラー:', e);
        if (!cancelled) setError(e?.message ?? 'カレンダーを読み込めませんでした。');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target]);

  const toggle = (cardId: string) =>
    setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(cardId)) n.delete(cardId);
      else n.add(cardId);
      return n;
    });

  const apply = async () => {
    if (!diff) return;
    const rows = diff.filter((r) => picked.has(r.cardId) && r.kind !== 'same');
    if (rows.length === 0) return;
    setApplying(true);
    try {
      const { added, updated } = await applyCalendarDiff(rows);
      showToast(`カレンダーに反映しました（新規${added}件・更新${updated}件）`);
      onDone?.();
      onClose();
    } catch (e: any) {
      console.error('カレンダーへの反映エラー:', e);
      showError(e?.message ?? 'カレンダーに反映できませんでした。');
    } finally {
      setApplying(false);
    }
  };

  const counts = useMemo(() => {
    const m: Record<string, number> = { new: 0, update: 0, conflict: 0, same: 0 };
    for (const r of diff ?? []) m[r.kind]++;
    return m;
  }, [diff]);
  const pickedCount = (diff ?? []).filter((r) => picked.has(r.cardId) && r.kind !== 'same').length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <CalendarCheck size={18} className="text-emerald-600" />
            カレンダーに反映
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          <p className="text-xs text-slate-500">
            公開済みの号の予定（今日以降）を自治会カレンダーに載せます。対象 {target.length} 件。
            <br />
            カレンダー側だけにある予定（会館予約など）には触れません。載せた予定は、あとで内容を直すとここから更新できます。
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
          )}

          {!diff && !error && (
            <div className="flex items-center gap-2 text-slate-400 text-sm py-10 justify-center">
              <Loader2 size={16} className="animate-spin" /> カレンダーと見比べています...
            </div>
          )}

          {diff &&
            SECTIONS.map((sec) => {
              const rows = diff.filter((r) => r.kind === sec.kind);
              if (rows.length === 0) return null;
              return (
                <div key={sec.kind}>
                  <div className="flex items-baseline gap-2 mb-1">
                    <h3 className="text-sm font-bold text-slate-700">
                      {sec.kind === 'conflict' && <AlertTriangle size={13} className="inline mr-1 text-amber-600" />}
                      {sec.title}
                      <span className="ml-1 text-slate-400 font-normal">{rows.length}件</span>
                    </h3>
                    <span className="text-[11px] text-slate-400">{sec.note}</span>
                  </div>
                  <div className="space-y-1">
                    {rows.map((r) => (
                      <label
                        key={r.cardId}
                        className={`flex items-start gap-2 p-2 rounded-lg border text-sm ${
                          sec.kind === 'same'
                            ? 'border-slate-200 bg-slate-50 text-slate-400'
                            : sec.kind === 'conflict'
                              ? 'border-amber-300 bg-amber-50/50 cursor-pointer'
                              : 'border-slate-200 hover:bg-slate-50 cursor-pointer'
                        }`}
                      >
                        {sec.kind !== 'same' && (
                          <input
                            type="checkbox"
                            checked={picked.has(r.cardId)}
                            onChange={() => toggle(r.cardId)}
                            className="mt-1 shrink-0"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="font-bold text-blue-700 shrink-0">{md(r.values.date)}</span>
                            {r.values.start_time && (
                              <span className="text-xs text-slate-500 shrink-0">{r.values.start_time.slice(0, 5)}</span>
                            )}
                            <span className="font-medium text-slate-800 truncate">{r.values.title}</span>
                          </div>
                          <p className="text-xs text-slate-400 truncate">
                            {[r.values.location, r.values.org_name && `主催: ${r.values.org_name}`, r.values.article_url && '記事リンクあり']
                              .filter(Boolean)
                              .join(' / ') || '場所・主催なし'}
                          </p>
                          {r.kind === 'update' && r.changes && r.changes.length > 0 && (
                            <p className="text-[11px] text-emerald-700">変わるところ: {r.changes.join('・')}</p>
                          )}
                          {r.kind === 'conflict' && r.existing && (
                            <p className="text-[11px] text-amber-700">
                              カレンダーに「{r.existing.title}」（
                              {r.existing.event_type === 'facility' ? '会館予約' : r.existing.event_type ?? '予定'}）があります
                            </p>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}

          {diff && diff.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">カレンダーに載せる予定がありません。</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 p-4 border-t border-slate-200">
          <span className="text-xs text-slate-400">
            {diff ? `新規 ${counts.new} ／ 更新 ${counts.update} ／ 要確認 ${counts.conflict} ／ 変更なし ${counts.same}` : ''}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
              キャンセル
            </button>
            <button
              onClick={apply}
              disabled={applying || pickedCount === 0}
              className="px-4 py-2 text-sm font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40 flex items-center gap-1.5"
            >
              {applying ? <Loader2 size={14} className="animate-spin" /> : <CalendarCheck size={14} />}
              {applying ? '反映しています…' : `カレンダーに反映（${pickedCount}件）`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
