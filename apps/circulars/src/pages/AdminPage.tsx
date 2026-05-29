import React, { useState } from 'react';
import { AuthProvider, useAuth, PasswordLogin } from '@cc-saas/shared';
import { CircularBoard } from '@/components/admin/CircularBoard';
import { PublisherManager } from '@/components/admin/PublisherManager';
import { FileText, Settings } from 'lucide-react';

function AdminContent() {
  const { isAuthenticated, isLoading } = useAuth();

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

  const [showPublisherManager, setShowPublisherManager] = useState(false);

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
        <button
          onClick={() => setShowPublisherManager(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition"
        >
          <Settings size={16} />
          設定
        </button>
      </header>
      <PublisherManager isOpen={showPublisherManager} onClose={() => setShowPublisherManager(false)} />
      <main className="p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <CircularBoard />
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
