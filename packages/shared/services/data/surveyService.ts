/**
 * アンケート読み取りの保存（survey_sheets）と AI 利用記録（ai_usage_log）
 *
 * SQL: sql/migrations/2026-11-21-survey-reading.sql
 * テーブルが未作成でも画面は動く（読めないときは空、書けないときは warn してメモリ上だけ）。
 */
import { getSupabaseClient } from '../supabaseClient.js';
import type { SurveySheetReading } from '../survey/surveyDefinition.js';
import type { TokenUsage } from '../survey/surveyReadService.js';

export interface SurveySheet {
  id: string;
  survey_id: string;
  /** 地域（関ヶ谷／山の手／夏山）。紙は回収ルートで決まる */
  region: string | null;
  /** 元ファイル名とページ番号（例: 20261117_西金沢….pdf / 3） */
  source_name: string;
  source_page: number;
  /** AI の読み取り（そのまま） */
  reading: SurveySheetReading | null;
  /** 人が直した値。null なら reading をそのまま使う */
  corrected: Record<string, number[] | string> | null;
  /** 'unread' 読む前 / 'read' AI が読んだ / 'review' 人の確認待ち / 'confirmed' 確認済み / 'invalid' 無効票 */
  status: 'unread' | 'read' | 'review' | 'confirmed' | 'invalid';
  model: string | null;
  usage: TokenUsage | null;
  /** 縮小した画像（data URL, JPEG）。確認画面用。元の PDF は Drive に残す */
  thumb: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiUsageLog {
  id: string;
  /** 'survey_read' など */
  feature: string;
  /** アンケートID・号IDなど */
  target: string | null;
  /** 票数・PDF枚数など */
  items: number;
  model: string;
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  /** 見込み（円）。ボタンに出した値 */
  estimated_jpy: number;
  /** 実績（円） */
  actual_jpy: number;
  /** 'free' 無料枠 / 'paid' 有料枠 */
  billing: 'free' | 'paid';
  /** 途中で止まったときの理由など */
  note: string | null;
  created_at: string;
}

function warnOnce(key: string, msg: string) {
  const g = globalThis as unknown as { __surveyWarned?: Set<string> };
  g.__surveyWarned ??= new Set();
  if (g.__surveyWarned.has(key)) return;
  g.__surveyWarned.add(key);
  console.warn(msg);
}

/** 表が無い／権限が無いときに true（画面はメモリだけで続ける） */
export function isTableMissing(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42P01' || /does not exist|relation .* not found|schema cache/i.test(error.message ?? '');
}

export async function listSurveySheets(surveyId: string): Promise<SurveySheet[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('survey_sheets')
    .select('*')
    .eq('survey_id', surveyId)
    .order('source_name', { ascending: true })
    .order('source_page', { ascending: true });
  if (error) {
    warnOnce('survey_sheets_read', `survey_sheets を読めませんでした（SQL 未適用の可能性）: ${error.message}`);
    return [];
  }
  return (data as SurveySheet[]) ?? [];
}

export type SurveySheetInput = Omit<SurveySheet, 'id' | 'created_at' | 'updated_at'> & { id?: string };

/** 1票を保存（id があれば更新）。保存できたら DB の行、できなければ null */
export async function upsertSurveySheet(input: SurveySheetInput): Promise<SurveySheet | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const row = { ...input, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('survey_sheets').upsert(row).select('*').single();
  if (error) {
    warnOnce('survey_sheets_write', `survey_sheets に保存できませんでした（SQL 未適用の可能性）: ${error.message}`);
    return null;
  }
  return data as SurveySheet;
}

export async function deleteSurveySheets(ids: string[]): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase || ids.length === 0) return false;
  const { error } = await supabase.from('survey_sheets').delete().in('id', ids);
  if (error) {
    console.warn('survey_sheets を削除できませんでした:', error.message);
    return false;
  }
  return true;
}

export async function addAiUsageLog(input: Omit<AiUsageLog, 'id' | 'created_at'>): Promise<AiUsageLog | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from('ai_usage_log').insert(input).select('*').single();
  if (error) {
    warnOnce('ai_usage_log_write', `ai_usage_log に記録できませんでした（SQL 未適用の可能性）: ${error.message}`);
    return null;
  }
  return data as AiUsageLog;
}

export async function listAiUsageLogs(limit = 100): Promise<AiUsageLog[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('ai_usage_log').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) {
    warnOnce('ai_usage_log_read', `ai_usage_log を読めませんでした（SQL 未適用の可能性）: ${error.message}`);
    return [];
  }
  return (data as AiUsageLog[]) ?? [];
}
