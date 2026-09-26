/**
 * 「マスタ」タブ: 会場・主催団体・発行元の3つのマスターをまとめて管理する
 *
 * 以前はヘッダーの小さなボタン（主催団体／発行元）からモーダルで開いていたが、
 * 会場が加わって3つになったので、専用タブに並べて置く（2026-09-26）。
 */

import React from 'react';
import { VenueManager } from './VenueManager';
import { OrganizerManager } from './OrganizerManager';
import { PublisherManager } from './PublisherManager';

export const MastersPanel: React.FC = () => {
  return (
    <div className="space-y-4">
      <div className="bg-white p-6 rounded-2xl shadow border border-slate-200">
        <h2 className="text-xl font-bold text-slate-800">マスタ</h2>
        <p className="text-sm text-slate-500 mt-1">
          予定カードや回覧板で使う名前の一覧です。ここに登録した名前に表記が揃います。
          会場と主催団体はイベント抽出のときAIに渡され、抽出ダイアログでは候補から選べます。発行元は回覧板PDFの発行元です。
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <VenueManager />
        </div>
        <OrganizerManager inline isOpen onClose={() => {}} />
        <PublisherManager inline isOpen onClose={() => {}} />
      </div>
    </div>
  );
};
