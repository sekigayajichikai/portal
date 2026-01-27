/**
 * 保留画像管理サービス
 *
 * PDFから抽出された画像で、記事への紐付けが保留中のものを管理します。
 * Newsletterごとに保留画像を保存・取得・更新・削除する機能を提供します。
 *
 * @module services/pendingImageService
 */

import { getSupabaseClient } from './supabaseClient.js';
import type { PendingImage, PendingImageInput } from '../types/index.js';

/**
 * 保留画像を保存
 *
 * PDFから抽出された画像をpending_imagesテーブルに保存します。
 * 各画像にはAIが検出した情報（キャプション、周辺テキスト、推奨記事など）が含まれます。
 *
 * @param newsletterId - 画像が属するNewsletter ID
 * @param images - 保存する保留画像の配列
 * @returns 保存された保留画像の配列
 * @throws Supabase未接続またはデータベースエラー
 */
export async function savePendingImages(
  newsletterId: string,
  images: Omit<PendingImageInput, 'newsletter_id'>[]
): Promise<PendingImage[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase未接続です。環境変数を確認してください。');
  }

  console.log(`💾 保留画像を保存中... Newsletter: ${newsletterId}, 画像数: ${images.length}`);

  // newsletter_idを追加
  const imagesWithNewsletterId = images.map((image) => ({
    ...image,
    newsletter_id: newsletterId,
  }));

  const { data, error } = await supabase
    .from('pending_images')
    .insert(imagesWithNewsletterId)
    .select();

  if (error) {
    console.error('❌ 保留画像保存エラー:', error);
    throw error;
  }

  console.log(`✅ 保留画像保存完了: ${data.length}件`);

  return data;
}

/**
 * Newsletter IDで保留画像を取得
 *
 * 指定されたNewsletterに属する全ての保留画像を取得します。
 * ステータスがpendingのもののみ、または全て取得するかを選択できます。
 *
 * @param newsletterId - Newsletter ID
 * @param onlyPending - trueの場合、status='pending'のみ取得（デフォルト: true）
 * @returns 保留画像の配列
 * @throws Supabase未接続またはデータベースエラー
 */
export async function getPendingImagesByNewsletterId(
  newsletterId: string,
  onlyPending: boolean = true
): Promise<PendingImage[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase未接続です。環境変数を確認してください。');
  }

  console.log(`📋 保留画像を取得中... Newsletter: ${newsletterId}`);

  let query = supabase
    .from('pending_images')
    .select('*')
    .eq('newsletter_id', newsletterId);

  if (onlyPending) {
    query = query.eq('status', 'pending');
  }

  query = query.order('page_number', { ascending: true });

  const { data, error } = await query;

  if (error) {
    console.error('❌ 保留画像取得エラー:', error);
    throw error;
  }

  console.log(`✅ 保留画像取得完了: ${data.length}件`);

  return data;
}

/**
 * 画像を記事に紐付ける
 *
 * 保留画像を指定された記事に紐付け、ステータスを'assigned'に更新します。
 * 記事のattachmentsフィールドには別途追加する必要があります。
 *
 * @param imageId - 保留画像のUUID
 * @param articleId - 紐付ける記事のUUID
 * @throws Supabase未接続またはデータベースエラー
 */
export async function assignImageToArticle(
  imageId: string,
  articleId: string
): Promise<PendingImage> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase未接続です。環境変数を確認してください。');
  }

  console.log(`🔗 画像を記事に紐付け中... 画像: ${imageId}, 記事: ${articleId}`);

  const { data, error } = await supabase
    .from('pending_images')
    .update({
      status: 'assigned',
      assigned_to_article_id: articleId,
      assigned_at: new Date().toISOString(),
    })
    .eq('id', imageId)
    .select()
    .single();

  if (error) {
    console.error('❌ 画像紐付けエラー:', error);
    throw error;
  }

  console.log(`✅ 画像紐付け完了`);

  return data;
}

/**
 * 保留画像を却下
 *
 * 保留画像のステータスを'rejected'に更新します。
 * 却下された画像は一覧に表示されなくなります。
 *
 * @param imageId - 保留画像のUUID
 * @throws Supabase未接続またはデータベースエラー
 */
export async function rejectPendingImage(imageId: string): Promise<PendingImage> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase未接続です。環境変数を確認してください。');
  }

  console.log(`🚫 保留画像を却下中... 画像: ${imageId}`);

  const { data, error } = await supabase
    .from('pending_images')
    .update({
      status: 'rejected',
    })
    .eq('id', imageId)
    .select()
    .single();

  if (error) {
    console.error('❌ 画像却下エラー:', error);
    throw error;
  }

  console.log(`✅ 画像却下完了`);

  return data;
}

/**
 * 保留画像を削除
 *
 * 保留画像をデータベースから完全に削除します。
 * Storage上の画像ファイルは別途削除する必要があります。
 *
 * @param imageId - 保留画像のUUID
 * @throws Supabase未接続またはデータベースエラー
 */
export async function deletePendingImage(imageId: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase未接続です。環境変数を確認してください。');
  }

  console.log(`🗑️ 保留画像を削除中... 画像: ${imageId}`);

  const { error } = await supabase.from('pending_images').delete().eq('id', imageId);

  if (error) {
    console.error('❌ 保留画像削除エラー:', error);
    throw error;
  }

  console.log(`✅ 保留画像削除完了`);
}

/**
 * Newsletter配下の全保留画像を削除
 *
 * 指定されたNewsletterに属する全ての保留画像を削除します。
 * Newsletter削除時などに使用します。
 *
 * @param newsletterId - Newsletter ID
 * @throws Supabase未接続またはデータベースエラー
 */
export async function deleteAllPendingImagesByNewsletterId(
  newsletterId: string
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase未接続です。環境変数を確認してください。');
  }

  console.log(`🗑️ Newsletter配下の全保留画像を削除中... Newsletter: ${newsletterId}`);

  const { error } = await supabase
    .from('pending_images')
    .delete()
    .eq('newsletter_id', newsletterId);

  if (error) {
    console.error('❌ 保留画像一括削除エラー:', error);
    throw error;
  }

  console.log(`✅ 保留画像一括削除完了`);
}

/**
 * 保留画像の統計情報を取得
 *
 * Newsletterごとの保留画像数、紐付け済み画像数、却下画像数を取得します。
 *
 * @param newsletterId - Newsletter ID
 * @returns 統計情報
 * @throws Supabase未接続またはデータベースエラー
 */
export async function getPendingImageStats(
  newsletterId: string
): Promise<{
  pending: number;
  assigned: number;
  rejected: number;
  total: number;
}> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase未接続です。環境変数を確認してください。');
  }

  const { data, error } = await supabase
    .from('pending_images')
    .select('status')
    .eq('newsletter_id', newsletterId);

  if (error) {
    console.error('❌ 保留画像統計取得エラー:', error);
    throw error;
  }

  const stats = {
    pending: data.filter((img) => img.status === 'pending').length,
    assigned: data.filter((img) => img.status === 'assigned').length,
    rejected: data.filter((img) => img.status === 'rejected').length,
    total: data.length,
  };

  console.log(`📊 保留画像統計:`, stats);

  return stats;
}
