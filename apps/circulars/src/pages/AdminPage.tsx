import React, { useState } from 'react';
import { AuthProvider, useAuth, PasswordLogin } from '@cc-saas/shared';
import { CircularBoard } from '@/components/admin/CircularBoard';
import { ReportBoard } from '@/components/admin/ReportBoard';
import { WeeklyDigest } from '@/components/admin/WeeklyDigest';
import { RichMenuManager } from '@/components/admin/RichMenuManager';
import { MastersPanel } from '@/components/admin/MastersPanel';
import { EventsPanel } from '@/components/admin/EventsPanel';
import { FileText, LogOut, Newspaper, Send, LayoutGrid, Database, Calendar, Trash2 } from 'lucide-react';
import { TrashDialog } from '@/components/admin/TrashDialog';
import { appConfirm } from '@/components/ui/feedback';

/** 管理画面の作成対象。'circulars' = 電子回覧板（PDF抽出）/ 'reports' = 関ヶ谷レポート（読み物記事）/ 'weekly' = 週次配信 / 'richmenu' = LINE リッチメニュー / 'events' = 予定（号をまたぐ予定カードの一覧・編集）/ 'masters' = マスタ（会場・主催団体・発行元） */
type AdminMode = 'circulars' | 'reports' | 'weekly' | 'richmenu' | 'events' | 'masters';

function AdminContent() {
  const { isAuthenticated, isLoading, logout, aiReady } = useAuth();
  const [showTrash, setShowTrash] = useState(false);
  // URLの ?mode=reports で直接レポート画面を開ける（ブックマーク用）
  const [mode, setMode] = useState<AdminMode>(() =>
    (['reports', 'weekly', 'richmenu', 'events', 'masters'].find((m) => m === new URLSearchParams(window.location.search).get('mode')) as AdminMode | undefined) ?? 'circulars'
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
            関ヶ谷ポータル 管理
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowTrash(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition"
          >
            <Trash2 size={16} />
            ゴミ箱
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
      {showTrash && <TrashDialog onClose={() => setShowTrash(false)} />}
      {!aiReady && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 text-sm text-amber-800">
          AI の読み取りと LINE 配信の準備ができていません。いったん「ログアウト」して、もう一度ログインしてください。
          それでもこの表示が消えないときは、サーバー側のパスワード設定がずれています。管理担当に連絡してください（それ以外の作業はそのまま続けられます）。
        </div>
      )}
      {/* 作成対象の切替: 電子回覧板 / 関ヶ谷レポート / 週次配信 / リッチメニュー / 予定 / マスタ */}
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
          <button
            onClick={() => setMode('weekly')}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-bold border-b-2 transition ${
              mode === 'weekly'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <Send size={16} />
            週次配信
          </button>
          <button
            onClick={() => setMode('richmenu')}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-bold border-b-2 transition ${
              mode === 'richmenu'
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <LayoutGrid size={16} />
            リッチメニュー
          </button>
          <button
            onClick={() => setMode('events')}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-bold border-b-2 transition ${
              mode === 'events'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
            title="号をまたいで予定カードを一覧・編集"
          >
            <Calendar size={16} />
            予定
          </button>
          <button
            onClick={() => setMode('masters')}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-bold border-b-2 transition ml-auto ${
              mode === 'masters'
                ? 'border-slate-600 text-slate-800'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
            title="会場・主催団体・発行元の名前の一覧"
          >
            <Database size={16} />
            マスタ
          </button>
        </div>
      </div>

      <main className="p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          {mode === 'circulars' ? <CircularBoard /> : mode === 'reports' ? <ReportBoard /> : mode === 'weekly' ? <WeeklyDigest /> : mode === 'richmenu' ? <RichMenuManager /> : mode === 'events' ? <EventsPanel /> : <MastersPanel />}
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
