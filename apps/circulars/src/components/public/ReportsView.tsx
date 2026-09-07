/**
 * レポートタブ（関ヶ谷レポート）
 *
 * 「関ヶ谷レポート」枠（newsletter）にぶら下がる記事を一覧表示し、
 * 選択で EventReportView（読み物レンダラー）の詳細に切り替える。
 * 回覧板（CircularsView）とは独立したビュー。
 */

import React, { useEffect, useState } from 'react';
import { getNewsletters, getArticlesByNewsletterId } from '@cc-saas/shared';
import type { Article } from '@cc-saas/shared';
import { ChevronLeft } from 'lucide-react';
import EventReportView from '@/components/public/EventReportView';

const REPORT_NEWSLETTER_TITLE = '関ヶ谷レポート';
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

function fmtDate(d?: string | null): string | null {
  if (!d) return null;
  const dt = new Date(d + 'T00:00:00');
  if (isNaN(dt.getTime())) return d;
  return `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日（${WEEK[dt.getDay()]}）`;
}

interface ReportsViewProps {
  /** 指定時は、公開済みに限らずこの号IDのレポートを表示する（メンバー確認用プレビュー） */
  previewNewsletterId?: string;
}

const ReportsView: React.FC<ReportsViewProps> = ({ previewNewsletterId }) => {
  const [articles, setArticles] = useState<Article[]>([]);
  const [selected, setSelected] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);

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
        // 通常表示は公開中の記事のみ。確認用プレビュー（枠ID指定）では下書き(board-only)も表示する
        const visible = data
          .filter(
            (a) => !!previewNewsletterId || a.visibility === 'public' || a.visibility === 'members-only'
          )
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

  if (selected) {
    return (
      <div style={{ background: '#fff', minHeight: '100vh' }}>
        <button
          onClick={() => setSelected(null)}
          className="flex items-center gap-1 text-slate-500 hover:text-slate-800 text-sm px-5 pt-5"
        >
          <ChevronLeft size={16} /> レポート一覧へ
        </button>
        <EventReportView article={selected} />
      </div>
    );
  }

  return (
    <div style={{ background: '#faf7f2', minHeight: '100vh' }} className="px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-xl font-bold text-slate-800 mb-1">関ヶ谷レポート</h2>
        <p className="text-sm text-slate-500 mb-6">まちのできごとを、写真とともにお届けします。</p>

        {loading ? (
          <p className="text-slate-400 text-sm">読み込み中...</p>
        ) : articles.length === 0 ? (
          <div className="text-slate-400 text-sm bg-white rounded-xl p-8 text-center border border-slate-100">
            まだレポートがありません。
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {articles.map((a) => {
              const thumb =
                a.thumbnail_url || a.attachments?.find((x: any) => x.type === 'image')?.url;
              const date = fmtDate(a.event_date);
              return (
                <button
                  key={a.id}
                  onClick={() => setSelected(a)}
                  className="text-left bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition border border-slate-100"
                >
                  {thumb && (
                    <div className="aspect-[16/10] overflow-hidden">
                      <img src={thumb} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="p-4">
                    <span className="inline-block text-[11px] font-bold text-white bg-[#c0392b] rounded-full px-2.5 py-0.5 mb-2">
                      イベントレポート
                    </span>
                    <h3 className="font-bold text-slate-800 leading-snug mb-1">{a.title}</h3>
                    {date && <p className="text-xs text-slate-400">{date}</p>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportsView;
