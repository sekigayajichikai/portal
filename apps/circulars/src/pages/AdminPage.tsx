import React, { useState } from 'react';
import { AuthProvider, useAuth, PasswordLogin } from '@cc-saas/shared';
import { CircularBoard } from '@/components/admin/CircularBoard';
import { PublisherManager } from '@/components/admin/PublisherManager';
import { OrganizerManager } from '@/components/admin/OrganizerManager';
import { ReportBoard } from '@/components/admin/ReportBoard';
import { FileText, Settings, Users, LogOut, Newspaper } from 'lucide-react';
import { appConfirm } from '@/components/ui/feedback';

/** 管理画面の作成対象。'circulars' = 電子回覧板（PDF抽出）/ 'reports' = 関ヶ谷レポート（読み物記事） */
type AdminMode = 'circulars' | 'reports';

function AdminContent() {
  const { isAuthenticated, isLoading, logout } = useAuth();
  const [showPublisherManager, setShowPublisherManager] = useState(false);
  const [showOrganizerManager, setShowOrganizerManager] = useState(false);
  // URLの ?mode=reports で直接レポート画面を開ける（ブックマーク用）
  const [mode, setMode] = useState<AdminMode>(() =>
    new URLSearchParams(window.location.search).get('mode') === 'reports' ? 'reports' : 'circulars'
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-xl text-gray-600">読み込み中...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <PasswordLogin />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center text-white">
            <FileText size={18} />
          </div>
          <span className="text-xl font-bold text-slate-800 tracking-tight">
            電子回覧板
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowOrganizerManager(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition"
          >
            <Users size={16} />
            主催団体
          </button>
          <button
            onClick={() => setShowPublisherManager(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition"
          >
            <Settings size={16} />
            発行元
          </button>
          <button
            onClick={async () => {
              if (await appConfirm({ title: 'ログアウトしますか？', confirmLabel: 'ログアウト' })) {
                logout();
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition"
          >
            <LogOut size={16} />
            ログアウト
          </button>
        </div>
      </header>
      <PublisherManager isOpen={showPublisherManager} onClose={() => setShowPublisherManager(false)} />
      <OrganizerManager isOpen={showOrganizerManager} onClose={() => setShowOrganizerManager(false)} />

      {/* 作成対象の切替: 電子回覧板 / 関ヶ谷レポート */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 flex gap-1">
          <button
            onClick={() => setMode('circulars')}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-bold border-b-2 transition ${
              mode === 'circulars'
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <FileText size={16} />
            電子回覧板
          </button>
          <button
            onClick={() => setMode('reports')}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-bold border-b-2 transition ${
              mode === 'reports'
                ? 'border-[#c0392b] text-[#a93226]'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <Newspaper size={16} />
            関ヶ谷レポート
          </button>
        </div>
      </div>

      <main className="p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          {mode === 'circulars' ? <CircularBoard /> : <ReportBoard />}
        </div>
      </main>
    </div>
  );
}

export default function AdminPage() {
  return (
    <AuthProvider>
      <AdminContent />
    </AuthProvider>
  );
}
