/**
 * ゴミ箱（削除したものの控え）
 *
 * 削除の直前に中身を trash_items へ控え、管理画面から元に戻せるようにする。
 * カレンダーアプリ（book-system）も同じテーブルに控えを入れるので、
 * 予定・予約もここから戻せる。テーブル定義は sql/migrations/2026-10-02-trash-items.sql。
 *
 * @module services/data/trashService
 */

import { getSupabaseClient } from '../supabaseClient.js';

export type TrashKind = 'newsletter' | 'article' | 'event_card' | 'calendar_event' | 'booking';

/** 戻すときに入れ直す順に並べた、テーブルと行の組 */
export interface TrashPart {
  table: string;
  rows: Record<string, unknown>[];
}

export interface TrashItem {
  id: string;
  kind: TrashKind;
  label: string;
  payload: TrashPart[];
  source: string;
  deleted_at: string;
}

/** trash_items がまだ作られていない（SQL 未実行）ときのエラーか */
function isMissingTable(error: { code?: string; message?: string }): boolean {
  const message = error.message ?? '';
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    (/trash_items/.test(message) && /exist|find/i.test(message))
  );
}

/**
 * 削除の直前に控えを取る。
 * 控えが取れなかったら例外にして、削除を止める（戻せないまま消えないように）。
 * ただしテーブル自体がまだ無いときは、従来どおり削除を続けられるよう何もしない。
 */
export async function saveToTrash(kind: TrashKind, label: string, payload: TrashPart[]): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続です。');
  if (payload.every((p) => p.rows.length === 0)) return;

  const { error } = await supabase.from('trash_items').insert({ kind, label, payload, source: 'portal' });
  if (error) {
    if (isMissingTable(error)) {
      console.warn('⚠️ ゴミ箱のテーブルがまだ無いため、控えを取らずに削除します（sql/migrations/2026-10-02-trash-items.sql を実行してください）');
      return;
    }
    throw error;
  }
}

/** 指定したテーブルの行をまとめて読む（控え用） */
export async function fetchRowsForTrash(
  table: string,
  column: string,
  value: string
): Promise<Record<string, unknown>[]> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続です。');
  const { data, error } = await supabase.from(table).select('*').eq(column, value);
  if (error) throw error;
  return data ?? [];
}

/** ゴミ箱の一覧（新しい順） */
export async function listTrash(limit = 100): Promise<TrashItem[]> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続です。');
  const { data, error } = await supabase
    .from('trash_items')
    .select('*')
    .order('deleted_at', { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  return (data ?? []) as TrashItem[];
}

/**
 * 元に戻す。控えの順に行を入れ直し、終わったら控えを消す。
 * 同じ時間帯・部屋に別の予約が入っている場合などは失敗する（入れ直した分はそのまま残る）。
 */
export async function restoreFromTrash(item: TrashItem): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続です。');
  for (const part of item.payload) {
    if (part.rows.length === 0) continue;
    // すでに戻っている行は飛ばす（途中で失敗してやり直したとき用）
    const { error } = await supabase.from(part.table).upsert(part.rows, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw error;
  }
  const { error } = await supabase.from('trash_items').delete().eq('id', item.id);
  if (error) throw error;
}

/** 控えを完全に消す（もう戻せなくなる） */
export async function purgeTrashItem(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続です。');
  const { error } = await supabase.from('trash_items').delete().eq('id', id);
  if (error) throw error;
}
