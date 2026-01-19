/**
 * 管理画面ダッシュボードビュー
 * 統計カード、グラフ、お知らせを統合表示
 * Interフォント、タイトな余白、洗練されたデザイン
 */
import React from 'react';
import {
  getAdminStats,
  getGroupPaymentStats,
  getRecentNotices,
} from '@/services/admin/adminDataService';
import SummaryCards from './SummaryCards';
import PaymentChart from './PaymentChart';
import RecentNotices from './RecentNotices';

const DashboardView: React.FC = () => {
  const stats = getAdminStats();
  const groupStats = getGroupPaymentStats();
  const notices = getRecentNotices();

  return (
    <div className="admin-font">
      {/* タイトル */}
      <h1 className="text-2xl font-semibold text-slate-800 mb-6 tracking-tight">全体サマリー</h1>

      {/* 統計カード */}
      <SummaryCards stats={stats} />

      {/* グラフとお知らせの2カラムレイアウト */}
      <div className="grid grid-cols-2 gap-5">
        <PaymentChart data={groupStats} />
        <RecentNotices notices={notices} />
      </div>
    </div>
  );
};

export default DashboardView;
