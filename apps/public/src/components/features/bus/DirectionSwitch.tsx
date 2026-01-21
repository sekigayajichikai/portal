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
    <div className="flex gap-2 flex-wrap mb-3">
      {destinations.map((destination) => {
        const isSelected = destination === selected;
        
        return (
          <button
            key={destination}
            onClick={() => onChange(destination)}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
              isSelected
                ? isSimpleMode
                  ? 'bg-slate-800 text-white shadow-md'
                  : 'bg-purple-600 text-white shadow-md'
                : isSimpleMode
                  ? 'bg-white text-slate-600 border-2 border-slate-200 hover:border-slate-300'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {destination}
          </button>
        );
      })}
    </div>
  );
};
