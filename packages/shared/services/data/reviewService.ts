/**
 * 公開前確認（承認フロー）サービス
 *
 * 回覧板を公開する前に担当者に確認してもらうためのワークフローを提供します。
 * 管理者が確認用リンク（/review/<token>）を発行し、担当者はログイン不要で
 * プレビューを確認して「承認」または「修正依頼」を返します。
 * 承認されると管理画面の「公開する」ボタンが有効になります。
 *
 * @module services/reviewService
 */

import { getSupabaseClient } from '../supabaseClient.js';
import { Newsletter } from '../../types/index.js';

/** 担当者が返せる判定 */
export type ReviewVerdict = 'approved' | 'changes_requested';

/**
 * 担当者への確認を依頼（確認用トークンを発行）
 *
 * 新しいトークンを発行するため、以前のリンクは無効になります。
 * 修正依頼後に再依頼する場合もこの関数を呼びます。
 *
 * @param newsletterId - 確認を依頼するNewsletterのUUID
 * @returns 更新後のNewsletter（review_tokenを含む）
 */
export async function requestReview(newsletterId: string): Promise<Newsletter> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase未接続です。環境変数を確認してください。');
  }

  const token = crypto.randomUUID();

  const { data, error } = await supabase
    .from('newsletters')
    .update({
      review_status: 'pending',
      review_token: token,
      review_requested_at: new Date().toISOString(),
      reviewed_at: null,
      review_comment: null,
      reviewer_name: null,
    })
    .eq('id', newsletterId)
    .eq('status', 'draft')
    .select()
    .single();

  if (error) {
    console.error('❌ 確認依頼エラー:', error);
    throw error;
  }

  console.log('✅ 確認依頼を作成:', newsletterId);
  return data;
}

/**
 * 確認依頼を取り下げ（トークンを無効化して未依頼状態に戻す）
 *
 * @param newsletterId - 対象NewsletterのUUID
 * @returns 更新後のNewsletter
 */
export async function cancelReview(newsletterId: string): Promise<Newsletter> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase未接続です。環境変数を確認してください。');
  }

  const { data, error } = await supabase
    .from('newsletters')
    .update({
      review_status: null,
      review_token: null,
      review_requested_at: null,
      reviewed_at: null,
      review_comment: null,
      reviewer_name: null,
    })
    .eq('id', newsletterId)
    .select()
    .single();

  if (error) {
    console.error('❌ 確認依頼の取り下げエラー:', error);
    throw error;
  }

  return data;
}

/**
 * 確認用トークンからNewsletterを取得（担当者の確認ページ用）
 *
 * @param token - 確認用トークン
 * @returns 該当するNewsletter。トークンが無効な場合はnull
 */
export async function getNewsletterByReviewToken(token: string): Promise<Newsletter | null> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase未接続です。環境変数を確認してください。');
  }

  const { data, error } = await supabase
    .from('newsletters')
    .select('*')
    .eq('review_token', token)
    .maybeSingle();

  if (error) {
    console.error('❌ 確認ページ取得エラー:', error);
    throw error;
  }

  return data ?? null;
}

/**
 * 担当者の判定を保存（承認 or 修正依頼）
 *
 * 確認待ち（pending）の場合のみ受け付けます。
 * すでに判定済みの場合はエラーになります。
 *
 * @param token - 確認用トークン
 * @param verdict - 'approved'（承認） | 'changes_requested'（修正依頼）
 * @param comment - 担当者からのコメント（任意）
 * @param reviewerName - 担当者名（任意）
 * @returns 更新後のNewsletter
 */
export async function submitReview(
  token: string,
  verdict: ReviewVerdict,
  comment?: string,
  reviewerName?: string
): Promise<Newsletter> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase未接続です。環境変数を確認してください。');
  }

  const { data, error } = await supabase
    .from('newsletters')
    .update({
      review_status: verdict,
      reviewed_at: new Date().toISOString(),
      review_comment: comment?.trim() || null,
      reviewer_name: reviewerName?.trim() || null,
    })
    .eq('review_token', token)
    .eq('review_status', 'pending')
    .select()
    .single();

  if (error) {
    console.error('❌ 確認結果の保存エラー:', error);
    throw new Error('確認結果を保存できませんでした。すでに回答済みか、リンクが無効になっている可能性があります。');
  }

  console.log(`✅ 確認結果を保存: ${verdict}`);
  return data;
}
