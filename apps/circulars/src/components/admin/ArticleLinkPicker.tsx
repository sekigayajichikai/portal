/**
 * 予定カードにリンクする記事を選ぶ（号をまたいで検索）
 *
 * 以前は同じ号の記事しか選べず、10月号の予定に9月号の詳しい記事（写真付き）を付けるには SQL が必要だった。
 * 公開中の全号の記事（＋この予定の号の記事。下書きでも）を号名付きで並べ、題名・号名で絞り込んで選ぶ。
 * 並びは この予定の号 → 新しい記事の順。
 */

import React, { useEffect, useMemo, useState } from 'react';
import { getArticlesForLinking, type LinkableArticle } from '@cc-saas/shared';
import { Loader2, Search, X, Image as ImageIcon } from 'lucide-react';

interface ArticleLinkPickerProps {
  /** この予定の号（先頭に並べる。下書きの号でも候補に入れる） */
  newsletterId: string;
  /** いまリンクしている記事ID */
  value: string | null;
  onChange: (article: LinkableArticle | null) => void;
  onClose: () => void;
}

export const ArticleLinkPicker: React.FC<ArticleLinkPickerProps> = ({ newsletterId, value, onChange, onClose }) => {
  const [articles, setArticles] = useState<LinkableArticle[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    getArticlesForLinking(newsletterId)
      .then(setArticles)
      .catch((e) => {
        console.error('記事候補の読み込みエラー:', e);
        setError('記事の一覧を読み込めませんでした。');
      });
  }, [newsletterId]);

  const filtered = useMemo(() => {
    if (!articles) return [];
    const q = query.trim().toLowerCase();
    const hit = q
      ? articles.filter((a) => a.title.toLowerCase().includes(q) || (a.newsletter_title ?? '').toLowerCase().includes(q))
      : articles;
    // この予定の号の記事を先頭に（それ以外は取得順＝新しい記事から）
    return [...hit.filter((a) => a.newsletter_id === newsletterId), ...hit.filter((a) => a.newsletter_id !== newsletterId)];
  }, [articles, query, newsletterId]);

  return (
    <div className="border border-slate-200 rounded-lg bg-white shadow-sm">
      <div className="flex items-center gap-2 p-2 border-b border-slate-100">
        <Search size={14} className="text-slate-400 shrink-0" />
        <input
          type="text"
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
          placeholder="記事のタイトル・回覧板の名前で絞り込み（例: ズーラシア、9月号）"
          className="flex-1 min-w-0 text-sm border-0 focus:ring-0 p-0"
        />
        <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600" title="閉じる">
          <X size={14} />
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto py-1">
        {error ? (
          <p className="px-3 py-2 text-xs text-red-600">{error}</p>
        ) : !articles ? (
          <p className="px-3 py-2 text-xs text-slate-400 flex items-center gap-1">
            <Loader2 size={12} className="animate-spin" /> 記事を読み込み中…
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-2 text-xs text-slate-400">当てはまる記事がありません。</p>
        ) : (
          filtered.map((a) => {
            const same = a.newsletter_id === newsletterId;
            return (
              <button
                type="button"
                key={a.id}
                onClick={() => onChange(a)}
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 flex items-center gap-2 ${a.id === value ? 'bg-primary-50' : ''}`}
              >
                <span className={`shrink-0 text-[11px] px-1.5 py-0.5 rounded ${same ? 'bg-primary-100 text-primary-700' : 'bg-slate-100 text-slate-500'}`}>
                  {same ? 'この回覧板' : a.newsletter_title ?? '回覧板なし'}
                </span>
                <span className="truncate flex-1 text-slate-700">{a.title}</span>
                {a.thumbnail_url && (
                  <span title="写真あり" className="shrink-0 text-slate-400">
                    <ImageIcon size={12} />
                  </span>
                )}
                {a.newsletter_status && a.newsletter_status !== 'published' && (
                  <span className="shrink-0 text-[10px] px-1 rounded bg-slate-200 text-slate-500">下書き</span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
