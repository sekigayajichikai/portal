/**
 * 記事関連の型定義
 */

export type Priority = 'high' | 'medium' | 'low';
export type Visibility = 'public' | 'members-only' | 'board-only';
export type ArticleType = 'official' | 'local-info';

/**
 * 添付ファイル
 */
export interface Attachment {
  type: 'pdf' | 'image' | 'link';
  url: string;
  label: string;
}

/**
 * 記事
 * PDFから抽出されたコンテンツ、または手動作成された記事
 */
export interface Article {
  id: string;
  newsletter_id: string;
  organization_id: string;

  // 基本情報
  title: string;
  category: string;
  article_type: ArticleType; // 記事の種類（自治会公式 or 地域情報）
  priority: Priority;
  control_date: string | null; // 管理用日付（この日を過ぎると優先度を下げる）

  // イベント情報（category=eventの場合にAIが自動入力）
  event_date?: string | null; // 開催日 YYYY-MM-DD
  event_time?: string | null; // 時間帯 例: 10:00-12:00
  event_location?: string | null; // 場所 例: 自治会館

  // 4段階要約（Claude AIが生成）
  headline: string;   // 5文字以内
  brief: string;      // 15文字程度
  summary: string;    // 40文字程度
  content: string;    // 全文

  // メタ情報
  tags: string[];
  visibility: Visibility;
  source: string; // "関ヶ谷だより" | "会報ふれあい"
  attachments: Attachment[];
  thumbnail_url: string | null; // サムネイル画像URL（最初にアップロードした画像を自動設定）
  thumbnail_fit?: 'cover' | 'contain'; // サムネイル表示モード（cover=切り取り, contain=全体表示）
  image_display?: 'thumbnail' | 'full' | 'tall'; // 画像表示モード（thumbnail=切り取り, full=全体表示, tall=縦長+タップ拡大）

  // 表示制御
  display_order: number | null;
  is_pinned: boolean;

  created_at: string;
  updated_at: string;
}

/**
 * カテゴリ設定
 */
export interface Category {
  id: string;
  label: string;
  icon: string;
  color: string;
}

/**
 * 記事抽出結果
 */
export interface ExtractionResult {
  articles: Omit<Article, 'id' | 'newsletter_id' | 'organization_id' | 'created_at' | 'updated_at'>[];
  processingTime: number;
}
