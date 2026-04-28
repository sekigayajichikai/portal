/**
 * Supabase Storage サービス
 *
 * PDFファイルのアップロード、削除、URL取得などのストレージ操作を提供します。
 *
 * @module services/storageService
 */

import { getSupabaseClient } from '../supabaseClient.js';

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
 * 音声ファイルをSupabase Storageにアップロード
 *
 * ファイルは radio バケットに保存され、年月でフォルダ分けされます。
 * 例: radio/2025/01/radio-newsletter-id-1234567890.wav
 *
 * @param audioBlob - アップロードする音声Blob
 * @param filename - ファイル名
 * @returns アップロード結果（URL、パス、ファイル名）
 * @throws アップロードに失敗した場合
 */
export async function uploadAudio(audioBlob: Blob, filename: string): Promise<UploadResult> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error('Supabaseが設定されていません');
  }

  // ファイル名の生成（年月/ファイル名）
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const path = `${year}/${month}/${filename}`;

  try {
    // 音声ファイルをアップロード
    const { data, error } = await supabase.storage.from('radio').upload(path, audioBlob, {
      contentType: 'audio/wav',
      cacheControl: '3600',
      upsert: true, // 同名ファイルがあれば上書き（再生成対応）
    });

    if (error) {
      console.error('Supabase Storage 音声アップロードエラー:', error);
      throw new Error(`音声ファイルのアップロードに失敗しました: ${error.message}`);
    }

    // 公開URLを取得
    const { data: urlData } = supabase.storage.from('radio').getPublicUrl(path);

    return {
      url: urlData.publicUrl,
      path: data.path,
      filename: filename,
    };
  } catch (error: any) {
    console.error('音声アップロード処理エラー:', error);
    throw new Error(`音声ファイルのアップロードに失敗しました: ${error.message}`);
  }
}

/**
 * 音声ファイルを削除
 *
 * @param path - 削除するファイルのパス（バケット内の相対パス）
 * @throws 削除に失敗した場合
 */
export async function deleteAudio(path: string): Promise<void> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error('Supabaseが設定されていません');
  }

  try {
    const { error } = await supabase.storage.from('radio').remove([path]);

    if (error) {
      console.error('Supabase Storage 音声削除エラー:', error);
      throw new Error(`音声ファイルの削除に失敗しました: ${error.message}`);
    }
  } catch (error: any) {
    console.error('音声削除処理エラー:', error);
    throw new Error(`音声ファイルの削除に失敗しました: ${error.message}`);
  }
}

/**
 * ダイジェスト音声ファイルをSupabase Storageにアップロード
 *
 * ファイルは newsletters バケットに保存され、年月でフォルダ分けされます。
 * 例: newsletters/2025/01/digest-newsletter-title-1234567890.mp3
 *
 * @param file - アップロードする音声ファイル（File形式）
 * @returns アップロード結果（URL、パス、ファイル名）
 * @throws アップロードに失敗した場合
 */
export async function uploadDigestAudio(file: File): Promise<UploadResult> {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'storageService.ts:uploadDigestAudio:entry',message:'Function entry',data:{fileName:file.name,fileSize:file.size,fileType:file.type},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  const supabase = getSupabaseClient();

  if (!supabase) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'storageService.ts:uploadDigestAudio:noSupabase',message:'Supabase not configured',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    throw new Error('Supabaseが設定されていません');
  }

  // ファイルサイズチェック（50MB以下）
  const maxSize = 50 * 1024 * 1024; // 50MB
  if (file.size > maxSize) {
    throw new Error('ファイルサイズが大きすぎます（50MB以下にしてください）');
  }

  // サポートされている音声フォーマットをチェック
  const supportedFormats = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/mp4', 'audio/m4a'];
  if (!supportedFormats.includes(file.type) && !file.name.match(/\.(mp3|wav|m4a)$/i)) {
    throw new Error('サポートされていない音声フォーマットです（mp3, wav, m4a のみ対応）');
  }

  // ファイル名の生成（年月/digest-ファイル名-タイムスタンプ.拡張子）
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const timestamp = Date.now();
  const fileExtension = file.name.split('.').pop() || 'mp3';
  const safeOriginalName = sanitizeFilename(file.name.replace(/\.[^.]+$/, ''));
  const filename = `digest-${safeOriginalName}-${timestamp}.${fileExtension}`;
  const path = `${year}/${month}/${filename}`;

  // Content-Typeを決定
  let contentType = file.type || 'audio/mpeg';
  if (fileExtension === 'mp3') contentType = 'audio/mpeg';
  else if (fileExtension === 'wav') contentType = 'audio/wav';
  else if (fileExtension === 'm4a') contentType = 'audio/mp4';

  try {
    console.log('📤 ダイジェスト音声をアップロード中...', filename);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'storageService.ts:uploadDigestAudio:beforeUpload',message:'Before Supabase upload',data:{path:path,contentType:contentType,filename:filename},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
    // #endregion

    // 音声ファイルをアップロード（newslettersバケットを使用）
    const { data, error } = await supabase.storage.from('newsletters').upload(path, file, {
      contentType: contentType,
      cacheControl: '3600',
      upsert: false, // 同名ファイルの上書きを防ぐ
    });
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'storageService.ts:uploadDigestAudio:afterUpload',message:'After Supabase upload',data:{hasData:!!data,hasError:!!error,errorMessage:error?.message,dataPath:data?.path},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
    // #endregion

    if (error) {
      console.error('Supabase Storage ダイジェスト音声アップロードエラー:', error);
      throw new Error(`ダイジェスト音声のアップロードに失敗しました: ${error.message}`);
    }

    // 公開URLを取得
    const { data: urlData } = supabase.storage.from('newsletters').getPublicUrl(path);

    console.log('✅ ダイジェスト音声アップロード完了:', urlData.publicUrl);

    return {
      url: urlData.publicUrl,
      path: data.path,
      filename: file.name, // 元のファイル名を保持
    };
  } catch (error: any) {
    console.error('ダイジェスト音声アップロード処理エラー:', error);
    throw new Error(`ダイジェスト音声のアップロードに失敗しました: ${error.message}`);
  }
}

/**
 * ダイジェスト音声ファイルを削除
 *
 * @param path - 削除するファイルのパス（バケット内の相対パス）
 * @throws 削除に失敗した場合
 */
export async function deleteDigestAudio(path: string): Promise<void> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error('Supabaseが設定されていません');
  }

  if (!path) {
    console.warn('削除するパスが指定されていません');
    return;
  }

  try {
    console.log('🗑️ ダイジェスト音声を削除中...', path);

    const { error } = await supabase.storage.from('newsletters').remove([path]);

    if (error) {
      console.error('Supabase Storage ダイジェスト音声削除エラー:', error);
      throw new Error(`ダイジェスト音声の削除に失敗しました: ${error.message}`);
    }

    console.log('✅ ダイジェスト音声削除完了');
  } catch (error: any) {
    console.error('ダイジェスト音声削除処理エラー:', error);
    throw new Error(`ダイジェスト音声の削除に失敗しました: ${error.message}`);
  }
}

/**
 * 画像ファイルをSupabase Storageにアップロード
 *
 * ファイルは newsletter-images バケットに保存され、年月でフォルダ分けされます。
 * 例: newsletter-images/2025/01/image-1234567890.jpg
 *
 * @param file - アップロードする画像ファイル
 * @returns アップロード結果（URL、パス、ファイル名）
 * @throws アップロードに失敗した場合
 */
export async function uploadImage(file: File): Promise<UploadResult> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error('Supabaseが設定されていません');
  }

  // ファイル形式チェック
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    throw new Error('画像ファイル形式が無効です。JPEG、PNG、GIF、WEBPのみサポートしています。');
  }

  // ファイルサイズチェック（5MB以下）
  const maxSize = 5 * 1024 * 1024; // 5MB
  if (file.size > maxSize) {
    throw new Error('画像ファイルサイズは5MB以下にしてください。');
  }

  // 画像を圧縮（最大幅1200px、品質80%）
  const compressedBlob = await compressImage(file);

  // ファイル名の生成（年月/image-タイムスタンプ.拡張子）
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const timestamp = Date.now();
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const filename = `image-${timestamp}.${extension}`;
  const path = `${year}/${month}/${filename}`;

  try {
    // 画像をアップロード
    const { data, error } = await supabase.storage
      .from('newsletter-images')
      .upload(path, compressedBlob, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false, // 同名ファイルの上書きを防ぐ
      });

    if (error) {
      console.error('Supabase Storage 画像アップロードエラー:', error);
      throw new Error(`画像のアップロードに失敗しました: ${error.message}`);
    }

    // 公開URLを取得
    const { data: urlData } = supabase.storage.from('newsletter-images').getPublicUrl(path);

    return {
      url: urlData.publicUrl,
      path: data.path,
      filename: file.name, // 元のファイル名を保持
    };
  } catch (error: any) {
    console.error('画像アップロード処理エラー:', error);
    throw new Error(`画像のアップロードに失敗しました: ${error.message}`);
  }
}

/**
 * 画像を圧縮（最大幅1200px、品質80%）
 *
 * @param file - 圧縮する画像ファイル
 * @returns 圧縮された画像Blob
 */
async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };

    reader.onerror = () => {
      reject(new Error('画像の読み込みに失敗しました'));
    };

    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // 最大幅1200pxに制限
      const maxWidth = 1200;
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvasコンテキストの取得に失敗しました'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // 品質80%でBlobに変換
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('画像の圧縮に失敗しました'));
          }
        },
        file.type,
        0.8
      );
    };

    img.onerror = () => {
      reject(new Error('画像の読み込みに失敗しました'));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * 画像ファイルを削除
 *
 * @param path - 削除するファイルのパス（バケット内の相対パス）
 * @throws 削除に失敗した場合
 */
export async function deleteImage(path: string): Promise<void> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error('Supabaseが設定されていません');
  }

  try {
    const { error } = await supabase.storage.from('newsletter-images').remove([path]);

    if (error) {
      console.error('Supabase Storage 画像削除エラー:', error);
      throw new Error(`画像の削除に失敗しました: ${error.message}`);
    }
  } catch (error: any) {
    console.error('画像削除処理エラー:', error);
    throw new Error(`画像の削除に失敗しました: ${error.message}`);
  }
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
