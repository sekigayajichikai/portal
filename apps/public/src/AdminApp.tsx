/**
 * 管理者用アプリケーション
 * react-router-domを使用したルーティング設定
 */
import React from 'react';
import { Routes, Route } from 'react-router-dom';
import AdminLayout from './components/layout/AdminLayout';
import DashboardView from './features/admin/dashboard/DashboardView';
import MembersView from './features/admin/members/MembersView';
import CircularsView from './features/admin/circulars/CircularsView';
import FeesView from './features/admin/fees/FeesView';
import ContentView from './features/admin/content/ContentView';
import RadioView from './features/admin/radio/RadioView';
import PublicView from './features/admin/public/PublicView';

const AdminApp: React.FC = () => {
  return (
    <AdminLayout>
      <Routes>
        <Route path="/dashboard" element={<DashboardView />} />
        <Route path="/members" element={<MembersView />} />
        <Route path="/circulars" element={<CircularsView />} />
        <Route path="/fees" element={<FeesView />} />
        <Route path="/content" element={<ContentView />} />
        <Route path="/radio" element={<RadioView />} />
        <Route path="/public" element={<PublicView />} />
        {/* デフォルトはダッシュボードにリダイレクト */}
        <Route path="/" element={<DashboardView />} />
      </Routes>
    </AdminLayout>
  );
};

export default AdminApp;
