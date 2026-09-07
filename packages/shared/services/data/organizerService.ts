/**
 * 主催団体マスター管理サービス
 *
 * イベントの主催団体を事前登録しておくためのマスター。
 * 発行元(publishers)とは別概念で、抽出したイベントの主催団体を
 * 登録済みの名前から選べるようにして表記揺れを減らす目的。
 *
 * @module services/data/organizerService
 */

import { getSupabaseClient } from '../supabaseClient.js';

export interface Organizer {
  id: string;
  organization_id: string | null;
  name: string;
  short_name: string | null;
  display_order: number;
  created_at: string;
}

/** 主催団体一覧を取得（表示順） */
export async function getOrganizers(): Promise<Organizer[]> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続です。');

  const { data, error } = await supabase
    .from('organizers')
    .select('*')
    .order('display_order', { ascending: true })
    .order('name');

  if (error) throw error;
  return data || [];
}

/** 主催団体を追加 */
export async function addOrganizer(
  name: string,
  shortName?: string,
  displayOrder?: number
): Promise<Organizer> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続です。');

  const { data, error } = await supabase
    .from('organizers')
    .insert({ name, short_name: shortName || null, display_order: displayOrder ?? 100 })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** 主催団体名の一覧を取得（AI用：名前だけの配列）。テーブル未作成時は空配列を返す */
export async function getOrganizerNames(): Promise<string[]> {
  try {
    const organizers = await getOrganizers();
    return organizers.map((o) => o.name);
  } catch {
    // organizers テーブルが未作成(マイグレーション未適用)でも抽出は動かす
    return [];
  }
}
