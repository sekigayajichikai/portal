/**
 * 統計カードコンポーネント
 * 総会員数、回覧板既読率、会費納入状況、要対応事項を表示
 * Interフォント、タイトな余白、洗練されたデザイン
 */
import React from 'react';
import { AdminStats } from '@/types/types';

interface SummaryCardsProps {
  stats: AdminStats;
}

const SummaryCards: React.FC<SummaryCardsProps> = ({ stats }) => {
  const cards = [
    {
      title: '総会員数',
      icon: '👥',
      value: `${stats.totalMembers} 世帯`,
      detail: `前月比 +${stats.memberChange}`,
      detailColor: 'text-slate-500',
      iconBg: 'bg-blue-50',
    },
    {
      title: '回覧板既読率',
      icon: '📄',
      value: `${stats.circularReadRate}%`,
      detail: `未読 ${stats.unreadCirculars}件`,
      detailColor: 'text-red-500',
      iconBg: 'bg-blue-50',
    },
    {
      title: '会費納入状況',
      icon: '✅',
      value: `${stats.paymentRate}%`,
      detail: `未納 ${stats.unpaidHouseholds}世帯`,
      detailColor: 'text-red-500',
      iconBg: 'bg-green-50',
    },
    {
      title: '要対応事項',
      icon: '⚠️',
      value: `${stats.urgentItems}件`,
      detail: '至急確認',
      detailColor: 'text-emerald-600',
      iconBg: 'bg-yellow-50',
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-5 mb-6">
      {cards.map((card, index) => (
        <div
          key={index}
          className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 hover:shadow-md transition-shadow"
        >
          <div className={`w-11 h-11 ${card.iconBg} rounded-lg flex items-center justify-center text-xl mb-3`}>
            {card.icon}
          </div>
          <h3 className="text-sm font-semibold text-slate-600 mb-2 tracking-tight">{card.title}</h3>
          <p className="text-2xl font-semibold text-slate-900 mb-1 tracking-tight">{card.value}</p>
          <p className={`text-xs font-medium ${card.detailColor} tracking-tight`}>{card.detail}</p>
        </div>
      ))}
    </div>
  );
};

export default SummaryCards;
