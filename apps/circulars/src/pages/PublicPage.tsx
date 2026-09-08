import React, { useState } from 'react';
import CircularsView from '@/components/public/CircularsView';
import ReportsView from '@/components/public/ReportsView';
import ReportReviewView from '@/components/public/ReportReviewView';
// 後で再追加する可能性があるため import は残す（今はタブ非表示）
// import CalendarView from '@/components/public/CalendarView';
// import BookingsView from '@/components/public/BookingsView';

type Tab = 'circulars' | 'reports';

export default function PublicPage() {
  const params = new URLSearchParams(window.location.search);
  // レポート個別URL: /?report=<記事ID> で開いたときはレポートタブでそのレポートを表示する
  const reportArticleId = params.get('report') || undefined;
  const [tab, setTab] = useState<Tab>(reportArticleId ? 'reports' : 'circulars');
  // 公開プレビュー: ?preview=<号ID> があれば、未公開の下書きを「公開後の見え方」で表示する
  // （公開ステータスは変更しないので本番に影響しない）
  const previewNewsletterId = params.get('preview') || undefined;
  // レポートのメンバー確認: ?report-review=<記事ID> があれば、
  // その記事だけを「見てもらう用」に表示する（ログイン不要・公開はしない・下書きも表示）。
  const reportReviewId = params.get('report-review') || undefined;

  const tabClass = (active: boolean, activeColor: string) =>
    `flex-1 py-3 px-1 text-xs sm:text-sm font-bold transition border-b-2 whitespace-nowrap ${
      active ? activeColor : 'border-transparent text-slate-400 hover:text-slate-600'
    }`;

  // レポートのメンバー確認モード: タブを出さず、確認用の帯＋レポートのみ表示
  if (reportReviewId) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="bg-amber-100 text-amber-800 text-sm text-center py-2 px-4 font-medium">
          🔍 確認用ページ（メンバー向け）— まだ一般公開はされていません
        </div>
        <ReportReviewView id={reportReviewId} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 公開プレビューの帯（本番には影響しない旨を明示） */}
      {previewNewsletterId && (
        <div className="bg-amber-100 text-amber-800 text-sm text-center py-2 px-4 font-medium">
          🔍 公開プレビュー中（未公開の下書きを表示しています。実際にはまだ公開されていません）
        </div>
      )}
      {/* 回覧板 / レポート タブ（カレンダー・会館予約は今は非表示。後で追加するかも） */}
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto flex">
          <button
            onClick={() => setTab('circulars')}
            className={tabClass(tab === 'circulars', 'border-blue-600 text-blue-700')}
          >
            回覧板
          </button>
          <button
            onClick={() => setTab('reports')}
            className={tabClass(tab === 'reports', 'border-[#c0392b] text-[#a93226]')}
          >
            レポート
          </button>
          {/* 後で再追加する場合はここにカレンダー/会館予約タブを戻す */}
        </div>
      </div>

      {tab === 'circulars' && (
        <CircularsView
          isSimpleMode={false}
          excludeNewsletterTitles={['関ヶ谷レポート']}
          previewNewsletterId={previewNewsletterId}
        />
      )}
      {tab === 'reports' && <ReportsView initialArticleId={reportArticleId} />}
      {/* {tab === 'calendar' && <CalendarView previewNewsletterId={previewNewsletterId} />} */}
      {/* {tab === 'bookings' && <BookingsView />} */}
    </div>
  );
}
