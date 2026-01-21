/**
 * バス停選択コンポーネント
 * 
 * ドロップダウンでバス停を選択し、確認ダイアログを経てお気に入りに追加します。
 */

import React, { useState } from 'react';
import { MapPin, Plus, X } from 'lucide-react';

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
      {/* バス停追加ボタン */}
      <div className="mb-4">
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          disabled={isFull}
          className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors ${
            isFull
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : isSimpleMode
                ? 'bg-white border-2 border-slate-300 text-slate-700 hover:border-slate-400'
                : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          <Plus size={20} />
          {isFull ? `お気に入りは最大${maxFavorites}つまでです` : 'バス停を追加'}
        </button>

        {/* ドロップダウンメニュー */}
        {isDropdownOpen && !isFull && (
          <div className="relative mt-2">
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsDropdownOpen(false)}
            ></div>
            <div className="absolute top-0 left-0 right-0 z-20 bg-white rounded-lg shadow-xl border border-slate-200 max-h-64 overflow-y-auto">
              <div className="p-2">
                {availableStops.length === 0 ? (
                  <div className="text-center py-4 text-slate-500">
                    登録されているバス停がありません
                  </div>
                ) : (
                  availableStops.map((stopName) => (
                    <button
                      key={stopName}
                      onClick={() => handleStopClick(stopName)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors text-left"
                    >
                      <MapPin size={16} className="text-slate-400" />
                      <span className="text-slate-700 font-medium">{stopName}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
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
