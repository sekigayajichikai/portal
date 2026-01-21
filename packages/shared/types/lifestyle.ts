/**
 * 生活情報関連の型定義（バス・ゴミ収集など）
 */

/**
 * バス時刻表の時刻データ（平日/休日別）
 */
export interface BusScheduleData {
  weekday: string[];  // 平日の時刻 ["08:00", "09:30", ...]
  holiday: string[];  // 休日（土日祝）の時刻 ["09:00", "11:00", ...]
}

/**
 * バススケジュール情報（データベース対応版）
 */
export interface BusSchedule {
  id: string;
  organizationId?: string;
  routeName: string;
  stopName: string;
  destination?: string;
  scheduleData: BusScheduleData;
  sourcePdfUrl?: string;
  validFrom?: string;  // ISO 8601 date string
  validUntil?: string; // ISO 8601 date string
  notes?: string;
  displayOrder: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * バススケジュール情報（旧形式・後方互換性のため保持）
 * @deprecated 新しいコードではBusScheduleを使用してください
 */
export interface BusScheduleLegacy {
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
  times: string[]; // "HH:mm" format - 現在の曜日に応じた時刻リスト
  currentDayType?: 'weekday' | 'holiday'; // 現在表示している時刻の種類
}

/**
 * PDF抽出結果（バス時刻表）
 */
export interface BusScheduleExtractionResult {
  schedules: Omit<BusSchedule, 'id' | 'createdAt' | 'updatedAt'>[];
  processingTime: number;
  error?: string;
}

/**
 * お気に入りバス停の設定
 */
export interface FavoriteBusStop {
  stopName: string;           // バス停名
  selectedDestination?: string; // 選択中の方面（任意）
}

/**
 * バス停ごとのグループ化データ
 */
export interface BusStopGroup {
  stopName: string;
  destinations: {
    destination: string;
    schedules: BusSchedule[];
  }[];
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
