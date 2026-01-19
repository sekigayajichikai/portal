import React from 'react';
import { GarbageInfo } from '@/types/types';

interface GarbageCalendarViewProps {
  isSimpleMode: boolean;
  garbageData: GarbageInfo[];
}

const GarbageCalendarView: React.FC<GarbageCalendarViewProps> = ({ isSimpleMode, garbageData }) => {
  const headingClass = isSimpleMode
    ? 'text-xl font-bold text-slate-900 px-1 mb-4 border-l-4 border-slate-600 pl-3'
    : 'text-2xl font-black px-2 mb-4 text-slate-800';

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-500">
      <h2 className={headingClass}>
        {isSimpleMode ? 'ゴミ収集カレンダー' : '🗑️ ゴミ収集スケジュール'}
      </h2>
      {garbageData.map((item, idx) => (
        <div
          key={idx}
          className={`flex items-center gap-4 ${isSimpleMode ? 'p-4 rounded-lg border border-slate-300' : `p-5 rounded-3xl shadow-md border-l-8 ${item.color.replace('bg-', 'border-')}`} bg-white`}
        >
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl ${isSimpleMode ? 'bg-slate-100' : `${item.color} shadow-inner`}`}
          >
            {item.icon}
          </div>
          <div className="flex-1">
            <h3
              className={`font-bold ${isSimpleMode ? 'text-lg text-slate-900' : 'text-slate-800'}`}
            >
              {item.type}
            </h3>
            <p className="text-xs text-slate-500">{item.description}</p>
            <p
              className={`text-sm font-black mt-1 ${isSimpleMode ? 'text-blue-800' : 'text-slate-700'}`}
            >
              次回: {item.nextDate}
            </p>
          </div>
          {!isSimpleMode && (
            <button className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-500 transition-colors">
              🔔
            </button>
          )}
        </div>
      ))}

      {isSimpleMode ? (
        <button className="w-full mt-6 bg-slate-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2">
          <span>📷 カメラで分別を調べる</span>
        </button>
      ) : (
        <div className="bg-yellow-50 border-2 border-dashed border-yellow-300 rounded-3xl p-6 text-center mt-10">
          <p className="text-sm text-yellow-800 font-bold">分別に迷ったらカメラでチェック！</p>
          <button className="mt-3 bg-yellow-400 text-yellow-900 font-bold py-3 px-8 rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all">
            AIカメラを起動
          </button>
        </div>
      )}
    </div>
  );
};

export default GarbageCalendarView;
