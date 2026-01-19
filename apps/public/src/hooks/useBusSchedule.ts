/**
 * バススケジュール関連のカスタムフック
 */

import { BusScheduleForResident } from '@cc-saas/shared/types';
import { getNextBusTime, calculateMinutesUntil } from '@cc-saas/shared/utils';

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
