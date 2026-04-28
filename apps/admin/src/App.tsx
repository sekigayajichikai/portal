import React, { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Dashboard } from '@/components/layout/Dashboard';
import { MemberManagement } from '@/components/members/MemberManagement';
import { CircularBoard } from '@/components/circulars/CircularBoard';
import { FeeManagement } from '@/components/members/FeeManagement';
import { LifestyleManager } from '@/components/lifestyle/LifestyleManager';
import { RadioGenerator } from '@/components/radio/RadioGenerator';
import { PublicContent } from '@/components/content/PublicContent';
import { AppView, PublicEvent, AuthProvider, useAuth, PasswordLogin } from '@cc-saas/shared';

/**
 * 管理画面のメインコンテンツ
 * 認証状態をチェックして、未ログイン時はPasswordLoginを表示します
 */
function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  // Shared state for extracted events (simulating backend persistence)
  const [extractedEvents, setExtractedEvents] = useState<PublicEvent[]>([]);

  const handleEventsExtracted = (events: PublicEvent[]) => {
    // Add new unique events
    setExtractedEvents((prev) => [...prev, ...events]);
  };

  const renderView = () => {
    switch (currentView) {
      case AppView.DASHBOARD:
        return <Dashboard />;
      case AppView.MEMBERS:
        return <MemberManagement />;
      case AppView.CIRCULAR_BOARD:
        return <CircularBoard onEventsExtracted={handleEventsExtracted} />;
      case AppView.FEES:
        return <FeeManagement />;
      case AppView.LIFESTYLE:
        return <LifestyleManager />;
      case AppView.RADIO_STATION:
        return <RadioGenerator />;
      case AppView.PUBLIC_CONTENT:
        return <PublicContent events={extractedEvents} />;
      default:
        return <Dashboard />;
    }
  };

  // 認証状態の初期化中
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-xl text-gray-600">読み込み中...</div>
      </div>
    );
  }

  // 未ログインの場合はパスワード入力画面を表示
  if (!isAuthenticated) {
    return <PasswordLogin />;
  }

  // ログイン済みの場合は通常の管理画面を表示
  return (
    <Layout currentView={currentView} onChangeView={setCurrentView}>
      <div className="animate-in fade-in duration-300">{renderView()}</div>
    </Layout>
  );
}

/**
 * 管理画面のルートコンポーネント
 * AuthProviderでアプリ全体をラップして認証機能を提供します
 */
function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
