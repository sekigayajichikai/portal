
import React from 'react';
import { Event } from '@/types/types';

interface EventCalendarViewProps {
  isSimpleMode: boolean;
  events: Event[];
}

const EventCalendarView: React.FC<EventCalendarViewProps> = ({ isSimpleMode, events }) => {
  const headingClass = isSimpleMode
    ? "text-xl font-bold text-slate-900 px-1 mb-4 border-l-4 border-slate-600 pl-3"
    : "text-2xl font-black px-2 mb-4 text-slate-800";

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <h2 className={headingClass}>{isSimpleMode ? '行事カレンダー' : '📅 地域カレンダー'}</h2>
      <div className={`${isSimpleMode ? 'border border-slate-300 rounded-xl' : 'rounded-3xl shadow-md'} bg-white p-4 mb-6`}>
         <div className="grid grid-cols-7 gap-2 mb-4">
            {['日', '月', '火', '水', '木', '金', '土'].map(day => (
              <div key={day} className="text-center text-xs font-bold text-slate-500">{day}</div>
            ))}
            {Array.from({ length: 31 }, (_, i) => (
              <div key={i} className={`h-8 flex items-center justify-center text-sm font-bold ${
                isSimpleMode 
                  ? (i + 1 === 24 ? 'bg-slate-800 text-white rounded-md' : 'text-slate-700')
                  : (i + 1 === 24 ? 'bg-rose-400 text-white rounded-lg' : 'hover:bg-slate-50 text-slate-700 rounded-lg')
                }`}>
                {i + 1}
              </div>
            ))}
         </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest px-2">
          {isSimpleMode ? '今後の予定' : 'Upcoming Events'}
        </h3>
        {events.map(event => (
          <div key={event.id} className={`bg-white p-4 flex gap-4 ${isSimpleMode ? 'rounded-lg border border-slate-300' : 'rounded-3xl shadow-sm border border-slate-100'}`}>
            <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-slate-200">
              <img src={event.image} alt={event.title} className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 flex flex-col justify-center">
              <h4 className={`font-bold leading-tight ${isSimpleMode ? 'text-lg text-slate-900' : 'text-slate-800'}`}>{event.title}</h4>
              <p className="text-xs text-slate-500 mt-1">🕒 {event.time} | 📍 {event.location}</p>
              <div className="flex gap-2 mt-2">
                <button className={`text-[10px] font-bold px-3 py-1 ${isSimpleMode ? 'bg-slate-200 text-slate-800 rounded' : 'bg-slate-100 rounded-full text-slate-600 hover:bg-yellow-400 hover:text-slate-900 transition-all'}`}>
                  参加
                </button>
                {!isSimpleMode && (
                  <button className="text-[10px] font-bold bg-slate-100 px-3 py-1 rounded-full text-slate-600">
                    保存
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EventCalendarView;
