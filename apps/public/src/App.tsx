import React, { useState, useEffect } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { TabType, User, Circular, Payment } from '@/types/types';
import {
  GARBAGE_DATA,
  MOCK_EVENTS,
  MOCK_USER,
  INITIAL_CIRCULARS,
  INITIAL_PAYMENTS,
} from '@/utils/constants';

import Dashboard from '@/components/features/dashboard/Dashboard';
import HomeView from '@/components/features/home/HomeView';
import CircularsView from '@/components/features/circulars/CircularsView';
import GarbageCalendarView from '@/components/features/garbage/GarbageCalendarView';
import BusScheduleView from '@/components/features/bus/BusScheduleView';
import EventCalendarView from '@/components/features/calendar/EventCalendarView';
import CommunityRadioView from '@/components/features/radio/CommunityRadioView';
import { fetchBusSchedules } from '@cc-saas/shared/services';
import type { BusSchedule } from '@cc-saas/shared/types';
import { AuthProvider, useAuth, PasswordLogin } from '@cc-saas/shared';

/**
 * アプリケーションのメインコンテンツ
 * 認証状態をチェックして、未ログイン時はPasswordLoginを表示します
 */
const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  // localStorageから設定を読み込み（永続化）
  const loadSimpleModeFromStorage = (): boolean => {
    const saved = localStorage.getItem('isSimpleMode');
    return saved === 'true';
  };

  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [isSimpleMode, setIsSimpleMode] = useState(loadSimpleModeFromStorage);
  const [currentTime, setCurrentTime] = useState(new Date());

  // バス時刻表をデータベースから取得（元のデータベース形式）
  const [busSchedules, setBusSchedules] = useState<BusSchedule[]>([]);
  const [isBusSchedulesLoading, setIsBusSchedulesLoading] = useState(true);

  useEffect(() => {
    const loadBusSchedules = async () => {
      try {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🚌 App.tsx - バス時刻表を取得中...');
        const schedules = await fetchBusSchedules();
        console.log('🚌 App.tsx - 取得完了:');
        console.log('  📊 取得件数:', schedules.length);
        console.log('  📝 取得データ:', schedules);
        
        // ユニークなバス停名を抽出して確認
        const uniqueStopNames = [...new Set(schedules.map(s => s.stopName))].sort();
        console.log('  🏷️ ユニークなバス停名:', uniqueStopNames);
        console.log('  🏷️ ユニークなバス停の数:', uniqueStopNames.length);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        setBusSchedules(schedules);
      } catch (error) {
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('❌ バス時刻表の取得に失敗しました:', error);
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      } finally {
        setIsBusSchedulesLoading(false);
      }
    };

    loadBusSchedules();
  }, []);

  // Auth & Dashboard State
  const [user, setUser] = useState<User | null>(null);
  const [circulars, setCirculars] = useState<Circular[]>(INITIAL_CIRCULARS);
  const [payments, setPayments] = useState<Payment[]>(INITIAL_PAYMENTS);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Auth Handlers
  const handleLogin = () => {
    setUser(MOCK_USER);
  };
  const handleLogout = () => {
    setUser(null);
    setActiveTab('home');
  };

  // Dashboard Handlers
  const toggleCircularRead = (id: string) => {
    setCirculars((prev) =>
      prev.map((c) => {
        if (c.id === id) {
          // Increase mock read rate slightly when user reads
          const newRate = Math.min(c.groupReadRate + 5, 100);
          return { ...c, isRead: true, groupReadRate: newRate };
        }
        return c;
      })
    );
  };

  const handlePayment = (id: string) => {
    if (confirm('支払いを実行しますか？ (デモ)')) {
      setPayments((prev) => prev.map((p) => (p.id === id ? { ...p, status: 'paid' } : p)));
    }
  };

  const toggleSimpleMode = () => {
    const newMode = !isSimpleMode;
    setIsSimpleMode(newMode);
    // localStorageに保存（永続化）
    localStorage.setItem('isSimpleMode', String(newMode));
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

  // ログイン済みの場合は通常のアプリを表示
  return (
    <MainLayout
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      isSimpleMode={isSimpleMode}
      toggleSimpleMode={toggleSimpleMode}
      user={user}
    >
      {activeTab === 'dashboard' && (
        <Dashboard
          user={user}
          onLogin={handleLogin}
          onLogout={handleLogout}
          isSimpleMode={isSimpleMode}
          circulars={circulars}
          toggleRead={toggleCircularRead}
          payments={payments}
          onPay={handlePayment}
        />
      )}

      {activeTab === 'home' && (
        <HomeView
          isSimpleMode={isSimpleMode}
          busSchedules={busSchedules}
          events={MOCK_EVENTS}
          currentTime={currentTime}
        />
      )}

      {/* #region agent log */}
      {(()=>{fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.tsx:100',message:'Rendering circulars tab check',data:{activeTab,shouldRenderCirculars:activeTab==='circulars'},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});return null;})()}
      {/* #endregion */}

      {activeTab === 'circulars' && <CircularsView isSimpleMode={isSimpleMode} />}

      {activeTab === 'garbage' && (
        <GarbageCalendarView isSimpleMode={isSimpleMode} garbageData={GARBAGE_DATA} />
      )}

      {activeTab === 'bus' && (
        <BusScheduleView
          isSimpleMode={isSimpleMode}
          busSchedules={busSchedules}
          currentTime={currentTime}
        />
      )}

      {activeTab === 'calendar' && (
        <EventCalendarView isSimpleMode={isSimpleMode} events={MOCK_EVENTS} />
      )}

      {activeTab === 'radio' && <CommunityRadioView isSimpleMode={isSimpleMode} />}
    </MainLayout>
  );
};

/**
 * アプリケーションのルートコンポーネント
 * AuthProviderでアプリ全体をラップして認証機能を提供します
 */
const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;
