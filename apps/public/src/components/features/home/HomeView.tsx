import React from 'react';
import { Event } from '@/types/types';
import type { BusSchedule } from '@cc-saas/shared/types';
import AIChat from '../ai-chat/AIChat';

interface HomeViewProps {
  isSimpleMode: boolean;
  busSchedules: BusSchedule[];
  events: Event[];
  currentTime: Date;
}

const HomeView: React.FC<HomeViewProps> = ({ isSimpleMode, busSchedules, events, currentTime }) => {
  // バス時刻の計算
  const getNextBusTime = (schedule: BusSchedule): string => {
    const day = currentTime.getDay();
    const isHoliday = day === 0 || day === 6;
    const times = isHoliday ? schedule.scheduleData.holiday : schedule.scheduleData.weekday;
    
    if (times.length === 0) return '--:--';
    
    const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    const nextTime = times.find((time) => {
      const [hour, minute] = time.split(':').map(Number);
      return hour * 60 + minute > currentMinutes;
    });
    
    return nextTime || times[0];
  };

  const calculateMinutesUntil = (time: string): number => {
    const [hour, minute] = time.split(':').map(Number);
    const timeMinutes = hour * 60 + minute;
    const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    let diff = timeMinutes - currentMinutes;
    if (diff < 0) diff += 24 * 60;
    return diff;
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Hero Section: Gamified vs Simple Info */}
      {isSimpleMode ? (
        <section className="bg-white border-l-4 border-blue-600 rounded-r-lg shadow-sm p-4">
          <h2 className="text-lg font-bold text-slate-900 mb-1">本日のお知らせ</h2>
          <p className="text-slate-700">
            今日は <span className="font-bold text-blue-700">5月20日(月)</span> です。
          </p>
          <p className="text-slate-700 mt-1">
            ゴミ出しは <span className="font-bold text-rose-600">可燃ごみ</span> の日です。
          </p>
        </section>
      ) : (
        <section className="bg-gradient-to-br from-orange-600 to-rose-600 rounded-[2rem] p-6 text-white shadow-xl relative overflow-hidden">
          <div className="relative z-10">
            <span className="bg-white/20 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest">
              Today's Quest
            </span>
            <h2 className="text-2xl font-black mt-2 mb-4">
              近所のゴミ拾いに参加して
              <br />
              500XPをGETしよう！
            </h2>
            <button className="bg-white text-orange-600 font-bold px-6 py-2.5 rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all">
              クエスト開始
            </button>
          </div>
          <div className="absolute -bottom-4 -right-4 opacity-30 text-8xl transform rotate-12">
            🎮
          </div>
        </section>
      )}

      {/* Quick Info Grid */}
      <div className="grid grid-cols-2 gap-4">
        <div
          className={`${isSimpleMode ? 'bg-blue-50 border border-blue-200 text-blue-900 rounded-xl' : 'bg-blue-600 text-white rounded-3xl shadow-lg'} p-5 flex flex-col justify-between aspect-square`}
        >
          <span className="text-4xl">🚌</span>
          <div>
            <p className={`text-xs font-bold ${isSimpleMode ? 'text-blue-700' : 'opacity-80'}`}>
              次のバスまで
            </p>
            <p className="text-3xl font-black">
              {busSchedules.length > 0
                ? `${calculateMinutesUntil(getNextBusTime(busSchedules[0]))}分`
                : '-'}
            </p>
          </div>
        </div>
        <div
          className={`${isSimpleMode ? 'bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl' : 'bg-emerald-500 text-white rounded-3xl shadow-lg'} p-5 flex flex-col justify-between aspect-square`}
        >
          <span className="text-4xl">♻️</span>
          <div>
            <p className={`text-xs font-bold ${isSimpleMode ? 'text-emerald-700' : 'opacity-80'}`}>
              明日のゴミ
            </p>
            <p className="text-xl font-black">資源ごみ</p>
          </div>
        </div>
      </div>

      <AIChat isSimpleMode={isSimpleMode} />

      <section>
        <h3
          className={
            isSimpleMode
              ? 'text-lg font-bold text-slate-800 mb-2 pl-2'
              : 'text-lg font-black px-2 mb-3'
          }
        >
          {isSimpleMode ? '地域のイベント情報' : '🔥 注目のイベント'}
        </h3>
        <div
          className={`flex gap-4 overflow-x-auto pb-4 ${isSimpleMode ? '' : '-mx-4 px-4'} scrollbar-hide`}
        >
          {events.map((event) => (
            <div
              key={event.id}
              className={`${isSimpleMode ? 'min-w-[260px] rounded-xl border border-slate-300' : 'min-w-[280px] rounded-3xl shadow-md border border-slate-100'} bg-white overflow-hidden flex-shrink-0`}
            >
              <img src={event.image} alt={event.title} className="w-full h-32 object-cover" />
              <div className="p-4">
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${isSimpleMode ? 'bg-slate-200 text-slate-700' : 'bg-yellow-100 text-yellow-700'}`}
                >
                  {event.category}
                </span>
                <h4
                  className={`font-bold mt-1 ${isSimpleMode ? 'text-slate-900 text-lg' : 'text-slate-800'}`}
                >
                  {event.title}
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  📍 {event.location} | 📅 {event.date}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default HomeView;
