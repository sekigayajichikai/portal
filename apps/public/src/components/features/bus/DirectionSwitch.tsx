/**
 * 方面切り替えボタンコンポーネント
 * 
 * 複数の方面（destination）がある場合に表示し、
 * ユーザーが見たい方面を選択できるようにします。
 */

import React from 'react';

interface DirectionSwitchProps {
  destinations: string[];
  selected: string;
  onChange: (destination: string) => void;
  isSimpleMode: boolean;
}

export const DirectionSwitch: React.FC<DirectionSwitchProps> = ({
  destinations,
  selected,
  onChange,
  isSimpleMode,
}) => {
  // 1つしかない場合は表示しない
  if (destinations.length <= 1) {
    return null;
  }

  return (
    <div className="flex gap-3 mb-3">
      {destinations.map((destination) => {
        const isSelected = destination === selected;
        
        return (
          <button
            key={destination}
            onClick={() => onChange(destination)}
            className={`flex-1 px-4 py-3 rounded-lg font-bold text-sm transition-all text-center ${
              isSelected
                ? isSimpleMode
                  ? 'bg-slate-800 text-white shadow-lg scale-105'
                  : 'bg-blue-600 text-white shadow-lg scale-105'
                : isSimpleMode
                  ? 'bg-white text-slate-600 border-2 border-slate-300 hover:border-slate-400 hover:shadow-md'
                  : 'bg-white text-slate-600 border-2 border-slate-300 hover:border-blue-400 hover:shadow-md'
            }`}
          >
            {destination} 方面
          </button>
        );
      })}
    </div>
  );
};
