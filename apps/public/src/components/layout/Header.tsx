
import React from 'react';
import { TabType, User } from '@/types/types';

interface HeaderProps {
  isSimpleMode: boolean;
  toggleSimpleMode: () => void;
  user: User | null;
  setActiveTab: (tab: TabType) => void;
}

const Header: React.FC<HeaderProps> = ({ isSimpleMode, toggleSimpleMode, user, setActiveTab }) => {
  return (
    <header className={`p-6 flex justify-between items-center sticky top-0 z-30 transition-all ${isSimpleMode ? 'bg-white shadow-sm border-b border-slate-200' : 'bg-white/50 backdrop-blur-sm'}`}>
      <div className="flex items-center gap-2" onClick={() => setActiveTab('home')}>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl shadow-lg transition-transform ${isSimpleMode ? 'bg-slate-700 text-white' : 'bg-yellow-400 animate-bounce'}`}>
          {isSimpleMode ? '自' : '🎉'}
        </div>
        <h1 className={`text-xl font-extrabold tracking-tight ${isSimpleMode ? 'text-slate-700' : 'text-slate-800'}`}>
          {isSimpleMode ? '自治会ポータル' : 'Playground Town'}
        </h1>
      </div>
      
      <div className="flex items-center gap-3">
        {/* Simple Mode Toggle */}
        <button 
          onClick={toggleSimpleMode}
          className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
            isSimpleMode 
              ? 'bg-slate-800 text-white border-slate-800' 
              : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
          }`}
        >
          {isSimpleMode ? 'シンプルON' : 'シンプル設定'}
        </button>

        {/* User Profile / Login Trigger */}
        <button 
          onClick={() => setActiveTab('dashboard')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full shadow-sm border transition-all
            ${isSimpleMode 
              ? 'bg-white border-slate-300' 
              : 'bg-white border-slate-100 hover:scale-105 active:scale-95'
            }`}
        >
          {user ? (
            <>
                <span className={`text-sm font-bold ${isSimpleMode ? 'text-slate-700' : 'text-orange-500'}`}>
                  {isSimpleMode ? user.name : 'Lv.12'}
                </span>
                <div className={`w-8 h-8 rounded-full overflow-hidden border-2 ${isSimpleMode ? 'border-slate-400' : 'border-orange-400'}`}>
                  <img src={user.avatar} alt="user" />
                </div>
            </>
          ) : (
            <span className="text-xs font-bold text-slate-600">ログイン</span>
          )}
        </button>
      </div>
    </header>
  );
};

export default Header;
