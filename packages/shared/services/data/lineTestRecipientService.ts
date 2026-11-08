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
/** 「この人に送る」の送り先として使える ID（ユーザー U／グループ C／複数人トーク R。2026-11-08 にグループを許可） */
export const isLineRecipientId = (v: string): boolean => /^[UCR][0-9a-f]{32}$/.test(v.trim());
/** ID の種類（表示用） */
export const lineRecipientKind = (v: string): 'user' | 'group' | 'room' | null => {
  const t = v.trim();
  if (/^U[0-9a-f]{32}$/.test(t)) return 'user';
  if (/^C[0-9a-f]{32}$/.test(t)) return 'group';
  if (/^R[0-9a-f]{32}$/.test(t)) return 'room';
  return null;
};
export const LINE_RECIPIENT_KIND_LABEL: Record<'user' | 'group' | 'room', string> = { user: '', group: 'グループ', room: '複数人トーク' };

/** 公式LINE（Bot）が参加しているグループ・複数人トーク（line_groups。line-webhook が控える） */
export interface LineGroup {
  group_id: string;
  kind: 'group' | 'room';
  name: string | null;
  picture_url: string | null;
  joined_at: string | null;
  left_at: string | null;
  last_seen_at: string;
}

/** Bot が参加中のグループ・複数人トーク（最近イベントが届いた順）。テーブル未作成のときは空 */
export async function listLineGroups(): Promise<LineGroup[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('line_groups').select('*').is('left_at', null).order('last_seen_at', { ascending: false }).limit(50);
  if (error) {
    console.warn('グループの一覧を読めませんでした（テーブル未作成の可能性。sql/migrations/2026-11-08-line-groups.sql）:', error.message);
    return [];
  }
  return (data as LineGroup[]) ?? [];
}

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

/** 送り先を登録する（ユーザー・グループ・複数人トーク）。同じ ID があれば名前だけ更新する */
export async function addLineTestRecipient(name: string, lineUserId: string): Promise<LineTestRecipient> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続です。');
  const row = { name: name.trim(), line_user_id: lineUserId.trim() };
  if (!row.name) throw new Error('名前を入れてください。');
  if (!isLineRecipientId(row.line_user_id)) throw new Error('LINE の ID は U（ユーザー）・C（グループ）・R（複数人トーク）のどれかで始まる33文字です。');
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
