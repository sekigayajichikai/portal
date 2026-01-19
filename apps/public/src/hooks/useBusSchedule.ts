
import { BusSchedule } from '@/types/types';

export const useBusSchedule = (currentTime: Date) => {
  const getNextBus = (schedule: BusSchedule) => {
    const now = currentTime.getHours() * 60 + currentTime.getMinutes();
    const nextTime = schedule.times.find(time => {
      const [h, m] = time.split(':').map(Number);
      return (h * 60 + m) > now;
    });
    return nextTime || schedule.times[0];
  };

  const calculateMinutesUntil = (timeStr: string) => {
    const [h, m] = timeStr.split(':').map(Number);
    const busMinutes = h * 60 + m;
    const nowMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    let diff = busMinutes - nowMinutes;
    if (diff < 0) diff += 24 * 60; // Next day
    return diff;
  };

  return { getNextBus, calculateMinutesUntil };
};
