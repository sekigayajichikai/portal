import React from 'react';
import { TabType, User } from '@/types/types';
import Header from './Header';
import BottomNav from './BottomNav';

interface MainLayoutProps {
  children: React.ReactNode;
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  isSimpleMode: boolean;
  toggleSimpleMode: () => void;
  user: User | null;
  forceSimpleMode?: boolean;
  enableAllFeatures?: boolean;
}

const MainLayout: React.FC<MainLayoutProps> = ({
  children,
  activeTab,
  setActiveTab,
  isSimpleMode,
  toggleSimpleMode,
  user,
  forceSimpleMode = false,
  enableAllFeatures = true,
}) => {
  return (
    <div
      className={`max-w-md mx-auto min-h-screen flex flex-col shadow-2xl relative overflow-hidden transition-colors duration-500 ${isSimpleMode ? 'bg-slate-50' : 'bg-[#FDFCF0]'}`}
    >
      <Header
        isSimpleMode={isSimpleMode}
        toggleSimpleMode={toggleSimpleMode}
        user={user}
        setActiveTab={setActiveTab}
        forceSimpleMode={forceSimpleMode}
      />

      {/* Main Content Area */}
      <main className={`flex-1 px-4 pb-28 pt-4 ${isSimpleMode ? 'text-slate-900' : ''}`}>
        {children}
      </main>

      {/* Navigation Bar - enableAllFeaturesがfalseの場合は非表示 */}
      {enableAllFeatures && activeTab !== 'dashboard' && (
        <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} isSimpleMode={isSimpleMode} />
      )}

      {/* Decorative Background Elements - Hidden in Simple Mode */}
      {!isSimpleMode && activeTab !== 'dashboard' && (
        <>
          <div className="absolute top-20 -right-20 w-64 h-64 bg-yellow-100 rounded-full blur-3xl opacity-50 -z-10"></div>
          <div className="absolute bottom-40 -left-20 w-80 h-80 bg-orange-100 rounded-full blur-3xl opacity-50 -z-10"></div>
        </>
      )}
    </div>
  );
};

export default MainLayout;
