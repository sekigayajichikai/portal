/**
 * 発行元マスター管理サービス
 */

import { getSupabaseClient } from '../supabaseClient.js';

export interface Publisher {
  id: string;
  organization_id: string | null;
  name: string;
  short_name: string | null;
  display_order: number;
  created_at: string;
}

/** 発行元一覧を取得（表示順） */
export async function getPublishers(): Promise<Publisher[]> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続です。');

  const { data, error } = await supabase
    .from('publishers')
    .select('*')
    .order('display_order', { ascending: true })
    .order('name');

  if (error) throw error;
  return data || [];
}

/** 発行元を追加 */
export async function addPublisher(name: string, shortName?: string, displayOrder?: number): Promise<Publisher> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続です。');

  const { data, error } = await supabase
    .from('publishers')
    .insert({ name, short_name: shortName || null, display_order: displayOrder ?? 100 })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** 発行元名の一覧を取得（AI用：名前だけの配列） */
export async function getPublisherNames(): Promise<string[]> {
  const publishers = await getPublishers();
  return publishers.map(p => p.name);
}
