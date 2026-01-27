/**
 * 広報誌（Newsletter）関連の型定義
 */

export type NewsletterStatus = 'draft' | 'published' | 'archived';

/**
 * 広報誌（月号）
 */
export interface Newsletter {
  id: string;
  organization_id: string;
  title: string; // "2025年12月号"
  issue_date: string; // YYYY-MM-DD
  source_pdf_url: string | null;
  status: NewsletterStatus;
  created_by: string;
  created_at: string;
  published_at: string | null;
  digest_audio_url?: string | null; // ダイジェスト版音声ファイルのURL
  digest_audio_filename?: string | null; // ダイジェスト版音声ファイルの元のファイル名
}
