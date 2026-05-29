/**
 * いいね管理サービス
 */

import { getSupabaseClient } from '../supabaseClient.js';

// 端末固有IDをlocalStorageで管理
function getDeviceId(): string {
  const key = 'cc-saas-device-id';
  let id = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  if (!id) {
    id = crypto.randomUUID();
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, id);
  }
  return id;
}

/** いいねを追加（既に押していたら削除） */
export async function toggleLike(articleId: string): Promise<{ liked: boolean; count: number }> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続');
  const deviceId = getDeviceId();

  // 既にいいね済みか確認
  const { data: existing } = await supabase
    .from('article_likes')
    .select('id')
    .eq('article_id', articleId)
    .eq('device_id', deviceId)
    .single();

  if (existing) {
    // 取り消し
    await supabase.from('article_likes').delete().eq('id', existing.id);
  } else {
    // 追加
    await supabase.from('article_likes').insert({ article_id: articleId, device_id: deviceId });
  }

  // 最新カウントを取得
  const { count } = await supabase
    .from('article_likes')
    .select('*', { count: 'exact', head: true })
    .eq('article_id', articleId);

  return { liked: !existing, count: count || 0 };
}

/** 記事のいいね数を一括取得 */
export async function getLikeCounts(articleIds: string[]): Promise<Record<string, number>> {
  const supabase = getSupabaseClient();
  if (!supabase) return {};

  const { data } = await supabase
    .from('article_likes')
    .select('article_id')
    .in('article_id', articleIds);

  const counts: Record<string, number> = {};
  articleIds.forEach(id => { counts[id] = 0; });
  data?.forEach((row: any) => { counts[row.article_id] = (counts[row.article_id] || 0) + 1; });
  return counts;
}

/** 自分がいいね済みの記事IDリストを取得 */
export async function getMyLikes(articleIds: string[]): Promise<Set<string>> {
  const supabase = getSupabaseClient();
  if (!supabase) return new Set();
  const deviceId = getDeviceId();

  const { data } = await supabase
    .from('article_likes')
    .select('article_id')
    .eq('device_id', deviceId)
    .in('article_id', articleIds);

  return new Set(data?.map((r: any) => r.article_id) || []);
}
