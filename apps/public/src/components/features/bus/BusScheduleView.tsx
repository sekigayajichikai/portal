import React from 'react';
import { BusSchedule } from '@/types/types';
import { useBusSchedule } from '@/hooks/useBusSchedule';

interface BusScheduleViewProps {
  isSimpleMode: boolean;
  busSchedules: BusSchedule[];
  currentTime: Date;
}

const BusScheduleView: React.FC<BusScheduleViewProps> = ({
  isSimpleMode,
  busSchedules,
  currentTime,
}) => {
  const { getNextBus, calculateMinutesUntil } = useBusSchedule(currentTime);

  const cardBaseClass = isSimpleMode
    ? 'bg-white rounded-xl shadow-sm border border-slate-300 p-4'
    : 'bg-white rounded-[2rem] shadow-xl p-6 border-2 border-slate-50';

  const headingClass = isSimpleMode
    ? 'text-xl font-bold text-slate-900 px-1 mb-4 border-l-4 border-slate-600 pl-3'
    : 'text-2xl font-black px-2 mb-4 text-slate-800';

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="flex justify-between items-end px-2">
        <h2 className={headingClass}>{isSimpleMode ? 'バス時刻表' : '🚌 バス情報'}</h2>
        <p className="text-xs font-bold text-slate-400">
          {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} 更新
        </p>
      </div>

      {busSchedules.map((bus) => {
        const nextTime = getNextBus(bus);
        const minutesLeft = calculateMinutesUntil(nextTime);
        return (
          <div key={bus.id} className={cardBaseClass}>
            <div className="flex justify-between items-start mb-6">
              <div>
                <span
                  className={`${isSimpleMode ? 'bg-slate-200 text-slate-800' : 'bg-blue-100 text-blue-600'} font-black text-xs px-3 py-1 rounded-full uppercase tracking-tighter`}
                >
                  {bus.route}
                </span>
                <h3
                  className={`${isSimpleMode ? 'text-2xl text-slate-900' : 'text-xl'} font-black mt-2`}
                >
                  行き先: {bus.destination}
                </h3>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Next Bus</p>
                <p
                  className={`text-4xl font-black ${isSimpleMode ? 'text-slate-900' : 'text-blue-500'}`}
                >
                  {nextTime}
                </p>
              </div>
            </div>

            <div
              className={`flex items-center gap-4 p-4 ${isSimpleMode ? 'bg-slate-100 rounded-lg' : 'bg-blue-50 rounded-2xl'}`}
            >
              <div
                className={`w-3 h-3 rounded-full ${isSimpleMode ? 'bg-slate-500' : 'bg-blue-500 animate-ping'}`}
              ></div>
              <p
                className={`text-sm font-bold ${isSimpleMode ? 'text-slate-800' : 'text-blue-700'}`}
              >
                あと {minutesLeft} 分で到着します
              </p>
            </div>

            <div className="mt-6 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {bus.times.slice(0, 5).map((t, i) => (
                <div
                  key={i}
                  className={`px-4 py-2 text-sm font-bold flex-shrink-0 ${
                    isSimpleMode
                      ? t === nextTime
                        ? 'bg-slate-800 text-white rounded-lg'
                        : 'bg-white border border-slate-300 text-slate-600 rounded-lg'
                      : t === nextTime
                        ? 'bg-blue-500 text-white rounded-xl'
                        : 'bg-slate-50 text-slate-400 rounded-xl'
                  }`}
                >
                  {t}
                </div>
              ))}
              <div className="px-4 py-2 bg-slate-100 rounded-xl text-sm font-bold text-slate-400 flex-shrink-0 italic">
                more...
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default BusScheduleView;
