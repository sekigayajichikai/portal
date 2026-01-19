/**
 * 最新のお知らせリストコンポーネント
 * Interフォント、タイトな余白、洗練されたデザイン
 */
import React from 'react';
import { AdminNotice } from '@/types/types';

interface RecentNoticesProps {
  notices: AdminNotice[];
}

const RecentNotices: React.FC<RecentNoticesProps> = ({ notices }) => {
  const getTypeColor = (type: string) => {
    return type === 'Event' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700';
  };

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
      <h3 className="text-lg font-semibold text-slate-800 mb-5 tracking-tight">最新のお知らせ</h3>
      
      <div className="space-y-3">
        {notices.map((notice) => (
          <div
            key={notice.id}
            className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${getTypeColor(notice.type)} tracking-tight`}>
              {notice.type}
            </span>
            <div className="flex-1">
              <h4 className="font-semibold text-slate-800 mb-1 tracking-tight">{notice.title}</h4>
              <p className="text-xs text-slate-500 font-medium tracking-tight">{notice.date}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RecentNotices;
