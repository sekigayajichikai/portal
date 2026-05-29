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
import GarbageCalendarView from '@/components/features/garbage/GarbageCalendarView';
import BusScheduleView from '@/components/features/bus/BusScheduleView';
import EventCalendarView from '@/components/features/calendar/EventCalendarView';
import CommunityRadioView from '@/components/features/radio/CommunityRadioView';
import ComingSoon from '@/components/features/common/ComingSoon';
import { fetchBusSchedules } from '@cc-saas/shared/services';
import type { BusSchedule } from '@cc-saas/shared/types';
import { AuthProvider } from '@cc-saas/shared';

/**
 * アプリケーションのメインコンテンツ
 * アプリケーションの主要な状態管理とレイアウトを提供します
 */
const AppContent: React.FC = () => {

  // 環境変数から機能制御フラグを取得
  const enableAllFeatures = import.meta.env.VITE_ENABLE_ALL_FEATURES !== 'false';
  const forceSimpleMode = import.meta.env.VITE_FORCE_SIMPLE_MODE === 'true';

  // localStorageから設定を読み込み（永続化）
  // シンプルモード強制時は常にtrueを返す
  const loadSimpleModeFromStorage = (): boolean => {
    if (forceSimpleMode) return true;
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
    // シンプルモード強制時は切り替えを無効化
    if (forceSimpleMode) return;
    
    const newMode = !isSimpleMode;
    setIsSimpleMode(newMode);
    // localStorageに保存（永続化）
    localStorage.setItem('isSimpleMode', String(newMode));
  };

  // アプリケーションのメインレイアウトを表示
  return (
    <MainLayout
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      isSimpleMode={isSimpleMode}
      toggleSimpleMode={toggleSimpleMode}
      user={user}
      forceSimpleMode={forceSimpleMode}
      enableAllFeatures={enableAllFeatures}
    >
      {activeTab === 'dashboard' && (
        enableAllFeatures ? (
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
        ) : (
          <ComingSoon 
            featureName="ダッシュボード" 
            icon="📊" 
            isSimpleMode={isSimpleMode} 
          />
        )
      )}

      {activeTab === 'home' && (
        enableAllFeatures ? (
          <HomeView
            isSimpleMode={isSimpleMode}
            busSchedules={busSchedules}
            events={MOCK_EVENTS}
            currentTime={currentTime}
          />
        ) : (
          <ComingSoon 
            featureName="ホーム" 
            icon="🏠" 
            isSimpleMode={isSimpleMode} 
          />
        )
      )}

      {activeTab === 'garbage' && (
        enableAllFeatures ? (
          <GarbageCalendarView isSimpleMode={isSimpleMode} garbageData={GARBAGE_DATA} />
        ) : (
          <ComingSoon 
            featureName="ゴミカレンダー" 
            icon="🗑️" 
            isSimpleMode={isSimpleMode} 
          />
        )
      )}

      {activeTab === 'bus' && (
        enableAllFeatures ? (
          <BusScheduleView
            isSimpleMode={isSimpleMode}
            busSchedules={busSchedules}
            currentTime={currentTime}
          />
        ) : (
          <ComingSoon 
            featureName="バススケジュール" 
            icon="🚌" 
            isSimpleMode={isSimpleMode} 
          />
        )
      )}

      {activeTab === 'calendar' && (
        enableAllFeatures ? (
          <EventCalendarView isSimpleMode={isSimpleMode} events={MOCK_EVENTS} />
        ) : (
          <ComingSoon 
            featureName="イベントカレンダー" 
            icon="📅" 
            isSimpleMode={isSimpleMode} 
          />
        )
      )}

      {activeTab === 'radio' && (
        enableAllFeatures ? (
          <CommunityRadioView isSimpleMode={isSimpleMode} />
        ) : (
          <ComingSoon 
            featureName="コミュニティラジオ" 
            icon="📻" 
            isSimpleMode={isSimpleMode} 
          />
        )
      )}
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
