/**
 * レポートのメンバー確認ページ（記事単位）
 *
 * /?report-review=<記事ID> で開く。ログイン不要・公開はしない。
 * 非公開（下書き）の記事もそのまま表示するので、公開前にメンバーに見てもらえる。
 *
 * 後方互換: 以前は <レポート枠のID> を渡す形式だった。記事が見つからなければ
 * 枠IDとみなし、その枠のレポート一覧（下書き含む）を表示する。
 */

import React, { useEffect, useState } from 'react';
import { getArticleById } from '@cc-saas/shared';
import type { Article } from '@cc-saas/shared';
import { Loader2 } from 'lucide-react';
import EventReportView from '@/components/public/EventReportView';
import ReportsView from '@/components/public/ReportsView';

interface ReportReviewViewProps {
  /** 記事ID（見つからなければレポート枠IDとして扱う） */
  id: string;
}

const ReportReviewView: React.FC<ReportReviewViewProps> = ({ id }) => {
  const [article, setArticle] = useState<Article | null | undefined>(undefined);

  useEffect(() => {
    (async () => {
      try {
        setArticle(await getArticleById(id));
      } catch {
        setArticle(null);
      }
    })();
  }, [id]);

  if (article === undefined) {
    return (
      <div className="flex items-center justify-center gap-2 text-slate-400 text-sm py-16">
        <Loader2 size={16} className="animate-spin" /> 読み込み中...
      </div>
    );
  }

  if (article === null) {
    // 旧形式（枠ID）のリンク: 枠内のレポート一覧を下書き込みで表示
    return <ReportsView previewNewsletterId={id} />;
  }

  return (
    <div style={{ background: '#fff', minHeight: '100vh' }}>
      <EventReportView article={article} />
    </div>
  );
};

export default ReportReviewView;
