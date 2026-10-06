/**
 * 「マスタ」タブ: 会場と団体のマスタをまとめて管理する
 *
 * 以前はヘッダーの小さなボタン（主催団体／発行元）からモーダルで開いていたが、
 * 会場が加わったので専用タブに並べて置いた（2026-09-26）。
 * さらに主催団体と発行元は同じ「団体」なので1つにまとめた（2026-10-01）。
 */

import React from 'react';
import { VenueManager } from './VenueManager';
import { OrganizerManager } from './OrganizerManager';

export const MastersPanel: React.FC = () => {
  return (
    <div className="space-y-4">
      <div className="bg-white p-6 rounded-2xl shadow border border-slate-200">
        <h2 className="text-xl font-bold text-slate-800">マスタ</h2>
        <p className="text-sm text-slate-500 mt-1">
          予定や回覧板で使う名前の一覧です。ここに登録した名前に表記が揃います。
          予定の抽出のときAIに渡され、抽出ダイアログでは候補から選べます。
          別名に入れた表記や誤字は、自動で正式名に置き換わります。
        </p>
      </div>
      <div className="space-y-4">
        <VenueManager />
        <OrganizerManager />
      </div>
    </div>
  );
};
