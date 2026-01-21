/**
 * Supabase Storage サービス
 *
 * PDFファイルのアップロード、削除、URL取得などのストレージ操作を提供します。
 *
 * @module services/storageService
 */

import { getSupabaseClient } from './supabaseClient.js';

/**
 * PDFアップロードの結果
 */
export interface UploadResult {
  /**
   * アップロードされたファイルの公開URL
   */
  url: string;

  /**
   * ファイルパス（バケット内の相対パス）
   */
  path: string;

  /**
   * ファイル名
   */
  filename: string;
}

/**
 * PDFファイルをSupabase Storageにアップロード
 *
 * ファイルは newsletters バケットに保存され、年月でフォルダ分けされます。
 * 例: newsletters/2025/01/school-newsletter-1234567890.pdf
 *
 * @param file - アップロードするPDFファイル
 * @param prefix - オプションのファイル名プレフィックス（例: "school", "police"）
 * @returns アップロード結果（URL、パス、ファイル名）
 * @throws アップロードに失敗した場合
 */
export async function uploadPDF(file: File, prefix?: string): Promise<UploadResult> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error('Supabaseが設定されていません');
  }

  // ファイル名の生成（年月/プレフィックス-タイムスタンプ.pdf）
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const timestamp = Date.now();
  const safePrefix = prefix ? `${sanitizeFilename(prefix)}-` : '';
  const safeOriginalName = sanitizeFilename(file.name.replace('.pdf', ''));
  const filename = `${safePrefix}${safeOriginalName}-${timestamp}.pdf`;
  const path = `${year}/${month}/${filename}`;

  try {
    // PDFをアップロード
    const { data, error } = await supabase.storage
      .from('newsletters')
      .upload(path, file, {
        contentType: 'application/pdf',
        cacheControl: '3600',
        upsert: false, // 同名ファイルの上書きを防ぐ
      });

    if (error) {
      console.error('Supabase Storage アップロードエラー:', error);
      throw new Error(`PDFのアップロードに失敗しました: ${error.message}`);
    }

    // 公開URLを取得
    const { data: urlData } = supabase.storage.from('newsletters').getPublicUrl(path);

    return {
      url: urlData.publicUrl,
      path: data.path,
      filename: file.name, // 元のファイル名を保持
    };
  } catch (error: any) {
    console.error('PDFアップロード処理エラー:', error);
    throw new Error(`PDFのアップロードに失敗しました: ${error.message}`);
  }
}

/**
 * 複数のPDFファイルを一括アップロード
 *
 * @param files - アップロードするPDFファイルの配列
 * @param prefix - オプションのファイル名プレフィックス
 * @returns アップロード結果の配列
 */
export async function uploadMultiplePDFs(
  files: File[],
  prefix?: string
): Promise<UploadResult[]> {
  const results: UploadResult[] = [];

  for (const file of files) {
    try {
      const result = await uploadPDF(file, prefix);
      results.push(result);
    } catch (error) {
      console.error(`ファイル ${file.name} のアップロードに失敗:`, error);
      // 他のファイルの処理を続行
    }
  }

  return results;
}

/**
 * PDFファイルを削除
 *
 * @param path - 削除するファイルのパス（バケット内の相対パス）
 * @throws 削除に失敗した場合
 */
export async function deletePDF(path: string): Promise<void> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error('Supabaseが設定されていません');
  }

  try {
    const { error } = await supabase.storage.from('newsletters').remove([path]);

    if (error) {
      console.error('Supabase Storage 削除エラー:', error);
      throw new Error(`PDFの削除に失敗しました: ${error.message}`);
    }
  } catch (error: any) {
    console.error('PDF削除処理エラー:', error);
    throw new Error(`PDFの削除に失敗しました: ${error.message}`);
  }
}

/**
 * 複数のPDFファイルを一括削除
 *
 * @param paths - 削除するファイルのパスの配列
 */
export async function deleteMultiplePDFs(paths: string[]): Promise<void> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error('Supabaseが設定されていません');
  }

  try {
    const { error } = await supabase.storage.from('newsletters').remove(paths);

    if (error) {
      console.error('Supabase Storage 一括削除エラー:', error);
      throw new Error(`PDFの一括削除に失敗しました: ${error.message}`);
    }
  } catch (error: any) {
    console.error('PDF一括削除処理エラー:', error);
    throw new Error(`PDFの一括削除に失敗しました: ${error.message}`);
  }
}

/**
 * ファイル名をサニタイズ（安全な文字のみに変換）
 *
 * スペース、日本語、特殊文字などを安全な文字に変換します。
 *
 * @param filename - 元のファイル名
 * @returns サニタイズされたファイル名
 */
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/\s+/g, '-') // スペースをハイフンに
    .replace(/[^\w\-\.]/g, '') // 英数字、ハイフン、ドット以外を削除
    .toLowerCase();
}

/**
 * ストレージの使用状況を取得（デバッグ用）
 *
 * @returns バケット内のファイル一覧
 */
export async function listFiles(): Promise<any[]> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error('Supabaseが設定されていません');
  }

  const { data, error } = await supabase.storage.from('newsletters').list();

  if (error) {
    console.error('ファイル一覧取得エラー:', error);
    return [];
  }

  return data || [];
}
