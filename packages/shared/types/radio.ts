/**
 * AIラジオ関連の型定義
 */

/**
 * ラジオ番組生成ステータス
 */
export type RadioGenerationStatus = 'pending' | 'generating' | 'completed' | 'failed';

/**
 * 話者（DJ）
 */
export type Speaker = 'A' | 'B';

/**
 * ラジオ番組情報（データベース保存用）
 */
export interface RadioProgram {
  id: string;
  newsletter_id: string;
  organization_id: string;
  title: string;
  description: string;
  duration_seconds: number;
  script: string;
  audio_url: string;
  audio_filename: string;
  generation_status: RadioGenerationStatus;
  generation_error?: string;
  generated_at: string;
  article_count: number;
  segment_count: number;
  model_version: string;
  created_at: string;
  updated_at: string;
}

/**
 * ラジオセグメント（台本の一部分）
 * @deprecated セグメント分割を廃止したため不要。今後は台本全体を1回のTTS呼び出しで生成します。
 */
export interface RadioSegment {
  index: number;
  type: 'opening' | 'main' | 'ending';
  text: string;
  speaker: Speaker;
  audioUrl?: string;
}

/**
 * ラジオ番組生成リクエスト
 */
export interface RadioGenerationRequest {
  newsletterId: string;
  organizationId: string;
  targetDurationMinutes?: number; // デフォルト: 4分
}

/**
 * ラジオ番組生成進捗情報
 */
export interface RadioGenerationProgress {
  status: RadioGenerationStatus;
  currentStep: string; // 例: "記事を取得中...", "台本を生成中...", "音声を生成中..."
  progress: number; // 0-100
  error?: string;
}

/**
 * 旧形式のラジオ番組情報（既存機能用に残す）
 * @deprecated 新しいRadioProgramを使用してください
 */
export interface LegacyRadioProgram {
  id: string;
  title: string;
  sourceText: string;
  script: string;
  audioUrl?: string; // Blob URL
  createdAt: string;
  status: 'draft' | 'scripted' | 'produced';
}
