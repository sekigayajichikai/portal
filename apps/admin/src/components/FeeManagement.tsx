import React from 'react';
import { CreditCard, Download, ExternalLink } from 'lucide-react';

export const FeeManagement: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-700">会費管理・決済</h2>
        <button className="flex items-center gap-2 text-slate-600 hover:text-slate-800 font-medium px-4 py-2 bg-white border border-slate-200 rounded-xl">
          <Download size={18} />
          CSV出力
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 md:col-span-2">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-800">2024年度 自治会費</h3>
            <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold">
              集金中
            </span>
          </div>

          <div className="flex items-end gap-2 mb-4">
            <span className="text-4xl font-bold text-slate-800">¥288,000</span>
            <span className="text-slate-500 mb-1">/ ¥312,000 (回収率 92%)</span>
          </div>

          <div className="w-full bg-slate-100 rounded-full h-3 mb-6">
            <div className="bg-emerald-500 h-3 rounded-full" style={{ width: '92%' }}></div>
          </div>

          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
            <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
              <CreditCard size={16} />
              Stripe 連携状況
            </h4>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">自動引き落とし登録数:</span>
              <span className="font-bold">86 世帯</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-2">
              <span className="text-slate-600">現金手渡し (班長経由):</span>
              <span className="font-bold">28 世帯</span>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-200 flex justify-end">
              <button className="text-indigo-600 text-sm font-bold flex items-center gap-1 hover:underline">
                Stripe ダッシュボードを開く <ExternalLink size={14} />
              </button>
            </div>
          </div>
        </div>

        <div className="bg-indigo-600 text-white p-6 rounded-2xl shadow-lg flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-lg mb-2">スマート集金</h3>
            <p className="text-indigo-100 text-sm leading-relaxed">
              現金のやり取りを減らし、班長の負担を軽減しましょう。
              QRコード付きの請求書を自動発行できます。
            </p>
          </div>
          <button className="bg-white text-indigo-600 py-3 rounded-xl font-bold mt-6 shadow-sm hover:bg-indigo-50 transition-colors">
            請求書を一括送信
          </button>
        </div>
      </div>
    </div>
  );
};
