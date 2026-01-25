/**
 * バススケジュール関連のカスタムフック
 */

import { useState, useEffect } from 'react';
import { BusScheduleForResident, BusSchedule } from '@cc-saas/shared/types';
import { getNextBusTime, calculateMinutesUntil } from '@cc-saas/shared/utils';
import { fetchBusSchedules } from '@cc-saas/shared/services';

/**
 * 現在の日付が休日（土日祝）かどうかを判定
 *
 * @param date - 判定する日付
 * @returns 休日の場合true
 */
function isHoliday(date: Date): boolean {
  const day = date.getDay();
  // 土曜日(6)または日曜日(0)は休日
  // TODO: 将来的に祝日判定を追加する場合はここに実装
  return day === 0 || day === 6;
}

/**
 * データベースのBusScheduleを住民向け表示用に変換
 *
 * @param schedule - データベースから取得したバス時刻表
 * @param currentDate - 現在の日付（平日/休日判定用）
 * @returns 住民向け表示用のバス時刻表
 */
function convertToBusScheduleForResident(
  schedule: BusSchedule,
  currentDate: Date
): BusScheduleForResident {
  const isCurrentHoliday = isHoliday(currentDate);
  const times = isCurrentHoliday
    ? schedule.scheduleData.holiday
    : schedule.scheduleData.weekday;

  return {
    id: schedule.id,
    route: schedule.routeName,
    destination: schedule.destination || '不明',
    times: times,
    currentDayType: isCurrentHoliday ? 'holiday' : 'weekday',
  };
}

/**
 * バススケジュールをデータベースから取得するフック
 */
export const useBusScheduleData = () => {
  const [schedules, setSchedules] = useState<BusScheduleForResident[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadSchedules = async () => {
      try {
        setIsLoading(true);
        const dbSchedules = await fetchBusSchedules();
        const currentDate = new Date();

        // データベースのデータを住民向け表示用に変換
        const residentSchedules = dbSchedules.map((schedule) =>
          convertToBusScheduleForResident(schedule, currentDate)
        );

        setSchedules(residentSchedules);
        setError(null);
      } catch (err: any) {
        console.error('バス時刻表の取得に失敗しました:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    loadSchedules();
  }, []);

  return { schedules, isLoading, error };
};

/**
 * バススケジュール関連の機能を提供するフック
 *
 * @deprecated currentTimeパラメータは不要になりました（互換性のため残していますが使用されません）
 */
// eslint-disable-next-line no-unused-vars
export const useBusSchedule = (_currentTime?: Date) => {
  const getNextBus = (schedule: BusScheduleForResident) => {
    return getNextBusTime(schedule.times);
  };

  return { getNextBus, calculateMinutesUntil };
};
