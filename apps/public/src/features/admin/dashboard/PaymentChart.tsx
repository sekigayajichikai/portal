/**
 * 班ごとの会費納入率グラフコンポーネント
 * Tailwind CSSのみで棒グラフを実装
 * Interフォント、タイトな余白、洗練されたデザイン
 */
import React from 'react';
import { GroupPaymentStats } from '@/types/types';

interface PaymentChartProps {
  data: GroupPaymentStats[];
}

const PaymentChart: React.FC<PaymentChartProps> = ({ data }) => {
  const maxRate = 100;

  // 棒の色を決定（画像に合わせて調整: 1班と3班はピンク、2班と4班は水色、5班は赤）
  const getBarColor = (rate: number, groupName: string) => {
    if (groupName === '1班' || groupName === '3班') return 'bg-pink-400';
    if (groupName === '2班' || groupName === '4班') return 'bg-cyan-400';
    if (groupName === '5班') return 'bg-red-400';
    // フォールバック
    if (rate < 85) return 'bg-red-400';
    if (rate < 95) return 'bg-pink-400';
    return 'bg-cyan-400';
  };

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
      <h3 className="text-lg font-semibold text-slate-800 mb-5 tracking-tight">班ごとの会費納入率</h3>
      
      {/* Y軸の目盛りとグラフエリア */}
      <div className="relative">
        {/* Y軸の目盛り */}
        <div className="absolute left-0 top-0 bottom-0 w-8 flex flex-col justify-between text-xs text-slate-500 font-medium">
          <span>100</span>
          <span>75</span>
          <span>50</span>
          <span>25</span>
          <span>0</span>
        </div>

        {/* グラフエリア */}
        <div className="ml-10 h-64 flex items-end gap-5">
          {data.map((item) => {
            const heightPercent = (item.paymentRate / maxRate) * 100;
            const barColor = getBarColor(item.paymentRate, item.groupName);
            
            return (
              <div key={item.groupName} className="flex-1 flex flex-col items-center h-full">
                {/* 棒グラフ */}
                <div className="w-full h-full relative flex flex-col justify-end">
                  {/* 値の表示 */}
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs font-semibold text-slate-700 whitespace-nowrap tracking-tight">
                    {item.paymentRate}%
                  </div>
                  
                  {/* 棒 */}
                  <div
                    className={`w-full ${barColor} rounded-t-lg transition-all hover:opacity-80`}
                    style={{ height: `${heightPercent}%` }}
                  />
                </div>
                
                {/* X軸のラベル */}
                <div className="mt-2 text-xs font-semibold text-slate-700 tracking-tight">{item.groupName}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default PaymentChart;
