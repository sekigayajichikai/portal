/**
 * 週次配信の「この人に送る」の送り先（line_test_recipients）
 *
 * 役員それぞれが自分の名前と LINE のユーザーID を登録し、どの端末からでもプルダウンで選んで自分だけに送れるようにする
 * （2026-11-08。それまでは画面の入力欄に ID を直接入れ、ブラウザごとに1つだけ覚えていた）。
 *
 * テーブル: sql/migrations/2026-11-08-line-test-recipients.sql ／ 仕様: docs/週次配信.md
 */

import { getSupabaseClient } from '../supabaseClient.js';

export interface LineTestRecipient {
  id: string;
  /** 画面に出す名前（例: はな、会長） */
  name: string;
  /** LINE のユーザーID（U + 32桁の16進） */
  line_user_id: string;
  created_at: string;
}

/** LINE のユーザーID の形（U で始まる33文字） */
export const isLineUserId = (v: string): boolean => /^U[0-9a-f]{32}$/.test(v.trim());

/** 送り先の一覧（名前順）。テーブル未作成のときは空 */
export async function listLineTestRecipients(): Promise<LineTestRecipient[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('line_test_recipients').select('*').order('name');
  if (error) {
    console.warn('送り先の一覧を読めませんでした（テーブル未作成の可能性。sql/migrations/2026-11-08-line-test-recipients.sql）:', error.message);
    return [];
  }
  return (data as LineTestRecipient[]) ?? [];
}

/** 送り先を登録する。同じ ID があれば名前だけ更新する */
export async function addLineTestRecipient(name: string, lineUserId: string): Promise<LineTestRecipient> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続です。');
  const row = { name: name.trim(), line_user_id: lineUserId.trim() };
  if (!row.name) throw new Error('名前を入れてください。');
  if (!isLineUserId(row.line_user_id)) throw new Error('LINE のユーザーID は U で始まる33文字です。');
  const { data, error } = await supabase.from('line_test_recipients').upsert(row, { onConflict: 'line_user_id' }).select('*').single();
  if (error) {
    throw new Error(
      /does not exist|schema cache/.test(error.message)
        ? '送り先の表がまだありません（sql/migrations/2026-11-08-line-test-recipients.sql を SQL Editor で実行してください）'
        : `登録できませんでした: ${error.message}`
    );
  }
  return data as LineTestRecipient;
}

/** 送り先を削除する */
export async function deleteLineTestRecipient(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続です。');
  const { error } = await supabase.from('line_test_recipients').delete().eq('id', id);
  if (error) throw error;
}
