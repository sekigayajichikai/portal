/**
 * AIラジオ関連の型定義
 */

/**
 * ラジオ番組情報
 */
export interface RadioProgram {
  id: string;
  title: string;
  sourceText: string;
  script: string;
  audioUrl?: string; // Blob URL
  createdAt: string;
  status: 'draft' | 'scripted' | 'produced';
}
