/**
 * 住民用アプリ (apps/public) 固有の型定義
 * 共有型は @shared/types からインポートしてください
 */

// タブの種類（住民用アプリのナビゲーション）
export type TabType = 'home' | 'garbage' | 'bus' | 'calendar' | 'radio' | 'dashboard';

// 住民ユーザー情報
export interface User {
  id: string;
  name: string;
  avatar: string;
  group: string; // e.g. '1班'
}

// 回覧板情報（住民向け）
export interface Circular {
  id: string;
  title: string;
  date: string;
  content: string;
  isRead: boolean;
  groupReadRate: number; // 0-100 percentage
}

// 支払い情報
export interface Payment {
  id: string;
  title: string;
  amount: number;
  status: 'paid' | 'unpaid';
  dueDate: string;
}

// イベント情報（住民向け）
export interface Event {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  category: 'festival' | 'workshop' | 'sports' | 'other';
  image: string;
}

// バススケジュール情報
export interface BusSchedule {
  id: string;
  route: string;
  destination: string;
  times: string[]; // "HH:mm" format
}

// ゴミ収集情報
export interface GarbageInfo {
  type: string;
  icon: string;
  color: string;
  nextDate: string;
  description: string;
}

// 管理画面用の型定義
export interface AdminStats {
  totalMembers: number;
  memberChange: number;
  circularReadRate: number;
  unreadCirculars: number;
  paymentRate: number;
  unpaidHouseholds: number;
  urgentItems: number;
}

export interface GroupPaymentStats {
  groupName: string;
  paymentRate: number;
}

export interface AdminNotice {
  id: string;
  type: string;
  title: string;
  date: string;
}
