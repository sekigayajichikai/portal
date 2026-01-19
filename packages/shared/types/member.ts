/**
 * 会員関連の型定義
 */

/**
 * 会員情報（管理者視点）
 */
export interface Member {
  id: string;
  name: string;
  address: string;
  group: string; // 班 (Ban)
  phone: string;
  email?: string;
  hasPaidFee: boolean;
  hasReadLatestCircular: boolean;
  role: 'member' | 'leader' | 'admin';
}

/**
 * ユーザー情報（住民視点）
 */
export interface User {
  id: string;
  name: string;
  avatar: string;
  group: string; // e.g. '1班'
}
