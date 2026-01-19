/**
 * 回覧板関連の型定義
 */

import { PublicEvent } from './event.js';

/**
 * 回覧板情報（管理者視点）
 */
export interface Circular {
  id: string;
  title: string;
  content: string;
  date: string;
  category: 'event' | 'notice' | 'disaster' | 'other';
  author: string;
  readCount: number;
  totalTarget: number;
  extractedEvents?: PublicEvent[];
}

/**
 * 回覧板情報（住民視点）
 */
export interface CircularForResident {
  id: string;
  title: string;
  date: string;
  content: string;
  isRead: boolean;
  groupReadRate: number; // 0-100 percentage
}
