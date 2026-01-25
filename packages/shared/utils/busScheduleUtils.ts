/**
 * バス時刻表関連のユーティリティ関数
 *
 * バス停のグループ化や方面別の時刻表整理などの機能を提供します。
 */

import type { BusSchedule, BusStopGroup } from '../types/index.js';

/**
 * バススケジュールをバス停ごとにグループ化
 *
 * 同じバス停で複数の方面（destination）がある場合、それぞれを分けて管理します。
 *
 * @param schedules - バススケジュールの配列
 * @returns バス停ごとにグループ化されたデータ
 *
 * @example
 * ```typescript
 * const schedules = [
 *   { stopName: '自治会館前', destination: '駅方面', ... },
 *   { stopName: '自治会館前', destination: '市民病院方面', ... },
 *   { stopName: '中央公園', destination: '駅方面', ... },
 * ];
 *
 * const grouped = groupByBusStop(schedules);
 * // [
 * //   {
 * //     stopName: '自治会館前',
 * //     destinations: [
 * //       { destination: '駅方面', schedules: [...] },
 * //       { destination: '市民病院方面', schedules: [...] }
 * //     ]
 * //   },
 * //   { stopName: '中央公園', destinations: [...] }
 * // ]
 * ```
 */
export function groupByBusStop(schedules: BusSchedule[]): BusStopGroup[] {
  const grouped = new Map<string, BusStopGroup>();

  schedules.forEach((schedule) => {
    // バス停名でグループを作成または取得
    if (!grouped.has(schedule.stopName)) {
      grouped.set(schedule.stopName, {
        stopName: schedule.stopName,
        destinations: [],
      });
    }

    const group = grouped.get(schedule.stopName)!;
    const destination = schedule.destination || '不明';

    // 同じ方面（destination）が既に存在するか確認
    const destIndex = group.destinations.findIndex((d) => d.destination === destination);

    if (destIndex === -1) {
      // 新しい方面を追加
      group.destinations.push({
        destination,
        schedules: [schedule],
      });
    } else {
      // 既存の方面にスケジュールを追加
      group.destinations[destIndex].schedules.push(schedule);
    }
  });

  return Array.from(grouped.values());
}

/**
 * バス停名のユニークなリストを取得
 *
 * @param schedules - バススケジュールの配列
 * @returns バス停名の配列（重複なし、アルファベット順）
 */
export function getUniqueBusStops(schedules: BusSchedule[]): string[] {
  const stopNames = new Set(schedules.map((s) => s.stopName));
  return Array.from(stopNames).sort();
}

/**
 * 特定のバス停と方面のスケジュールを取得
 *
 * @param schedules - バススケジュールの配列
 * @param stopName - バス停名
 * @param destination - 方面（任意）
 * @returns フィルタリングされたスケジュール
 */
export function filterByStopAndDestination(
  schedules: BusSchedule[],
  stopName: string,
  destination?: string
): BusSchedule[] {
  return schedules.filter(
    (s) => s.stopName === stopName && (!destination || s.destination === destination)
  );
}
