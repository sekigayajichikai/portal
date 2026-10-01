/**
 * 団体マスタ管理サービス
 *
 * 予定の主催（event_cards.organizer）と、回覧板PDFの発行元を1つのマスタでまとめて扱う。
 * もともと organizers（主催団体）と publishers（発行元）に分かれていたが、
 * 紙面に出る外部団体（ケアプラザ・地区センターなど）の置き場所が無く、
 * 主催欄が手入力になって誤字や表記ゆれが通っていたため 2026-10-01 に一本化した。
 *
 * 会場マスタ（venues）と同じ考え方:
 *   - 抽出時に AI へ登録名を渡して表記を揃える
 *   - 入力欄で候補から選べる
 *   - 別名（aliases）に当たる表記は resolveOrganizerName で正式名に置き換える
 * 管理は管理画面の「マスタ」タブ。テーブル: sql/migrations/2026-10-01-organizers-unify.sql
 *
 * @module services/data/organizerService
 */

import { getSupabaseClient } from '../supabaseClient.js';
import { normalizeVenueText } from './venueService.js';

export interface Organizer {
  id: string;
  organization_id: string | null;
  /** 正式名（例: 釜利谷地区センター） */
  name: string;
  short_name: string | null;
  /** 別名・揺れた表記・誤字（これに一致したら正式名に置き換える） */
  aliases: string[];
  /** 予定の主催の候補に出す */
  use_as_organizer: boolean;
  /** 回覧板PDFの発行元の候補に出す */
  use_as_publisher: boolean;
  display_order: number;
  created_at: string;
}

/** 行をアプリ側の形に整える（aliases が null でも配列にする） */
function toOrganizer(row: any): Organizer {
  return {
    ...row,
    aliases: Array.isArray(row?.aliases) ? row.aliases : [],
    use_as_organizer: row?.use_as_organizer !== false,
    use_as_publisher: row?.use_as_publisher === true,
  };
}

/** 団体一覧を取得（表示順） */
export async function getOrganizers(): Promise<Organizer[]> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続です。');

  const { data, error } = await supabase
    .from('organizers')
    .select('*')
    .order('display_order', { ascending: true })
    .order('name');

  if (error) throw error;
  return (data || []).map(toOrganizer);
}

/** 団体一覧（AI・候補用）。テーブル未作成のときは空配列にして抽出は動かす */
export async function getOrganizersSafe(): Promise<Organizer[]> {
  try {
    return await getOrganizers();
  } catch {
    return [];
  }
}

/** 団体を追加 */
export async function addOrganizer(
  name: string,
  shortName?: string,
  displayOrder?: number,
  options?: { aliases?: string[]; useAsOrganizer?: boolean; useAsPublisher?: boolean }
): Promise<Organizer> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続です。');

  const { data, error } = await supabase
    .from('organizers')
    .insert({
      name,
      short_name: shortName || null,
      aliases: options?.aliases ?? [],
      use_as_organizer: options?.useAsOrganizer ?? true,
      use_as_publisher: options?.useAsPublisher ?? false,
      display_order: displayOrder ?? 100,
    })
    .select()
    .single();

  if (error) throw error;
  return toOrganizer(data);
}

/** 団体を更新（名前・別名・用途・表示順） */
export async function updateOrganizer(
  id: string,
  patch: Partial<Pick<Organizer, 'name' | 'short_name' | 'aliases' | 'use_as_organizer' | 'use_as_publisher' | 'display_order'>>
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続です。');
  const { error } = await supabase.from('organizers').update(patch).eq('id', id);
  if (error) throw error;
}

/** 団体を削除（予定カードの主催の文字列はそのまま残る） */
export async function deleteOrganizer(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続です。');
  const { error } = await supabase.from('organizers').delete().eq('id', id);
  if (error) throw error;
}

/** 主催の候補に出す団体名の一覧（AI用：名前だけの配列）。テーブル未作成時は空配列 */
export async function getOrganizerNames(): Promise<string[]> {
  const organizers = await getOrganizersSafe();
  return organizers.filter((o) => o.use_as_organizer).map((o) => o.name);
}

/**
 * 主催の文字列を団体マスタの正式名に寄せる。
 * 正式名か別名に（正規化して）一致すれば正式名、そうでなければ元の文字列のまま返す。
 * 表記の正規化は会場マスタと同じもの（空白・全角英数・ケ/ヶ を吸収）を使う。
 */
export function resolveOrganizerName(
  organizer: string | null | undefined,
  organizers: Organizer[]
): string | null {
  if (!organizer) return organizer ?? null;
  const key = normalizeVenueText(organizer);
  if (!key) return organizer;
  for (const o of organizers) {
    if (normalizeVenueText(o.name) === key) return o.name;
    if (o.aliases.some((a) => normalizeVenueText(a) === key)) return o.name;
  }
  return organizer;
}
