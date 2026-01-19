/**
 * イベント関連の型定義
 */

/**
 * 公開イベント情報（管理者が作成・公開）
 */
export interface PublicEvent {
  id: string;
  title: string;
  date: string;
  time?: string;
  location: string;
  description: string;
  isPublic: boolean;
}

/**
 * イベント情報（住民向け表示用）
 */
export interface Event {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  category: 'festival' | 'workshop' | 'sports' | 'other';
  image: string;
}
