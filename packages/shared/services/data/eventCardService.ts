/**
 * イベントカード管理サービス
 */

import { getSupabaseClient } from '../supabaseClient.js';

export interface EventCard {
  id: string;
  newsletter_id: string;
  title: string;
  event_date: string | null;
  event_time: string | null;
  event_location: string | null;
  linked_article_id: string | null;
  display_order: number;
  created_at: string;
}

export async function getEventCards(newsletterId: string): Promise<EventCard[]> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続');
  const { data, error } = await supabase
    .from('event_cards')
    .select('*')
    .eq('newsletter_id', newsletterId)
    .order('display_order')
    .order('event_date');
  if (error) throw error;
  return data || [];
}

export async function addEventCard(card: Omit<EventCard, 'id' | 'created_at'>): Promise<EventCard> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続');
  const { data, error } = await supabase
    .from('event_cards')
    .insert(card)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateEventCard(id: string, updates: Partial<EventCard>): Promise<EventCard> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続');
  const { data, error } = await supabase
    .from('event_cards')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteEventCard(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続');
  const { error } = await supabase.from('event_cards').delete().eq('id', id);
  if (error) throw error;
}
