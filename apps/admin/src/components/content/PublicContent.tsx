import React from 'react';
import { PublicEvent } from '@cc-saas/shared';
import { Calendar, MapPin, Clock } from 'lucide-react';

interface PublicContentProps {
  events: PublicEvent[];
}

export const PublicContent: React.FC<PublicContentProps> = ({ events }) => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-xl font-bold text-slate-700">外部公開用ウェブページ管理</h2>
          <p className="text-sm text-slate-500 mt-1">
            回覧板から抽出されたイベント情報は、住民向けポータルサイトに自動的に掲載されます。
          </p>
        </div>
        <button className="text-primary-600 text-sm font-medium hover:underline">
          公開ページをプレビュー &rarr;
        </button>
      </div>

      <div className="bg-slate-100 p-6 rounded-3xl border border-slate-200">
        <h3 className="text-center font-bold text-slate-400 mb-6 text-sm uppercase tracking-widest">
          Web Preview
        </h3>

        {/* Mock Public View */}
        <div className="bg-white max-w-2xl mx-auto rounded-xl shadow-sm overflow-hidden min-h-[400px]">
          <div className="bg-primary-600 p-4 text-white">
            <h4 className="font-bold text-lg">コミュニティ・カレンダー</h4>
          </div>

          <div className="p-0 divide-y divide-slate-100">
            {events.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <Calendar size={48} className="mx-auto mb-2 opacity-20" />
                <p>現在予定されているイベントはありません</p>
              </div>
            ) : (
              events.map((event) => (
                <div key={event.id} className="p-4 hover:bg-slate-50 transition-colors group">
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-16 h-16 bg-primary-50 text-primary-600 rounded-xl flex flex-col items-center justify-center border border-primary-100">
                      <span className="text-xs font-bold uppercase">
                        {new Date(event.date).toLocaleString('en-US', { month: 'short' })}
                      </span>
                      <span className="text-xl font-bold">{new Date(event.date).getDate()}</span>
                    </div>
                    <div className="flex-1">
                      <h5 className="font-bold text-slate-800 text-lg group-hover:text-primary-600 transition-colors">
                        {event.title}
                      </h5>
                      <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                        <div className="flex items-center gap-1">
                          <Clock size={14} />
                          <span>{event.time || '終日'}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <MapPin size={14} />
                          <span>{event.location}</span>
                        </div>
                      </div>
                      <p className="text-sm text-slate-600 mt-2 line-clamp-2">
                        {event.description}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="bg-slate-50 p-4 text-center text-xs text-slate-400 border-t border-slate-100">
            Powered by CommunityConnect
          </div>
        </div>
      </div>
    </div>
  );
};
