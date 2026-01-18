import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Users, FileText, CheckCircle, AlertTriangle } from 'lucide-react';

const readRateData = [
  { name: '1班', rate: 94 },
  { name: '2班', rate: 88 },
  { name: '3班', rate: 65 },
  { name: '4班', rate: 98 },
  { name: '5班', rate: 72 },
];

const StatCard = ({ title, value, sub, icon: Icon, color }: { title: string, value: string, sub: string, icon: any, color: string }) => (
  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-start justify-between">
    <div>
      <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
      <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
      <p className={`text-xs mt-2 ${sub.includes('未') ? 'text-rose-500' : 'text-emerald-500'}`}>{sub}</p>
    </div>
    <div className={`p-3 rounded-xl ${color} bg-opacity-10`}>
      <Icon className={color.replace('bg-', 'text-')} size={24} />
    </div>
  </div>
);

export const Dashboard: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="総会員数" value="124 世帯" sub="前月比 +2" icon={Users} color="bg-blue-500" />
        <StatCard title="回覧板既読率" value="87%" sub="未読 16件" icon={FileText} color="bg-indigo-500" />
        <StatCard title="会費納入状況" value="92%" sub="未納 10世帯" icon={CheckCircle} color="bg-emerald-500" />
        <StatCard title="要対応事項" value="3 件" sub="至急確認" icon={AlertTriangle} color="bg-amber-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold text-slate-800 mb-6">班ごとの回覧板既読率</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={readRateData}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
                <Tooltip cursor={{fill: '#f1f5f9'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                <Bar dataKey="rate" radius={[6, 6, 0, 0]}>
                  {readRateData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.rate < 80 ? '#fb7185' : '#6366f1'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold text-slate-800 mb-4">最新のお知らせ</h3>
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
              <span className="text-xs font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">Event</span>
              <p className="font-bold text-slate-700 mt-1">夏祭り実行委員会の招集</p>
              <p className="text-xs text-slate-500 mt-1">2024-07-20</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-xs font-bold text-slate-600 bg-slate-200 px-2 py-0.5 rounded-full">Notice</span>
              <p className="font-bold text-slate-700 mt-1">ゴミステーションの清掃について</p>
              <p className="text-xs text-slate-500 mt-1">2024-07-18</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};