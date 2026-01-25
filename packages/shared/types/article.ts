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
  deadline: string | null; // YYYY-MM-DD

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
