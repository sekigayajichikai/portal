/**
 * 週次配信の下書き（weekly_digest_drafts）
 *
 * 週次配信タブで人が決めたこと（⭐一押しの選択・この週だけ外した予定・リンク先・手で直した文・画像の種類）を
 * 下書きとして保存し、次に開いたとき（別の端末でも）同じ状態に戻す。画面側で変更のたびに自動保存する。
 * 配信日ごとに**複数**持てる（同じ週の A案・B案、先の週の作りだめ）。
 * 紹介文と画像の切り出しは予定カード（event_cards）側に保存されるのでここには入れない。
 *
 * テーブル: sql/migrations/2026-09-24-weekly-digest-drafts.sql ＋ -multi.sql ／ 仕様: docs/週次配信.md
 */

import { getSupabaseClient } from '../supabaseClient.js';

export interface WeeklyDigestDraft {
  id: string;
  /** 配信日（週の起点）YYYY-MM-DD */
  base_date: string;
  /** 下書きの名前（空なら画面側で「配信日の下書き」と表示） */
  name: string | null;
  /** null=自動 ／ []=今週は一押しなし ／ 配列=選んだ予定ID（順番どおり） */
  topic_ids: string[] | null;
  /** この週だけ外した予定ID */
  excluded_ids: string[];
  /** 一押しごとのリンク先の指定（予定ID → 'pdf' | 'article'） */
  link_kinds: Record<string, string>;
  /** 吹き出し①の文。手で直したときだけ入る（null=自動生成のまま） */
  greeting: string | null;
  /** コピー用の文面。手で直したときだけ入る（null=自動生成のまま） */
  text: string | null;
  /** 配信画像の種類（flyer / topic / hybrid / list） */
  image_mode: string | null;
  updated_at: string;
}

/** 保存時に渡す内容（id を省くと新規作成） */
export type WeeklyDigestDraftInput = Omit<WeeklyDigestDraft, 'id' | 'updated_at'> & { id?: string };

/** 下書きの一覧（配信日の新しい順 → 更新の新しい順）。テーブル未作成のときは空 */
export async function listWeeklyDigestDrafts(limit = 60): Promise<WeeklyDigestDraft[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('weekly_digest_drafts')
    .select('*')
    .order('base_date', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('週次配信の下書き一覧を読めませんでした（テーブル未作成の可能性）:', error.message);
    return [];
  }
  return (data as WeeklyDigestDraft[]) ?? [];
}

/** 下書きを保存（id があれば上書き、無ければ新規）。保存後の行を返す */
export async function saveWeeklyDigestDraft(draft: WeeklyDigestDraftInput): Promise<WeeklyDigestDraft> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続です。');
  const row = { ...draft, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('weekly_digest_drafts').upsert(row, { onConflict: 'id' }).select('*').single();
  if (error) throw error;
  return data as WeeklyDigestDraft;
}

/** 名前だけ変える */
export async function renameWeeklyDigestDraft(id: string, name: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続です。');
  const { error } = await supabase.from('weekly_digest_drafts').update({ name }).eq('id', id);
  if (error) throw error;
}

/** 下書きを削除 */
export async function deleteWeeklyDigestDraft(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続です。');
  const { error } = await supabase.from('weekly_digest_drafts').delete().eq('id', id);
  if (error) throw error;
}
