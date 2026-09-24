/**
 * 週次配信の下書き（weekly_digest_drafts）
 *
 * 週次配信タブで人が決めたこと（⭐一押しの選択・この週だけ外した予定・リンク先・手で直した文）を
 * 配信日ごとに保存し、次に開いたとき（別の端末でも）同じ状態に戻す。画面側で変更のたびに自動保存する。
 * 紹介文と画像の切り出しは予定カード（event_cards）側に保存されるのでここには入れない。
 *
 * テーブル: sql/migrations/2026-09-24-weekly-digest-drafts.sql ／ 仕様: docs/週次配信.md
 */

import { getSupabaseClient } from '../supabaseClient.js';

export interface WeeklyDigestDraft {
  /** 配信日（週の起点）YYYY-MM-DD。1週に1つ */
  base_date: string;
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
  updated_at?: string;
}

/** 配信日の下書きを取得（無ければ null。テーブル未作成のときも null にして画面は動かす） */
export async function getWeeklyDigestDraft(baseDate: string): Promise<WeeklyDigestDraft | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from('weekly_digest_drafts').select('*').eq('base_date', baseDate).maybeSingle();
  if (error) {
    console.warn('週次配信の下書きを読めませんでした（テーブル未作成の可能性）:', error.message);
    return null;
  }
  return (data as WeeklyDigestDraft | null) ?? null;
}

/** 下書きを保存（配信日ごとに上書き） */
export async function saveWeeklyDigestDraft(draft: WeeklyDigestDraft): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続です。');
  const { error } = await supabase
    .from('weekly_digest_drafts')
    .upsert({ ...draft, updated_at: new Date().toISOString() }, { onConflict: 'base_date' });
  if (error) throw error;
}

/** 下書きを削除（自動の状態に戻す） */
export async function deleteWeeklyDigestDraft(baseDate: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続です。');
  const { error } = await supabase.from('weekly_digest_drafts').delete().eq('base_date', baseDate);
  if (error) throw error;
}
