/**
 * バス時刻表編集ダイアログ
 *
 * AI抽出されたバス時刻表データをユーザーが確認・編集できます。
 * 路線名、バス停名、平日/休日の時刻を編集可能です。
 */

import React, { useState, useEffect } from 'react';
import { X, Sparkles, Clock, Calendar } from 'lucide-react';
import type { BusSchedule } from '@cc-saas/shared/types';

interface BusScheduleEditDialogProps {
  isOpen: boolean;
  schedule: Omit<BusSchedule, 'id' | 'createdAt' | 'updatedAt'> | null;
  onConfirm: (schedule: Omit<BusSchedule, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onCancel: () => void;
}

export const BusScheduleEditDialog: React.FC<BusScheduleEditDialogProps> = ({
  isOpen,
  schedule,
  onConfirm,
  onCancel,
}) => {
  const [routeName, setRouteName] = useState('');
  const [stopName, setStopName] = useState('');
  const [destination, setDestination] = useState('');
  const [weekdayTimes, setWeekdayTimes] = useState('');
  const [holidayTimes, setHolidayTimes] = useState('');
  const [notes, setNotes] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');

  // scheduleが変わったら反映
  useEffect(() => {
    if (schedule) {
      setRouteName(schedule.routeName || '');
      setStopName(schedule.stopName || '');
      setDestination(schedule.destination || '');
      setWeekdayTimes(schedule.scheduleData.weekday.join(', ') || '');
      setHolidayTimes(schedule.scheduleData.holiday.join(', ') || '');
      setNotes(schedule.notes || '');
      setValidFrom(schedule.validFrom || '');
      setValidUntil(schedule.validUntil || '');
    }
  }, [schedule]);

  if (!isOpen || !schedule) return null;

  const handleConfirm = () => {
    if (!routeName || !stopName) {
      alert('路線名とバス停名は必須です');
      return;
    }

    if (!weekdayTimes && !holidayTimes) {
      alert('平日または休日のどちらかの時刻を入力してください');
      return;
    }

    // カンマ区切りの時刻文字列を配列に変換
    const parseTimesString = (str: string): string[] => {
      if (!str.trim()) return [];
      return str
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
    };

    const weekdayTimesArray = parseTimesString(weekdayTimes);
    const holidayTimesArray = parseTimesString(holidayTimes);

    onConfirm({
      ...schedule,
      routeName,
      stopName,
      destination: destination || undefined,
      scheduleData: {
        weekday: weekdayTimesArray,
        holiday: holidayTimesArray,
      },
      notes: notes || undefined,
      validFrom: validFrom || undefined,
      validUntil: validUntil || undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
      <div className="bg-white rounded-2xl p-6 max-w-2xl w-full mx-4 my-8 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
            <Sparkles size={20} className="text-blue-600" />
            バス時刻表を確認・編集
          </h3>
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-600"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 mb-6 max-h-[70vh] overflow-y-auto">
          {/* 基本情報 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                路線名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={routeName}
                onChange={(e) => setRouteName(e.target.value)}
                className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="例: 駅方面"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                バス停名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={stopName}
                onChange={(e) => setStopName(e.target.value)}
                className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="例: 自治会館前"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              行き先
            </label>
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="例: 中央駅前"
            />
          </div>

          {/* 時刻データ */}
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                <Clock size={16} className="text-blue-600" />
                平日の時刻
              </label>
              <input
                type="text"
                value={weekdayTimes}
                onChange={(e) => setWeekdayTimes(e.target.value)}
                className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                placeholder="例: 07:15, 08:45, 10:30, 13:00"
              />
              <p className="text-xs text-slate-500 mt-1">
                カンマ区切りで入力してください（例: 07:15, 08:45, 10:30）
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                <Calendar size={16} className="text-orange-600" />
                休日（土日祝）の時刻
              </label>
              <input
                type="text"
                value={holidayTimes}
                onChange={(e) => setHolidayTimes(e.target.value)}
                className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                placeholder="例: 08:00, 10:00, 13:00, 16:00"
              />
              <p className="text-xs text-slate-500 mt-1">
                カンマ区切りで入力してください（例: 08:00, 10:00, 13:00）
              </p>
            </div>
          </div>

          {/* 有効期間 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                有効期間開始
              </label>
              <input
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                有効期間終了
              </label>
              <input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* 備考 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              備考・注意事項
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
              placeholder="例: 年末年始は運休します"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium"
          >
            キャンセル
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            保存する
          </button>
        </div>
      </div>
    </div>
  );
};
