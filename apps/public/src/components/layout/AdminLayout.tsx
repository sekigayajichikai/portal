/**
 * 管理画面用レイアウトコンポーネント
 * 左サイドバーメニューとメインコンテンツエリアを提供
 * Interフォント、モノクロアイコン、洗練されたデザイン
 */
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  DollarSign, 
  Bus, 
  Radio, 
  Globe,
  Monitor,
  Bell,
  User
} from 'lucide-react';

interface AdminLayoutProps {
  children: React.ReactNode;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ children }) => {
  const location = useLocation();

  const mainNavItems = [
    { path: '/admin/dashboard', label: 'ダッシュボード', icon: LayoutDashboard },
    { path: '/admin/members', label: '会員管理', icon: Users },
    { path: '/admin/circulars', label: 'デジタル回覧板', icon: FileText },
    { path: '/admin/fees', label: '会費管理', icon: DollarSign },
    { path: '/admin/content', label: '生活・交通情報', icon: Bus },
  ];

  const aiNavItems = [
    { path: '/admin/radio', label: 'AI ラジオ局', icon: Radio },
    { path: '/admin/public', label: '公開ウェブ情報', icon: Globe },
  ];

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <div className="min-h-screen bg-slate-50 flex admin-font">
      {/* 左サイドバー */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col fixed h-full">
        {/* ロゴエリア */}
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-xl bg-blue-600">
              C
            </div>
            <h1 className="text-lg font-semibold text-slate-800 tracking-tight">CommunityConnect</h1>
          </div>
        </div>

        {/* 管理メニュータイトル */}
        <div className="px-6 py-2.5 border-b border-slate-200">
          <h2 className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">管理メニュー</h2>
        </div>

        {/* メインナビゲーション項目 */}
        <nav className="flex-1 p-3 space-y-0.5">
          {mainNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 ${
                  active
                    ? 'bg-blue-50 text-blue-600 shadow-sm'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Icon size={18} strokeWidth={1.5} className={active ? 'text-blue-600' : 'text-slate-500'} />
                <span className="text-sm font-medium tracking-tight">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* AI・広報セクション見出し */}
        <div className="px-6 py-2.5 border-t border-slate-200">
          <h2 className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">AI・広報</h2>
        </div>

        {/* AI・広報ナビゲーション項目 */}
        <nav className="p-3 space-y-0.5">
          {aiNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 ${
                  active
                    ? 'bg-blue-50 text-blue-600 shadow-sm'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Icon size={18} strokeWidth={1.5} className={active ? 'text-blue-600' : 'text-slate-500'} />
                <span className="text-sm font-medium tracking-tight">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* メインコンテンツエリア */}
      <div className="flex-1 ml-64">
        {/* ヘッダー */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center">
          {/* 左側: CC SaaS */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-800 tracking-tight">CC SaaS</span>
            <Monitor size={18} className="text-slate-500" />
          </div>

          {/* 右側: 通知ベルとユーザーアバター */}
          <div className="flex items-center gap-3">
            {/* 通知ベル */}
            <button className="relative p-2 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors">
              <Bell size={20} className="text-slate-500" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>

            {/* ユーザーアバター */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-700 tracking-tight">管理者</span>
              <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                <User size={16} className="text-slate-600" />
              </div>
            </div>
          </div>
        </header>

        {/* メインコンテンツ */}
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
