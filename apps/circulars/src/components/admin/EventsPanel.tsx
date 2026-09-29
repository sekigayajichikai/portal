/**
 * 予定タブ（予定カードを号をまたいで一覧・編集する）
 *
 * 予定カード（event_cards）は号にぶら下がっているが、困りごと（号をまたぐ二重登録・別の号の記事を付けたい・
 * 場所や主催の表記ゆれ）はどれも号をまたぐので、全号のカードを日付順に1つの一覧で扱う。
 * - 既定は「今日以降（＋日付未定）・全号」。下書き・旧版の号のカードはバッジで区別（公開側には出ていない）
 * - 同じ日に似た題名の予定（eventMatch.ts の isSameEventTitle）があれば行の下に警告し、見比べて片方にまとめられる
 * - 場所・主催が会場マスタ／主催団体マスタに無い表記なら薄い黄色
 * - 行をクリックすると編集ダイアログ（号の画面・週次配信と同じもの）
 * 仕様: docs/予定管理-設計.md
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  getAdminEventCards,
  updateEventCard,
  deleteEventCard,
  getVenuesSafe,
  getOrganizers,
  normalizeVenueText,
  type AdminEventCard,
  type Venue,
} from '@cc-saas/shared';
import { Loader2, Search, RefreshCw, AlertTriangle, X, Calendar, CalendarCheck } from 'lucide-react';
import { showError, showToast, appConfirm } from '@/components/ui/feedback';
import { EventCardEditDialog } from './EventCardEditDialog';
import { CalendarSyncDialog } from './CalendarSyncDialog';
import { CATEGORY_META, KIND_META } from './EventCandidateDialog';
import { findDuplicateGroups, buildMergeUpdates } from './eventMatch';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** YYYY-MM-DD → 10/3(土) */
const mdw = (ymd: string | null) => {
  if (!ymd) return '日付未定';
  const d = new Date(ymd + 'T00:00:00');
  if (isNaN(d.getTime())) return ymd;
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  draft: { label: '下書き', cls: 'bg-slate-200 text-slate-600' },
  archived: { label: '旧版', cls: 'bg-slate-200 text-slate-500' },
};

type TypeFilter = 'all' | 'reserve' | 'recurring' | 'open' | 'none' | 'community' | 'support' | 'class';
const TYPE_FILTERS: Array<{ key: TypeFilter; label: string }> = [
  { key: 'all', label: '種別・性質: すべて' },
  { key: 'reserve', label: `${CATEGORY_META.reserve.icon} ${CATEGORY_META.reserve.label}` },
  { key: 'recurring', label: `${CATEGORY_META.recurring.icon} ${CATEGORY_META.recurring.label}` },
  { key: 'open', label: `${CATEGORY_META.open.icon} ${CATEGORY_META.open.label}` },
  { key: 'none', label: '種別なし' },
  { key: 'community', label: `${KIND_META.community.icon} ${KIND_META.community.label}` },
  { key: 'support', label: `${KIND_META.support.icon} ${KIND_META.support.label}` },
  { key: 'class', label: `${KIND_META.class.icon} ${KIND_META.class.label}` },
];

export const EventsPanel: React.FC = () => {
  const [cards, setCards] = useState<AdminEventCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [includePast, setIncludePast] = useState(false);
  const [newsletterFilter, setNewsletterFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [topicOnly, setTopicOnly] = useState(false);
  const [showExcluded, setShowExcluded] = useState(true);
  const [query, setQuery] = useState('');
  const [venues, setVenues] = useState<Venue[]>([]);
  const [organizerNames, setOrganizerNames] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  /** 見比べ中の2件（左・右） */
  const [comparing, setComparing] = useState<[AdminEventCard, AdminEventCard] | null>(null);
  const [merging, setMerging] = useState(false);
  /** 「カレンダーに反映」ダイアログを開いているか */
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setCards(await getAdminEventCards(includePast ? {} : { fromDate: todayYmd() }));
    } catch (e) {
      console.error('予定の読み込みエラー:', e);
      showError('予定を読み込めませんでした。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [includePast]);

  useEffect(() => {
    getVenuesSafe().then(setVenues);
    getOrganizers()
      .then((os) => setOrganizerNames(new Set(os.map((o) => o.name))))
      .catch(() => setOrganizerNames(new Set()));
  }, []);

  /** 会場マスタの正式名（正規化済み）。別名はマスタに寄せる前の表記なので「無い表記」として色を付ける */
  const venueKeys = useMemo(() => new Set(venues.map((v) => normalizeVenueText(v.name))), [venues]);
  const unknownVenue = (loc: string | null) => !!loc && venues.length > 0 && !venueKeys.has(normalizeVenueText(loc));
  const unknownOrganizer = (org: string | null | undefined) => !!org && organizerNames.size > 0 && !organizerNames.has(org);

  /** 号の選択肢（一覧に出ているカードの号） */
  const newsletterOptions = useMemo(() => {
    const m = new Map<string, { title: string; status: string | null }>();
    for (const c of cards) if (!m.has(c.newsletter_id)) m.set(c.newsletter_id, { title: c.newsletter_title ?? '号不明', status: c.newsletter_status });
    return Array.from(m.entries());
  }, [cards]);

  /** 重複の組は絞り込み前の全件で探す（絞り込みで相手が隠れても警告は出す） */
  const duplicates = useMemo(() => findDuplicateGroups(cards), [cards]);
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards.filter((c) => {
      if (newsletterFilter !== 'all' && c.newsletter_id !== newsletterFilter) return false;
      if (topicOnly && !c.weekly_topic) return false;
      if (!showExcluded && c.digest_exclude) return false;
      if (typeFilter !== 'all') {
        if (typeFilter === 'none') {
          if (c.category) return false;
        } else if (typeFilter === 'reserve' || typeFilter === 'recurring' || typeFilter === 'open') {
          if (c.category !== typeFilter) return false;
        } else if (c.kind !== typeFilter) return false;
      }
      if (q) {
        const hay = [c.title, c.event_location, c.organizer, c.newsletter_title].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [cards, query, newsletterFilter, typeFilter, topicOnly, showExcluded]);

  const dupCount = useMemo(() => new Set(visible.filter((c) => duplicates.has(c.id)).map((c) => c.id)).size, [visible, duplicates]);

  /** keep を残し drop を消す（keep の空欄は drop の値で埋める） */
  const merge = async (keep: AdminEventCard, drop: AdminEventCard) => {
    const ok = await appConfirm({
      title: `「${keep.title}」（${keep.newsletter_title ?? '号不明'}）を残し、もう片方を削除しますか？`,
      message: `削除: 「${drop.title}」（${drop.newsletter_title ?? '号不明'}）\n残す側の空欄（時間・場所・主催・記事リンク・紹介文など）は、削除する側の値で埋めます。`,
      confirmLabel: '1件にまとめる',
      danger: true,
    });
    if (!ok) return;
    setMerging(true);
    try {
      const updates = buildMergeUpdates(keep, drop);
      if (updates) await updateEventCard(keep.id, updates);
      await deleteEventCard(drop.id);
      showToast('1件にまとめました');
      setComparing(null);
      await load();
    } catch (e) {
      console.error('重複の統合エラー:', e);
      showError('まとめられませんでした。時間をおいてもう一度お試しください。');
    } finally {
      setMerging(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Calendar size={20} className="text-primary-600" /> 予定
            <span className="text-sm font-normal text-slate-500">
              {visible.length}件{dupCount > 0 && <span className="ml-2 text-amber-700 font-bold">⚠ 重複の疑い {dupCount}件</span>}
            </span>
          </h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="題名・場所・主催で検索"
                className="text-sm border border-slate-300 rounded-lg pl-7 pr-2 py-1.5 w-56"
              />
            </div>
            <button
              onClick={() => setSyncing(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition"
              title="公開済みの号の予定（今日以降）を自治会カレンダーに載せます。何が変わるかを先に確認できます"
            >
              <CalendarCheck size={15} /> カレンダーに反映
            </button>
            <button onClick={load} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg" title="読み直す">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <select value={includePast ? 'all' : 'future'} onChange={(e) => setIncludePast(e.target.value === 'all')} className="border border-slate-300 rounded-lg px-2 py-1">
            <option value="future">今日以降</option>
            <option value="all">過去も表示</option>
          </select>
          <select value={newsletterFilter} onChange={(e) => setNewsletterFilter(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1 max-w-[16rem]">
            <option value="all">号: すべて</option>
            {newsletterOptions.map(([id, n]) => (
              <option key={id} value={id}>
                {n.title}
                {n.status && STATUS_BADGE[n.status] ? `（${STATUS_BADGE[n.status].label}）` : ''}
              </option>
            ))}
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as TypeFilter)} className="border border-slate-300 rounded-lg px-2 py-1">
            {TYPE_FILTERS.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 cursor-pointer select-none text-slate-700">
            <input type="checkbox" checked={topicOnly} onChange={(e) => setTopicOnly(e.target.checked)} /> ⭐だけ
          </label>
          <label className="flex items-center gap-1 cursor-pointer select-none text-slate-700">
            <input type="checkbox" checked={showExcluded} onChange={(e) => setShowExcluded(e.target.checked)} /> 🚫配信除外も表示
          </label>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200">
        {loading && cards.length === 0 ? (
          <p className="p-8 text-center text-slate-400 flex items-center justify-center gap-2">
            <Loader2 size={18} className="animate-spin" /> 読み込み中...
          </p>
        ) : visible.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-400">当てはまる予定がありません。</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((c) => {
              const badge = c.newsletter_status ? STATUS_BADGE[c.newsletter_status] : undefined;
              const dups = (duplicates.get(c.id) ?? []).map((id) => byId.get(id)).filter((x): x is AdminEventCard => !!x);
              return (
                <li key={c.id} className={c.digest_exclude ? 'bg-slate-50/60' : ''}>
                  <button type="button" onClick={() => setEditingId(c.id)} className="w-full text-left px-4 py-2 hover:bg-primary-50/40 transition">
                    <div className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap">
                      <span className={`text-sm font-bold w-20 shrink-0 ${c.event_date ? 'text-blue-600' : 'text-slate-400'}`}>{mdw(c.event_date)}</span>
                      <span className="text-xs text-slate-500 w-24 shrink-0 truncate">{c.event_time ?? ''}</span>
                      <span className="text-sm font-medium text-slate-800 flex-1 min-w-[10rem] truncate">
                        {c.weekly_topic && <span title={c.topic_reason ? `一押し候補（${c.topic_reason}）` : '一押し候補'}>⭐ </span>}
                        {c.title}
                      </span>
                      <span className="flex items-center gap-1.5 text-[11px] shrink-0 flex-wrap">
                        {c.category && <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{CATEGORY_META[c.category].icon} {CATEGORY_META[c.category].label}</span>}
                        {c.kind && <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">{KIND_META[c.kind].label}</span>}
                        {c.apply_deadline && <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700">締切 {mdw(c.apply_deadline)}</span>}
                        {c.source_pdf_url && <span title={`由来PDF: ${c.source_pdf_label ?? ''}`}>📎</span>}
                        {c.linked_article && (
                          <span title={`記事: ${c.linked_article.title}${c.linked_article_newsletter_title ? `（${c.linked_article_newsletter_title}）` : ''}`}>🔗</span>
                        )}
                        {c.digest_exclude && <span title="週次配信に載せない">🚫</span>}
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 max-w-[10rem] truncate">{c.newsletter_title ?? '号不明'}</span>
                        {badge && <span className={`px-1.5 py-0.5 rounded ${badge.cls}`} title="この号は公開されていないので、カレンダー・週次配信には出ません">{badge.label}</span>}
                      </span>
                    </div>
                    {(c.event_location || c.organizer || c.linked_article) && (
                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 pl-[5.75rem] flex-wrap">
                        {c.event_location && (
                          <span className={unknownVenue(c.event_location) ? 'bg-yellow-100 text-yellow-900 px-1 rounded' : ''} title={unknownVenue(c.event_location) ? '会場マスタに無い表記です' : ''}>
                            📍 {c.event_location}
                          </span>
                        )}
                        {c.organizer && (
                          <span className={unknownOrganizer(c.organizer) ? 'bg-yellow-100 text-yellow-900 px-1 rounded' : ''} title={unknownOrganizer(c.organizer) ? '主催団体マスタに無い表記です' : ''}>
                            🏛 {c.organizer}
                          </span>
                        )}
                        {c.linked_article && (
                          <span className="text-primary-600 truncate max-w-[20rem]">
                            🔗 {c.linked_article.title}
                            {c.linked_article_newsletter_title && c.linked_article.newsletter_id !== c.newsletter_id && `（${c.linked_article_newsletter_title}）`}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                  {dups.map((d) => (
                    <div key={d.id} className="flex items-center gap-2 text-xs bg-amber-50 text-amber-800 px-4 py-1 pl-[6.75rem]">
                      <AlertTriangle size={12} className="shrink-0" />
                      <span className="truncate">
                        同じ日に似た予定: {d.title}（{d.newsletter_title ?? '号不明'}）
                      </span>
                      <button type="button" onClick={() => setComparing([c, d])} className="shrink-0 font-bold text-amber-900 hover:underline">
                        見比べる
                      </button>
                    </div>
                  ))}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {editingId && <EventCardEditDialog cardId={editingId} onClose={() => setEditingId(null)} onChanged={load} />}

      {syncing && <CalendarSyncDialog cards={cards} onClose={() => setSyncing(false)} />}

      {comparing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onMouseDown={(e) => e.target === e.currentTarget && !merging && setComparing(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h2 className="font-bold text-slate-800">同じ予定かどうか見比べる</h2>
              <button onClick={() => setComparing(null)} disabled={merging} className="p-1 text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-4">
              {comparing.map((side, i) => {
                const other = comparing[1 - i];
                return (
                  <div key={side.id} className="border border-slate-200 rounded-lg p-3 flex flex-col">
                    <CompareRows card={side} />
                    <button
                      onClick={() => merge(side, other)}
                      disabled={merging}
                      className="mt-3 px-3 py-1.5 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-40 flex items-center justify-center gap-1"
                    >
                      {merging && <Loader2 size={14} className="animate-spin" />}
                      {i === 0 ? '左を残す' : '右を残す'}
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="px-4 pb-4 text-xs text-slate-500">
              残す側の空欄は、消す側の値で埋めます（題名・日付など残す側に値があるものは変えません）。別の予定なら閉じてください。
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

/** 見比べ用の1件分の表示 */
const CompareRows: React.FC<{ card: AdminEventCard }> = ({ card: c }) => {
  const rows: Array<[string, React.ReactNode]> = [
    ['号', `${c.newsletter_title ?? '号不明'}${c.newsletter_status && STATUS_BADGE[c.newsletter_status] ? `（${STATUS_BADGE[c.newsletter_status].label}）` : ''}`],
    ['題名', c.title],
    ['日付', `${mdw(c.event_date)} ${c.event_time ?? ''}`],
    ['場所', c.event_location],
    ['主催', c.organizer],
    ['種別', c.category ? CATEGORY_META[c.category].label : null],
    ['性質', c.kind ? KIND_META[c.kind].label : null],
    ['締切', c.apply_deadline ? mdw(c.apply_deadline) : null],
    ['対象・費用', [c.target_audience, c.fee].filter(Boolean).join(' / ') || null],
    ['⭐', c.weekly_topic ? `一押し候補${c.topic_reason ? `（${c.topic_reason}）` : ''}` : null],
    ['紹介文', c.description],
    ['記事', c.linked_article ? `${c.linked_article.title}${c.linked_article_newsletter_title ? `（${c.linked_article_newsletter_title}）` : ''}` : null],
    ['由来PDF', c.source_pdf_url ? c.source_pdf_label ?? 'あり' : null],
    ['配信除外', c.digest_exclude ? '🚫 載せない' : null],
  ];
  return (
    <dl className="text-xs space-y-1 flex-1">
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <dt className="w-16 shrink-0 text-slate-400">{k}</dt>
          <dd className={v ? 'text-slate-800 break-words min-w-0' : 'text-slate-300'}>{v || '—'}</dd>
        </div>
      ))}
    </dl>
  );
};
