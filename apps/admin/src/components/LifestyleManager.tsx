import React from 'react';
import { MOCK_BUS_SCHEDULE, MOCK_GARBAGE_RULES } from '@/constants';
import { Bus, Trash2, Clock, MapPin } from 'lucide-react';

export const LifestyleManager: React.FC = () => {
  return (
    <div className="space-y-8">
      {/* Bus Schedule */}
      <section>
        <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                <Bus size={20} />
            </div>
            <h2 className="text-lg font-bold text-slate-700">コミュニティバス時刻表</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {MOCK_BUS_SCHEDULE.map(bus => (
                <div key={bus.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                    <div className="flex justify-between items-start mb-3">
                        <div>
                            <h3 className="font-bold text-slate-800 text-lg">{bus.route}</h3>
                            <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                                <MapPin size={12} />
                                {bus.stopName} 発
                            </div>
                        </div>
                        <span className="bg-blue-50 text-blue-600 text-xs font-bold px-2 py-1 rounded">運行中</span>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-4">
                        {bus.times.map((time, idx) => (
                            <div key={idx} className="bg-slate-50 text-slate-700 px-3 py-1.5 rounded-lg text-sm font-mono border border-slate-100 flex items-center gap-1">
                                <Clock size={12} className="text-slate-400" />
                                {time}
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
      </section>

      {/* Garbage Rules */}
      <section>
        <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-green-100 text-green-600 rounded-lg">
                <Trash2 size={20} />
            </div>
            <h2 className="text-lg font-bold text-slate-700">ゴミ収集カレンダー管理</h2>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
             <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100">
                 {MOCK_GARBAGE_RULES.map(rule => (
                     <div key={rule.id} className="p-6 text-center hover:bg-slate-50 transition-colors">
                         <div className="text-4xl mb-3">{rule.icon}</div>
                         <h3 className="font-bold text-slate-800 mb-1">{rule.type}</h3>
                         <div className="inline-block bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-xs font-bold mb-3">
                             {rule.dayOfWeek}
                         </div>
                         <p className="text-sm text-slate-500 leading-snug">{rule.description}</p>
                     </div>
                 ))}
             </div>
        </div>
      </section>
    </div>
  );
};
