import React from 'react';
import AdminPage from '@/pages/AdminPage';
import PublicPage from '@/pages/PublicPage';
import ReviewPage from '@/pages/ReviewPage';
import ReportPreviewPage from '@/pages/ReportPreviewPage';
import { FeedbackHost } from '@/components/ui/feedback';

function App() {
  const pathname = window.location.pathname;

  let page = <PublicPage />;
  if (pathname.startsWith('/admin')) {
    page = <AdminPage />;
  } else if (pathname.startsWith('/review/')) {
    // 担当者向け公開前確認ページ（トークンリンク・ログイン不要）
    page = <ReviewPage />;
  } else if (pathname.startsWith('/report-preview')) {
    // 開発用: イベントレポート専用レンダラーの見比べプレビュー（DB不要）
    page = <ReportPreviewPage />;
  }

  return (
    <>
      {page}
      <FeedbackHost />
    </>
  );
}

export default App;
