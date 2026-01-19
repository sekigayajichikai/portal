/**
 * 管理画面関連の型定義
 */

/**
 * 管理画面ダッシュボード統計
 */
export interface AdminStats {
  totalMembers: number;
  memberChange: number;
  circularReadRate: number;
  unreadCirculars: number;
  paymentRate: number;
  unpaidHouseholds: number;
  urgentItems: number;
}

/**
 * 管理画面お知らせ
 */
export interface AdminNotice {
  id: string;
  type: string;
  title: string;
  date: string;
}
