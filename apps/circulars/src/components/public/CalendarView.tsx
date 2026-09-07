/**
 * カレンダータブ
 *
 * 見せ方は元アプリ book-system の MobileCalendarView + MobileDayCard を踏襲
 * （月の各日をカード縦リスト・今日へスクロール・月送り矢印/スワイプ）。
 * 中身は回覧板PDFからAI抽出したイベント予定（event_cards）を表示する。
 * 主催団体（organizer）と、出典（記事→無ければ元PDF）への導線も表示する。
 * 休館日は calendar_events の closure から拾う。
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getPublishedEventCards, getCalendarEvents, getArticleById } from '@cc-saas/shared';
import type { PublicEventCard, Article } from '@cc-saas/shared';
import { ChevronLeft, ChevronRight, MapPin, Users, FileText, ExternalLink, X } from 'lucide-react';

const DOW = ['日', '月', '火', '水', '木', '金', '土'];

function isToday(d: Date): boolean {
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

/** イベント種別の表示メタ（バッジのラベル・色、日付ドットの色） */
const EVENT_CATEGORY_META: Record<
  'reserve' | 'recurring' | 'open',
  { label: string; icon: string; badge: string; dot: string }
> = {
  open: { label: '当日参加OK', icon: '🎪', badge: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' },
  reserve: { label: '要予約', icon: '📝', badge: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  recurring: { label: '毎週・連続', icon: '🔁', badge: 'bg-sky-100 text-sky-700', dot: 'bg-sky-500' },
};

/** 1日分のカード（元アプリ MobileDayCard の見せ方を踏襲、中身はイベント） */
const DayCard: React.FC<{
  date: Date;
  events: PublicEventCard[];
  today: boolean;
  isClosure: boolean;
  onOpenArticle: (id: string) => void;
}> = ({ date, events, today, isClosure, onOpenArticle }) => {
  const dow = date.getDay();
  const dateStr = formatDate(date);
  const dayEvents = events
    .filter((e) => e.event_date === dateStr)
    .sort((a, b) => (a.event_time || '99').localeCompare(b.event_time || '99'));

  return (
    <div
      className={`rounded-xl border ${
        today
          ? 'border-emerald-400 bg-emerald-50/50 ring-2 ring-emerald-200'
          : isClosure
          ? 'border-gray-200 bg-gray-50'
          : 'border-gray-200 bg-white'
      }`}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-baseline gap-2">
          <span
            className={`text-2xl font-bold ${
              today
                ? 'text-emerald-600'
                : dow === 0
                ? 'text-red-500'
                : dow === 6
                ? 'text-blue-500'
                : 'text-gray-800'
            }`}
          >
            {date.getMonth() + 1}/{date.getDate()}
          </span>
          <span
            className={`text-lg ${
              today
                ? 'text-emerald-500'
                : dow === 0
                ? 'text-red-400'
                : dow === 6
                ? 'text-blue-400'
                : 'text-gray-400'
            }`}
          >
            ({DOW[dow]})
          </span>
          {isClosure && (
            <span className="text-sm bg-orange-400 text-white px-2 py-0.5 rounded font-bold">
              休館
            </span>
          )}
          {today && (
            <span className="text-sm bg-emerald-600 text-white px-2 py-0.5 rounded-full font-bold">
              TODAY
            </span>
          )}
        </div>
      </div>

      {dayEvents.length === 0 ? (
        <div className="px-4 pb-3 text-lg text-gray-300">予定なし</div>
      ) : (
        <div className="px-4 pb-3 space-y-3">
          {dayEvents.map((e) => {
            const hasArticle = !!e.linked_article?.id;
            // 由来PDF（このイベントの抽出元）を優先。無ければ号の先頭PDFにフォールバック
            const pdfUrl = e.source_pdf_url || e.newsletter_pdf_url || null;
            const hasPdf = !!pdfUrl;
            const catMeta = e.category ? EVENT_CATEGORY_META[e.category] : null;
            return (
              <div key={e.id} className="flex items-start gap-2.5">
                <span className={`w-3 h-3 mt-1.5 rounded-full shrink-0 ${catMeta?.dot ?? 'bg-emerald-500'}`} />
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    {e.event_time && (
                      <span className="text-base font-bold text-gray-600 shrink-0">
                        {e.event_time}
                      </span>
                    )}
                    <span className="text-lg text-gray-800 leading-snug">{e.title}</span>
                    {catMeta && (
                      <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ${catMeta.badge}`}>
                        {catMeta.icon} {catMeta.label}
                      </span>
                    )}
                  </div>

                  {/* 主催団体 */}
                  {e.organizer && (
                    <div className="flex items-center gap-1 text-sm text-gray-500 mt-0.5">
                      <Users size={13} className="shrink-0" />
                      主催：{e.organizer}
                    </div>
                  )}

                  {/* 場所 */}
                  {e.event_location && (
                    <div className="flex items-center gap-1 text-sm text-gray-500 mt-0.5">
                      <MapPin size={13} className="shrink-0" />
                      {e.event_location}
                    </div>
                  )}

                  {/* 出典ボタン（記事→無ければPDF） */}
                  {hasArticle ? (
                    <button
                      onClick={() => onOpenArticle(e.linked_article!.id)}
                      className="mt-1.5 inline-flex items-center gap-1 text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1 hover:bg-emerald-100"
                    >
                      <FileText size={13} />
                      記事を読む
                    </button>
                  ) : hasPdf ? (
                    <a
                      href={pdfUrl!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 inline-flex items-center gap-1 text-sm font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-full px-3 py-1 hover:bg-slate-100"
                    >
                      <ExternalLink size={13} />
                      {e.source_pdf_label ? `元のPDF（${e.source_pdf_label}）を見る` : '元のPDFを見る'}
                    </a>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/** 記事表示モーダル（出典「記事を読む」） */
const ArticleModal: React.FC<{ article: Article | null; loading: boolean; onClose: () => void }> = ({
  article,
  loading,
  onClose,
}) => {
  const images = (article?.attachments || []).filter((a: any) => a.type === 'image');
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <span className="text-xs font-bold text-slate-400">出典記事</span>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <p className="text-slate-400 text-sm">読み込み中...</p>
          ) : !article ? (
            <p className="text-slate-400 text-sm">記事が見つかりませんでした。</p>
          ) : (
            <>
              <h2 className="text-xl font-bold text-slate-800 mb-1">{article.title}</h2>
              {article.source && <p className="text-xs text-slate-400 mb-4">{article.source}</p>}
              {images.map((img: any, i: number) => (
                <img key={i} src={img.url} alt="" className="w-full rounded-lg mb-4" />
              ))}
              <div className="text-[15px] leading-relaxed text-slate-700 whitespace-pre-wrap">
                {article.content}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const CalendarView: React.FC<{ previewNewsletterId?: string }> = ({ previewNewsletterId }) => {
  const [events, setEvents] = useState<PublicEventCard[]>([]);
  const [closures, setClosures] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  // 「予約が必要な催し」を隠すフィルタ（当日ふらっと参加したい人向け）
  const [hideReserve, setHideReserve] = useState(false);
  const [current, setCurrent] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  // 出典記事モーダル
  const [articleOpen, setArticleOpen] = useState(false);
  const [article, setArticle] = useState<Article | null>(null);
  const [articleLoading, setArticleLoading] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const [ec, cal] = await Promise.all([
          getPublishedEventCards(previewNewsletterId),
          getCalendarEvents(),
        ]);
        setEvents(ec);
        setClosures(
          new Set(cal.filter((e) => e.event_type === 'closure' || e.is_closure).map((e) => e.date))
        );
      } catch {
        setEvents([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [previewNewsletterId]);

  const openArticle = async (id: string) => {
    setArticleOpen(true);
    setArticle(null);
    setArticleLoading(true);
    try {
      setArticle(await getArticleById(id));
    } catch {
      setArticle(null);
    } finally {
      setArticleLoading(false);
    }
  };

  const year = current.getFullYear();
  const month = current.getMonth();

  const days = useMemo(() => {
    const n = new Date(year, month + 1, 0).getDate();
    const arr: Date[] = [];
    for (let i = 1; i <= n; i++) arr.push(new Date(year, month, i));
    return arr;
  }, [year, month]);

  // 今月なら今日へスクロール
  useEffect(() => {
    todayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [loading, year, month]);

  // スワイプで月送り
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let x0: number | null = null;
    const start = (e: TouchEvent) => (x0 = e.touches[0].clientX);
    const end = (e: TouchEvent) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 50) shiftMonth(dx < 0 ? 1 : -1);
      x0 = null;
    };
    el.addEventListener('touchstart', start);
    el.addEventListener('touchend', end);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchend', end);
    };
  });

  const shiftMonth = (delta: number) =>
    setCurrent((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));

  // 過去の予定は表示しない（今日以降のみ）＋「予約不要のみ表示」フィルタ
  const todayStr = formatDate(new Date());
  const visibleEvents = useMemo(
    () =>
      events.filter(
        (e) =>
          !!e.event_date &&
          e.event_date >= todayStr &&
          !(hideReserve && e.category === 'reserve')
      ),
    [events, todayStr, hideReserve]
  );
  // 予約必須イベントが1件でもあればフィルタUIを出す
  const hasReserveEvents = useMemo(
    () => events.some((e) => !!e.event_date && e.event_date >= todayStr && e.category === 'reserve'),
    [events, todayStr]
  );

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="max-w-2xl mx-auto" ref={containerRef}>
        <div className="space-y-3">
          {/* 月ナビ */}
          <div className="flex items-center justify-between px-1">
            <button
              onClick={() => shiftMonth(-1)}
              aria-label="前の月"
              className="p-2 rounded-full hover:bg-gray-100 active:scale-90 transition-transform"
            >
              <ChevronLeft size={40} className="text-gray-500" />
            </button>
            <span className="text-xl font-bold text-gray-700 tracking-wide">
              {year}年 {month + 1}月
            </span>
            <button
              onClick={() => shiftMonth(1)}
              aria-label="次の月"
              className="p-2 rounded-full hover:bg-gray-100 active:scale-90 transition-transform"
            >
              <ChevronRight size={40} className="text-gray-500" />
            </button>
          </div>

          {/* 予約不要のみ表示フィルタ（予約必須イベントがある月のみ） */}
          {hasReserveEvents && (
            <div className="flex justify-end px-1">
              <label className="inline-flex items-center gap-1.5 text-sm text-gray-500 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hideReserve}
                  onChange={(e) => setHideReserve(e.target.checked)}
                  className="rounded"
                />
                📝 要予約の催しを隠す
              </label>
            </div>
          )}

          {loading && <div className="text-center text-sm text-gray-400 py-4">読み込み中...</div>}

          {/* 日カード */}
          {days.map((date) => {
            const today = isToday(date);
            const dateStr = formatDate(date);
            return (
              <div key={dateStr} ref={today ? todayRef : undefined}>
                <DayCard
                  date={date}
                  events={visibleEvents}
                  today={today}
                  isClosure={closures.has(dateStr)}
                  onOpenArticle={openArticle}
                />
              </div>
            );
          })}
        </div>
      </div>

      {articleOpen && (
        <ArticleModal
          article={article}
          loading={articleLoading}
          onClose={() => setArticleOpen(false)}
        />
      )}
    </div>
  );
};

export default CalendarView;
