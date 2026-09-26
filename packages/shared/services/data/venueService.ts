/**
 * 会場マスター管理サービス
 *
 * 予定カードの実施場所（event_location）を事前登録しておくためのマスター。
 * 主催団体（organizers）と同じ考え方で、
 *   - 抽出時に AI へ登録名を渡して表記を揃える
 *   - 抽出ダイアログの場所欄で候補から選べる
 *   - 別名（aliases）に当たる表記は resolveVenueName で正式名に置き換える
 * 管理は管理画面の「マスタ」タブ。テーブル: sql/migrations/2026-09-26-venues-master.sql
 *
 * @module services/data/venueService
 */

import { getSupabaseClient } from '../supabaseClient.js';

export interface Venue {
  id: string;
  organization_id: string | null;
  /** 正式名（施設名＋部屋名。例: 西金沢コミュニティハウス 2階） */
  name: string;
  /** 別名・揺れた表記（これに一致したら正式名に置き換える） */
  aliases: string[];
  display_order: number;
  created_at: string;
}

/** 会場一覧を取得（表示順） */
export async function getVenues(): Promise<Venue[]> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続です。');
  const { data, error } = await supabase.from('venues').select('*').order('display_order', { ascending: true }).order('name');
  if (error) throw error;
  return (data || []).map((v: any) => ({ ...v, aliases: Array.isArray(v.aliases) ? v.aliases : [] }));
}

/** 会場を追加 */
export async function addVenue(name: string, aliases: string[] = [], displayOrder?: number): Promise<Venue> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続です。');
  const { data, error } = await supabase
    .from('venues')
    .insert({ name, aliases, display_order: displayOrder ?? 100 })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** 会場を更新（名前・別名・表示順） */
export async function updateVenue(id: string, patch: Partial<Pick<Venue, 'name' | 'aliases' | 'display_order'>>): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続です。');
  const { error } = await supabase.from('venues').update(patch).eq('id', id);
  if (error) throw error;
}

/** 会場を削除（予定カードの場所の文字列はそのまま残る） */
export async function deleteVenue(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続です。');
  const { error } = await supabase.from('venues').delete().eq('id', id);
  if (error) throw error;
}

/** 会場一覧（AI・候補用）。テーブル未作成のときは空配列にして抽出は動かす */
export async function getVenuesSafe(): Promise<Venue[]> {
  try {
    return await getVenues();
  } catch {
    return [];
  }
}

/** 場所の表記を比べるための正規化（空白・全角英数・「1F」「１階」などの揺れを吸収） */
export function normalizeVenueText(s: string): string {
  return s
    .replace(/[\s　]/g, '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/(\d)f\b/gi, '$1階')
    .replace(/(\d)F/g, '$1階')
    .replace(/ケ/g, 'ヶ')
    .toLowerCase();
}

/**
 * 場所の文字列を会場マスターの正式名に寄せる。
 * 正式名か別名に（正規化して）一致すれば正式名、そうでなければ元の文字列のまま返す。
 */
export function resolveVenueName(location: string | null | undefined, venues: Venue[]): string | null {
  if (!location) return location ?? null;
  const key = normalizeVenueText(location);
  if (!key) return location;
  for (const v of venues) {
    if (normalizeVenueText(v.name) === key) return v.name;
    if (v.aliases.some((a) => normalizeVenueText(a) === key)) return v.name;
  }
  return location;
}
