/**
 * レポートタブ（関ヶ谷レポート）
 *
 * 「関ヶ谷レポート」枠（newsletter）にぶら下がる記事を一覧表示し、
 * 選択で EventReportView（読み物レンダラー）の詳細に切り替える。
 * 回覧板（CircularsView）とは独立したビュー。
 *
 * レポートごとの URL: /?report=<記事ID>
 * - 一覧から開いたときにブラウザの URL をこの形に書き換える（共有・ブックマーク用）
 * - この URL で直接開いたときは、そのレポートを最初から表示する
 * - ブラウザの「戻る」で一覧に戻れる
 */

import React, { useEffect, useState } from 'react';
import { getNewsletters, getArticlesByNewsletterId, getArticleById } from '@cc-saas/shared';
import type { Article } from '@cc-saas/shared';
import { ChevronLeft, Link as LinkIcon, Check } from 'lucide-react';
import EventReportView from '@/components/public/EventReportView';

const REPORT_NEWSLETTER_TITLE = '関ヶ谷レポート';
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

function fmtDate(d?: string | null): string | null {
  if (!d) return null;
  const dt = new Date(d + 'T00:00:00');
  if (isNaN(dt.getTime())) return d;
  return `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日（${WEEK[dt.getDay()]}）`;
}

/** レポート個別ページの URL（共有用） */
export function reportUrl(articleId: string): string {
  return `${window.location.origin}/?report=${articleId}`;
}

/** URL の ?report= から記事IDを読む */
function readReportIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('report');
}

interface ReportsViewProps {
  /** 指定時は、公開済みに限らずこの号IDのレポートを表示する（メンバー確認用プレビュー） */
  previewNewsletterId?: string;
  /** 最初から開くレポートの記事ID（/?report=<id> で開いたとき） */
  initialArticleId?: string;
}

const ReportsView: React.FC<ReportsViewProps> = ({ previewNewsletterId, initialArticleId }) => {
  const [articles, setArticles] = useState<Article[]>([]);
  const [selected, setSelected] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      let visible: Article[] = [];
      try {
        // プレビュー時は号IDを直接使う（下書きでも表示）。通常は公開済みの関ヶ谷レポート号を探す。
        let frameId: string | null = previewNewsletterId ?? null;
        if (!frameId) {
          const ns = await getNewsletters('published');
          frameId = ns.find((n) => n.title === REPORT_NEWSLETTER_TITLE)?.id ?? null;
        }
        if (frameId) {
          const data = await getArticlesByNewsletterId(frameId);
          // 通常表示は公開中の記事のみ。確認用プレビュー（枠ID指定）では下書き(board-only)も表示する
          visible = data
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
        }
        setArticles(visible);
      } catch {
        setArticles([]);
      } finally {
        setLoading(false);
      }

      // /?report=<id> で開いた場合はそのレポートを最初から表示する
      if (initialArticleId) {
        const found = visible.find((a) => a.id === initialArticleId);
        if (found) {
          setSelected(found);
          return;
        }
        // 一覧に無い（読み込み順の都合など）場合は単体で取得。非公開の記事は出さない
        try {
          const a = await getArticleById(initialArticleId);
          if (a && a.visibility !== 'board-only') setSelected(a);
        } catch {
          // 見つからなければ一覧のまま
        }
      }
    })();
  }, [previewNewsletterId, initialArticleId]);

  // ブラウザの「戻る／進む」に追従する
  useEffect(() => {
    const onPop = () => {
      const id = readReportIdFromUrl();
      if (!id) {
        setSelected(null);
        return;
      }
      setSelected((cur) => (cur?.id === id ? cur : articles.find((a) => a.id === id) ?? cur));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [articles]);

  const open = (a: Article) => {
    setSelected(a);
    setCopied(false);
    // 共有・ブックマークできるよう URL を書き換える（プレビュー時はそのままにする）
    if (!previewNewsletterId) {
      window.history.pushState({ report: a.id }, '', `/?report=${a.id}`);
    }
    window.scrollTo({ top: 0 });
  };

  const back = () => {
    setSelected(null);
    if (!previewNewsletterId && readReportIdFromUrl()) {
      window.history.pushState(null, '', '/');
    }
  };

  const copyLink = async () => {
    if (!selected) return;
    const url = reportUrl(selected.id);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('このリンクをコピーしてください', url);
    }
  };

  if (selected) {
    return (
      <div style={{ background: '#fff', minHeight: '100vh' }}>
        <div className="flex items-center justify-between px-5 pt-5">
          <button
            onClick={back}
            className="flex items-center gap-1 text-slate-500 hover:text-slate-800 text-sm"
          >
            <ChevronLeft size={16} /> レポート一覧へ
          </button>
          {!previewNewsletterId && (
            <button
              onClick={copyLink}
              className="flex items-center gap-1 text-slate-500 hover:text-slate-800 text-sm"
              title="このレポートのリンクをコピー（LINE等で共有できます）"
            >
              {copied ? <Check size={14} className="text-green-600" /> : <LinkIcon size={14} />}
              {copied ? 'コピーしました' : 'リンクをコピー'}
            </button>
          )}
        </div>
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
                <a
                  key={a.id}
                  href={`/?report=${a.id}`}
                  onClick={(e) => {
                    // 通常クリックはアプリ内で開く（Ctrl/⌘クリックや中クリックは新しいタブに任せる）
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                    e.preventDefault();
                    open(a);
                  }}
                  className="block text-left bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition border border-slate-100"
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
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportsView;
