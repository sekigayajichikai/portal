/**
 * 生活情報関連の型定義（バス・ゴミ収集など）
 */

/**
 * バススケジュール情報（管理者視点）
 */
export interface BusSchedule {
  id: string;
  route: string;
  stopName: string;
  times: string[]; // "08:00", "09:30"
}

/**
 * バススケジュール情報（住民視点）
 */
export interface BusScheduleForResident {
  id: string;
  route: string;
  destination: string;
  times: string[]; // "HH:mm" format
}

/**
 * ゴミ収集ルール（管理者が設定）
 */
export interface GarbageRule {
  id: string;
  type: string; // Burnable, Plastic, etc.
  dayOfWeek: string;
  icon: string;
  description: string;
}

/**
 * ゴミ収集情報（住民向け表示用）
 */
export interface GarbageInfo {
  type: string;
  icon: string;
  color: string;
  nextDate: string;
  description: string;
}
