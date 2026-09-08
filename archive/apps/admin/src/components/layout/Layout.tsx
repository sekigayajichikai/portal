import React from 'react';
import { AppView } from '@cc-saas/shared';
import {
  LayoutDashboard,
  Users,

  CreditCard,
  Bus,
  Radio,
  Globe,
  Bell,
  Menu,
} from 'lucide-react';

interface LayoutProps {
  currentView: AppView;
  onChangeView: (view: AppView) => void;
  children: React.ReactNode;
}

const NavItem = ({
  view,
  current,
  icon: Icon,
  label,
  onClick,
}: {
  view: AppView;
  current: AppView;
  icon: React.ElementType;
  label: string;
  onClick: (v: AppView) => void;
}) => {
  const isActive = view === current;
  return (
    <button
      onClick={() => onClick(view)}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium ${
        isActive
          ? 'bg-white shadow-md text-primary-600'
          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
      }`}
    >
      <Icon size={20} className={isActive ? 'text-primary-600' : 'text-slate-400'} />
      <span>{label}</span>
    </button>
  );
};

export const Layout: React.FC<LayoutProps> = ({ currentView, onChangeView, children }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-slate-50 border-r border-slate-200 p-4 transform transition-transform duration-300 lg:translate-x-0 ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2 px-2 mb-8 mt-2">
          <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center text-white font-bold text-xl">
            C
          </div>
          <span className="text-xl font-bold text-slate-800 tracking-tight">
            Community<span className="text-primary-600">Connect</span>
          </span>
        </div>

        <nav className="space-y-1">
          <div className="px-2 mb-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
            管理メニュー
          </div>
          <NavItem
            view={AppView.DASHBOARD}
            current={currentView}
            icon={LayoutDashboard}
            label="ダッシュボード"
            onClick={onChangeView}
          />
          <NavItem
            view={AppView.MEMBERS}
            current={currentView}
            icon={Users}
            label="会員管理"
            onClick={onChangeView}
          />
          <NavItem
            view={AppView.FEES}
            current={currentView}
            icon={CreditCard}
            label="会費管理"
            onClick={onChangeView}
          />
          <NavItem
            view={AppView.LIFESTYLE}
            current={currentView}
            icon={Bus}
            label="生活・交通情報"
            onClick={onChangeView}
          />

          <div className="px-2 mt-6 mb-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
            AI・広報
          </div>
          <NavItem
            view={AppView.RADIO_STATION}
            current={currentView}
            icon={Radio}
            label="AI ラジオ局"
            onClick={onChangeView}
          />
          <NavItem
            view={AppView.PUBLIC_CONTENT}
            current={currentView}
            icon={Globe}
            label="公開ウェブ情報"
            onClick={onChangeView}
          />
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-30">
          <button
            className="lg:hidden p-2 text-slate-600"
            onClick={() => setIsMobileMenuOpen(true)}
          >
            <Menu size={24} />
          </button>

          <h1 className="text-lg font-bold text-slate-700 hidden lg:block">
            {currentView === AppView.DASHBOARD && '全体サマリー'}
            {currentView === AppView.MEMBERS && '会員名簿管理'}

            {currentView === AppView.FEES && '会費・決済'}
            {currentView === AppView.LIFESTYLE && '生活インフラ情報'}
            {currentView === AppView.RADIO_STATION && 'AI ラジオ制作スタジオ'}
            {currentView === AppView.PUBLIC_CONTENT && '外部公開カレンダー'}
          </h1>

          <div className="flex items-center gap-4">
            <button className="relative p-2 text-slate-400 hover:text-slate-600 transition-colors">
              <Bell size={20} />
              <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
            </button>
            <div className="flex items-center gap-2 pl-4 border-l border-slate-200">
              <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden">
                <img
                  src="https://picsum.photos/100/100"
                  alt="Admin"
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="text-sm font-medium text-slate-600 hidden md:block">管理者</span>
            </div>
          </div>
        </header>

        {/* Scrollable Area */}
        <div className="flex-1 overflow-auto p-4 md:p-8 relative">
          <div className="max-w-7xl mx-auto h-full">{children}</div>
        </div>
      </main>
    </div>
  );
};
