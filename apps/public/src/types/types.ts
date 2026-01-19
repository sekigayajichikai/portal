/**
 * 住民用アプリ (apps/public) 固有の型定義
 *
 * 共有型は @cc-saas/shared からインポートしてください
 */

// 共有型を再エクスポート（利便性のため）
export type {
  TabType,
  User,
  CircularForResident as Circular,
  Payment,
  Event,
  BusScheduleForResident as BusSchedule,
  GarbageInfo,
  AdminStats,
  GroupPaymentStats,
  AdminNotice,
} from '@cc-saas/shared/types';
