/**
 * レポートタブ（関ヶ谷レポート）
 *
 * 「関ヶ谷レポート」枠（newsletter）にぶら下がる記事を一覧表示し、
 * 選択で EventReportView（読み物レンダラー）の詳細に切り替える。
 * 回覧板（CircularsView）とは独立したビュー。
 *
 * 一覧は「最新1件を大きく＋残りをグリッド」の雑誌型。詳細に入るときは
 * 一覧のスクロール位置を覚えておき、戻ったときに同じ場所へ復帰する。
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getNewsletters, getArticlesByNewsletterId } from '@cc-saas/shared';
import type { Article } from '@cc-saas/shared';
import { ChevronLeft, Image as ImageIcon } from 'lucide-react';
import EventReportView from '@/components/public/EventReportView';

const REPORT_NEWSLETTER_TITLE = '関ヶ谷レポート';
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

/** カードのタグ表示（記事カテゴリ別。未知のカテゴリは「レポート」） */
const TAG_LABELS: Record<string, string> = {
  'event-report': 'イベントレポート',
  event: 'イベント',
  column: 'コラム',
  culture: '文化・教養',
  safety: '防犯・防災',
  admin: '運営',
  info: 'お知らせ',
};

/** 一覧カード用の短い日付（例: 2026年8月9日） */
function fmtDateShort(d?: string | null): string | null {
  if (!d) return null;
  const dt = new Date(d + 'T00:00:00');
  if (isNaN(dt.getTime())) return d;
  return `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日`;
}

/** 特集カード用の曜日付き日付（例: 2026年8月9日（日）） */
function fmtDateLong(d?: string | null): string | null {
  if (!d) return null;
  const dt = new Date(d + 'T00:00:00');
  if (isNaN(dt.getTime())) return d;
  return `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日（${WEEK[dt.getDay()]}）`;
}

function thumbOf(a: Article): string | null {
  return a.thumbnail_url || a.attachments?.find((x: any) => x.type === 'image')?.url || null;
}

/** サムネイル未設定のときの代替（カードの高さを揃えるため領域は確保する） */
const ThumbFallback: React.FC = () => (
  <div className="w-full h-full bg-[#f3ede2] flex items-center justify-center">
    <ImageIcon size={28} className="text-[#c9bfa8]" />
  </div>
);

interface ReportsViewProps {
  /** 指定時は、公開済みに限らずこの号IDのレポートを表示する（メンバー確認用プレビュー） */
  previewNewsletterId?: string;
}

const ReportsView: React.FC<ReportsViewProps> = ({ previewNewsletterId }) => {
  const [articles, setArticles] = useState<Article[]>([]);
  const [selected, setSelected] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  /** 詳細に入る直前の一覧スクロール位置（戻ったときに復帰させる） */
  const listScrollY = useRef(0);

  useEffect(() => {
    (async () => {
      try {
        // プレビュー時は号IDを直接使う（下書きでも表示）。通常は公開済みの関ヶ谷レポート号を探す。
        let frameId: string | null = previewNewsletterId ?? null;
        if (!frameId) {
          const ns = await getNewsletters('published');
          frameId = ns.find((n) => n.title === REPORT_NEWSLETTER_TITLE)?.id ?? null;
        }
        if (!frameId) {
          setArticles([]);
          return;
        }
        const data = await getArticlesByNewsletterId(frameId);
        const visible = data
          .filter((a) => a.visibility === 'public' || a.visibility === 'members-only')
          .sort((a, b) => {
            if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
            return (
              new Date(b.event_date || b.created_at).getTime() -
              new Date(a.event_date || a.created_at).getTime()
            );
          });
        setArticles(visible);
      } catch {
        setArticles([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [previewNewsletterId]);

  // 詳細に入ったら先頭から読ませる。一覧に戻ったら元の位置へ戻す。
  useLayoutEffect(() => {
    if (selected) window.scrollTo(0, 0);
    else window.scrollTo(0, listScrollY.current);
  }, [selected]);

  const openArticle = (a: Article) => {
    listScrollY.current = window.scrollY;
    setSelected(a);
  };

  if (selected) {
    return (
      <div className="bg-white min-h-screen">
        {/* 記事ヘッダー（戻る導線＋どの媒体の記事かを常に示す） */}
        <div className="border-b border-[#e5ddcd]">
          <div className="max-w-[720px] mx-auto px-5 h-12 flex items-center justify-between">
            <button
              onClick={() => setSelected(null)}
              className="-ml-2 flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-500 hover:text-[#a93226] hover:bg-[#faf7f2] transition"
            >
              <ChevronLeft size={16} /> レポート一覧
            </button>
            <span className="text-xs font-bold tracking-wider text-[#c0392b]">関ヶ谷レポート</span>
          </div>
        </div>

        <EventReportView article={selected} />

        {/* 読み終わりの戻り導線（記事が長いので末尾にも置く） */}
        <div className="max-w-[720px] mx-auto px-5 pb-16 -mt-10">
          <button
            onClick={() => setSelected(null)}
            className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-[#e5ddcd] bg-[#faf7f2] py-3.5 text-sm font-bold text-[#a93226] hover:bg-[#f5efe4] transition"
          >
            <ChevronLeft size={16} /> レポート一覧に戻る
          </button>
        </div>
      </div>
    );
  }

  const [featured, ...rest] = articles;

  return (
    <div className="bg-[#faf7f2] min-h-screen px-4 py-8 sm:py-10">
      <div className="max-w-3xl mx-auto">
        <header className="mb-7 pb-5 border-b border-[#e5ddcd]">
          <h2 className="text-2xl sm:text-[28px] font-extrabold tracking-tight text-[#2d2a26]">
            関ヶ谷レポート
          </h2>
          <p className="mt-1.5 text-sm text-[#8a8578]">
            まちのできごとを、写真とともにお届けします。
          </p>
        </header>

        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="bg-white rounded-2xl overflow-hidden border border-[#eee6d8] animate-pulse"
              >
                <div className="aspect-[16/10] bg-[#f0e9dd]" />
                <div className="p-4 space-y-2.5">
                  <div className="h-4 w-24 rounded-full bg-[#f0e9dd]" />
                  <div className="h-4 w-3/4 rounded bg-[#f0e9dd]" />
                  <div className="h-3 w-1/3 rounded bg-[#f0e9dd]" />
                </div>
              </div>
            ))}
          </div>
        ) : articles.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#eee6d8] p-10 text-center">
            <p className="text-sm font-bold text-[#4a463f]">まだレポートがありません。</p>
            <p className="mt-1.5 text-xs text-[#8a8578]">
              まちのできごとをまとめて、こちらでお届けしていきます。
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* 最新（またはピン留め）の1件は大きめの特集カードで見せる */}
            <button
              onClick={() => openArticle(featured)}
              className="group block w-full text-left bg-white rounded-2xl overflow-hidden border border-[#eee6d8] shadow-sm hover:shadow-md transition"
            >
              <div className="sm:flex">
                <div className="sm:w-[55%] aspect-[16/10] sm:aspect-auto sm:min-h-[220px] overflow-hidden">
                  {thumbOf(featured) ? (
                    <img
                      src={thumbOf(featured)!}
                      alt=""
                      loading="lazy"
                      className="w-full h-full object-cover transition duration-500 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <ThumbFallback />
                  )}
                </div>
                <div className="flex-1 p-5 sm:p-6 flex flex-col justify-center">
                  <span className="self-start inline-block text-[11px] font-bold text-white bg-[#c0392b] rounded-full px-2.5 py-0.5">
                    {TAG_LABELS[featured.category] ?? 'レポート'}
                  </span>
                  <h3 className="mt-2.5 text-lg sm:text-xl font-extrabold leading-snug text-[#2d2a26] group-hover:text-[#a93226] transition">
                    {featured.title}
                  </h3>
                  {featured.summary && (
                    <p className="mt-2 text-sm leading-relaxed text-[#6b665c] line-clamp-3">
                      {featured.summary}
                    </p>
                  )}
                  {fmtDateLong(featured.event_date) && (
                    <p className="mt-3 text-xs text-[#8a8578]">{fmtDateLong(featured.event_date)}</p>
                  )}
                </div>
              </div>
            </button>

            {rest.length > 0 && (
              <div className="grid gap-5 sm:grid-cols-2">
                {rest.map((a) => {
                  const thumb = thumbOf(a);
                  const date = fmtDateShort(a.event_date);
                  return (
                    <button
                      key={a.id}
                      onClick={() => openArticle(a)}
                      className="group flex flex-col text-left bg-white rounded-2xl overflow-hidden border border-[#eee6d8] shadow-sm hover:shadow-md transition"
                    >
                      <div className="aspect-[16/10] overflow-hidden">
                        {thumb ? (
                          <img
                            src={thumb}
                            alt=""
                            loading="lazy"
                            className="w-full h-full object-cover transition duration-500 group-hover:scale-[1.03]"
                          />
                        ) : (
                          <ThumbFallback />
                        )}
                      </div>
                      <div className="flex-1 p-4">
                        <span className="inline-block text-[11px] font-bold text-white bg-[#c0392b] rounded-full px-2.5 py-0.5 mb-2">
                          {TAG_LABELS[a.category] ?? 'レポート'}
                        </span>
                        <h3 className="font-bold leading-snug text-[#2d2a26] group-hover:text-[#a93226] transition">
                          {a.title}
                        </h3>
                        {date && <p className="mt-1.5 text-xs text-[#8a8578]">{date}</p>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportsView;
