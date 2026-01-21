/**
 * バス停選択コンポーネント
 * 
 * ドロップダウンでバス停を選択し、確認ダイアログを経てお気に入りに追加します。
 */

import React, { useState } from 'react';
import { MapPin, Plus, X, ChevronDown } from 'lucide-react';

interface BusStopSelectorProps {
  availableStops: string[];
  onAddFavorite: (stopName: string) => boolean;
  maxFavorites: number;
  currentCount: number;
  isSimpleMode: boolean;
}

export const BusStopSelector: React.FC<BusStopSelectorProps> = ({
  availableStops,
  onAddFavorite,
  maxFavorites,
  currentCount,
  isSimpleMode,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedStop, setSelectedStop] = useState<string>('');

  const isFull = currentCount >= maxFavorites;

  // デバッグ情報を出力
  console.log('🎯 BusStopSelector - レンダリング情報:');
  console.log('  📋 利用可能なバス停:', availableStops);
  console.log('  📋 利用可能なバス停の件数:', availableStops.length);
  console.log('  ⭐ お気に入りの件数:', currentCount, '/', maxFavorites);
  console.log('  🔒 お気に入りが満杯:', isFull);

  const handleStopClick = (stopName: string) => {
    setSelectedStop(stopName);
    setIsDropdownOpen(false);
    setIsDialogOpen(true);
  };

  const handleConfirm = () => {
    const success = onAddFavorite(selectedStop);
    if (success) {
      setIsDialogOpen(false);
      setSelectedStop('');
    } else {
      alert('お気に入りの追加に失敗しました');
    }
  };

  const handleCancel = () => {
    setIsDialogOpen(false);
    setSelectedStop('');
  };

  return (
    <>
      {/* バス停選択ドロップダウン */}
      <div className="mb-4 relative">
        <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
          <Plus size={16} />
          バス停を追加
        </label>
        
        <button
          onClick={() => !isFull && setIsDropdownOpen(!isDropdownOpen)}
          disabled={isFull}
          className={`w-full flex items-center justify-between px-4 py-3 rounded-lg font-medium transition-all ${
            isFull
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed border-2 border-slate-200'
              : isSimpleMode
                ? 'bg-white border-2 border-slate-300 text-slate-700 hover:border-slate-500 hover:shadow-sm'
                : 'bg-white border-2 border-blue-400 text-slate-700 hover:border-blue-600 hover:shadow-md'
          }`}
        >
          <span className="flex items-center gap-2">
            <MapPin size={18} className={isFull ? 'text-slate-400' : 'text-blue-600'} />
            {isFull 
              ? `お気に入りは最大${maxFavorites}つまでです` 
              : availableStops.length === 0
                ? '登録されているバス停がありません'
                : 'バス停を選択してください'}
          </span>
          <ChevronDown 
            size={20} 
            className={`transition-transform ${
              isDropdownOpen ? 'rotate-180' : ''
            } ${isFull ? 'text-slate-400' : 'text-slate-600'}`}
          />
        </button>

        {/* ドロップダウンメニュー */}
        {isDropdownOpen && !isFull && availableStops.length > 0 && (
          <>
            {/* 背景オーバーレイ */}
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsDropdownOpen(false)}
              style={{ pointerEvents: 'auto' }}
            ></div>
            
            {/* ドロップダウンリスト */}
            <div 
              className="absolute top-full left-0 right-0 z-20 mt-2 bg-white rounded-lg shadow-2xl border-2 border-slate-200 overflow-hidden"
              style={{ 
                maxHeight: '300px',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              {/* ヘッダー（固定） */}
              <div className="bg-gradient-to-b from-white to-white/80 backdrop-blur-sm px-4 py-2 border-b border-slate-200 flex-shrink-0">
                <p className="text-xs font-semibold text-slate-600">
                  {availableStops.length}件のバス停
                </p>
              </div>
              
              {/* スクロール可能なリスト */}
              <div 
                className="p-1 overflow-y-scroll"
                style={{ 
                  flex: '1 1 auto',
                  minHeight: 0,
                  maxHeight: '250px'
                }}
              >
                {availableStops.map((stopName, index) => (
                  <button
                    key={stopName}
                    onClick={() => handleStopClick(stopName)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-blue-50 transition-colors text-left group ${
                      index !== availableStops.length - 1 ? 'border-b border-slate-100' : ''
                    }`}
                  >
                    <MapPin 
                      size={18} 
                      className="text-slate-400 group-hover:text-blue-600 transition-colors flex-shrink-0" 
                    />
                    <span className="text-slate-700 font-medium group-hover:text-blue-700 transition-colors">
                      {stopName}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* お気に入り数の表示 */}
        <p className="text-xs text-slate-500 mt-2 flex items-center justify-between">
          <span>現在のお気に入り: {currentCount}/{maxFavorites}</span>
          {!isFull && availableStops.length > 0 && (
            <span className="text-blue-600 font-medium">↑ クリックして選択</span>
          )}
        </p>
      </div>

      {/* 確認ダイアログ */}
      {isDialogOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-slate-800">バス停を追加</h3>
              <button
                onClick={handleCancel}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mb-6">
              <p className="text-slate-700 mb-2">
                <span className="font-bold text-blue-600">「{selectedStop}」</span>
                をマイページに設定しますか？
              </p>
              <p className="text-sm text-slate-500">
                ※最大{maxFavorites}つまで登録できます
                （現在: {currentCount}/{maxFavorites}）
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleCancel}
                className="flex-1 px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleConfirm}
                className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                  isSimpleMode
                    ? 'bg-slate-800 text-white hover:bg-slate-700'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                設定する
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
