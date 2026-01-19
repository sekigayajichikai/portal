
import React from 'react';
import { User, Circular, Payment } from '@/types/types';

interface DashboardProps {
  user: User | null;
  onLogin: () => void;
  onLogout: () => void;
  isSimpleMode: boolean;
  circulars: Circular[];
  toggleRead: (id: string) => void;
  payments: Payment[];
  onPay: (id: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ 
  user, onLogin, onLogout, isSimpleMode, 
  circulars, toggleRead, payments, onPay 
}) => {
  
  // Login Screen
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
        <div className="text-center space-y-2">
          <h2 className={`text-2xl font-black ${isSimpleMode ? 'text-slate-800' : 'text-slate-800'}`}>
            {isSimpleMode ? 'ログイン' : 'Welcome Back!'}
          </h2>
          <p className="text-slate-500 text-sm">
            {isSimpleMode 
              ? '回覧板や集金情報を確認するにはログインしてください。' 
              : '町内会メンバー専用ページへアクセスしよう！'}
          </p>
        </div>

        <button 
          onClick={onLogin}
          className="bg-[#06C755] hover:bg-[#05b34d] text-white font-bold py-3.5 px-8 rounded-2xl w-full max-w-xs shadow-lg transform transition-transform active:scale-95 flex items-center justify-center gap-3"
        >
          <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current"><path d="M24 10.304c0-5.369-5.383-9.738-12-9.738-6.616 0-12 4.369-12 9.738 0 4.814 4.269 8.846 10.036 9.608.391.084.922.258 1.057.592.121.303.079.748.038 1.04l-.184 1.126c-.059.354-.271 1.381 1.209.754 1.48-.626 8.022-4.724 8.022-4.724C22.618 16.923 24 13.801 24 10.304z"/></svg>
          LINEでログイン
        </button>

        <p className="text-xs text-slate-400 mt-8">※デモ版のため、認証なしでログインします</p>
      </div>
    );
  }

  // Authenticated Dashboard
  return (
    <div className="space-y-6 pb-20 animate-in fade-in zoom-in-95 duration-500">
      {/* User Header */}
      <div className={`flex items-center justify-between p-4 ${isSimpleMode ? 'bg-slate-100 border border-slate-200' : 'bg-white shadow-lg'} rounded-2xl`}>
        <div className="flex items-center gap-3">
          <img src={user.avatar} alt={user.name} className="w-14 h-14 rounded-full border-2 border-white shadow-sm" />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold bg-slate-800 text-white px-2 py-0.5 rounded">{user.group}</span>
              <h2 className={`font-bold ${isSimpleMode ? 'text-slate-800' : 'text-slate-900'}`}>{user.name}</h2>
            </div>
            <p className="text-xs text-slate-500">会員ID: {user.id.toUpperCase()}</p>
          </div>
        </div>
        <button onClick={onLogout} className="text-xs font-bold text-slate-400 hover:text-slate-600 bg-slate-50 px-3 py-2 rounded-lg">
          ログアウト
        </button>
      </div>

      {/* Payment Section */}
      <section>
        <h3 className={`font-black mb-3 px-1 ${isSimpleMode ? 'text-lg text-slate-800' : 'text-xl text-slate-800'}`}>
          {isSimpleMode ? '集金・支払い状況' : '💰 集金情報'}
        </h3>
        <div className="space-y-3">
          {payments.map(payment => (
            <div key={payment.id} className={`p-5 rounded-2xl flex flex-col gap-3 ${isSimpleMode ? 'bg-white border border-slate-300' : 'bg-white shadow-md border-l-4 border-l-indigo-500'}`}>
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-bold text-slate-800">{payment.title}</h4>
                  <p className="text-xs text-slate-500 mt-1">期限: {payment.dueDate}</p>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                  payment.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-rose-100 text-rose-700'
                }`}>
                  {payment.status === 'paid' ? '支払済' : '未払い'}
                </div>
              </div>
              <div className="flex justify-between items-end border-t border-slate-100 pt-3">
                <span className="text-lg font-bold">¥{payment.amount.toLocaleString()}</span>
                {payment.status === 'unpaid' && (
                  <button 
                    onClick={() => onPay(payment.id)}
                    className={`px-4 py-2 rounded-lg font-bold text-sm text-white shadow-md transition-transform active:scale-95 ${isSimpleMode ? 'bg-slate-700' : 'bg-indigo-500 hover:bg-indigo-600'}`}
                  >
                    PayPayで支払う
                  </button>
                )}
              </div>
            </div>
          ))}
          {payments.length === 0 && <p className="text-center text-sm text-slate-400 py-4">現在、未払いの集金はありません</p>}
        </div>
      </section>

      {/* Circular Board Section */}
      <section>
        <h3 className={`font-black mb-3 px-1 ${isSimpleMode ? 'text-lg text-slate-800' : 'text-xl text-slate-800'}`}>
          {isSimpleMode ? 'デジタル回覧板' : '📱 デジタル回覧板'}
        </h3>
        
        <div className="space-y-4">
          {circulars.map(circular => (
            <div key={circular.id} className={`p-4 rounded-2xl transition-all ${isSimpleMode ? 'bg-white border border-slate-300' : 'bg-white shadow-sm hover:shadow-md'}`}>
               <div className="flex justify-between items-start mb-2">
                 <span className="text-[10px] font-bold text-slate-400">{circular.date}</span>
                 {circular.isRead ? (
                   <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded">既読</span>
                 ) : (
                   <span className="text-[10px] font-bold bg-rose-100 text-rose-600 px-2 py-0.5 rounded animate-pulse">未読</span>
                 )}
               </div>
               <h4 className={`font-bold text-slate-800 mb-2 ${isSimpleMode ? 'text-base' : 'text-lg'}`}>{circular.title}</h4>
               <p className={`text-sm text-slate-600 leading-relaxed mb-4 ${isSimpleMode ? '' : 'line-clamp-2'}`}>
                 {circular.content}
               </p>

               {/* Read Rate for the Group */}
               <div className="bg-slate-50 rounded-xl p-3 mb-3">
                 <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1">
                   <span>{user.group}の既読率</span>
                   <span>{circular.groupReadRate}%</span>
                 </div>
                 <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                   <div 
                     className="bg-green-500 h-full rounded-full transition-all duration-1000" 
                     style={{ width: `${circular.groupReadRate}%` }}
                   ></div>
                 </div>
               </div>

               {!circular.isRead && (
                 <button 
                   onClick={() => toggleRead(circular.id)}
                   className={`w-full py-3 rounded-xl font-bold text-sm border-2 transition-colors ${
                     isSimpleMode 
                       ? 'border-slate-800 text-slate-800 hover:bg-slate-50' 
                       : 'border-green-500 text-green-600 hover:bg-green-50'
                   }`}
                 >
                   確認しました（既読にする）
                 </button>
               )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
