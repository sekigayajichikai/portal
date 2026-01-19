import React from 'react';
import { TabType } from '@/types/types';

interface BottomNavProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  isSimpleMode: boolean;
}

const BottomNav: React.FC<BottomNavProps> = ({ activeTab, setActiveTab, isSimpleMode }) => {
  const navItems = [
    { id: 'home', icon: '🏠', label: 'ホーム' },
    { id: 'garbage', icon: '🗑️', label: 'ゴミ' },
    { id: 'bus', icon: '🚌', label: 'バス' },
    { id: 'calendar', icon: '📅', label: '予定' },
    { id: 'radio', icon: '📻', label: 'ラジオ' },
  ];

  return (
    <nav
      className={`fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-40 flex justify-around items-center transition-all duration-300
      ${
        isSimpleMode
          ? 'bg-white border-t border-slate-200 py-3 shadow-lg rounded-t-xl pb-6'
          : 'bottom-6 w-[90%] max-w-[380px] bg-slate-900/90 backdrop-blur-md rounded-3xl p-2 shadow-2xl border border-white/10'
      }`}
    >
      {navItems.map((item) => (
        <button
          key={item.id}
          onClick={() => setActiveTab(item.id as TabType)}
          className={`flex flex-col items-center justify-center px-3 transition-all duration-300 rounded-xl
            ${
              isSimpleMode
                ? activeTab === item.id
                  ? 'text-blue-700 bg-blue-50 py-1'
                  : 'text-slate-500 hover:bg-slate-50 py-1'
                : activeTab === item.id
                  ? 'bg-yellow-400 text-slate-900 scale-110 shadow-lg py-2'
                  : 'text-white/60 hover:text-white py-2'
            }
          `}
        >
          <span className={isSimpleMode ? 'text-2xl mb-0.5' : 'text-2xl mb-1'}>{item.icon}</span>
          <span
            className={`font-bold uppercase tracking-wider ${isSimpleMode ? 'text-xs' : 'text-[10px]'}`}
          >
            {item.label}
          </span>
        </button>
      ))}
    </nav>
  );
};

export default BottomNav;
