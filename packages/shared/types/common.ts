/**
 * 共通型定義
 * アプリ全体で使用される基本的な型
 */

/**
 * アプリケーションビュー（管理画面のナビゲーション）
 */
export enum AppView {
  DASHBOARD = 'DASHBOARD',
  MEMBERS = 'MEMBERS',
  FEES = 'FEES',
  LIFESTYLE = 'LIFESTYLE', // Bus & Garbage
  PUBLIC_CONTENT = 'PUBLIC_CONTENT', // Extracted events
  RADIO_STATION = 'RADIO_STATION', // AI Radio
}

/**
 * タブタイプ（住民用アプリのナビゲーション）
 */
export type TabType = 'home' | 'garbage' | 'bus' | 'calendar' | 'radio' | 'dashboard';
