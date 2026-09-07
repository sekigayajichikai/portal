/**
 * 自治会館 予約（空き状況）取得サービス
 *
 * book-system と同じ sekigaya-portal DB の bookings / booking_rooms を
 * 読み取り専用で参照する。ポータルでは「空き状況の確認」用途で表示する。
 * 予約の登録・編集は book-system 側で行う。
 *
 * @module services/data/bookingService
 */

import { getSupabaseClient } from '../supabaseClient.js';

/** 予約枠（午前／午後／夜間） */
export type BookingSlot = '午前' | '午後' | '夜間';

/** 予約1件（bookings テーブル） */
export interface Booking {
  id: string;
  date: string; // YYYY-MM-DD
  slot: BookingSlot;
  room: string; // 部屋名（booking_rooms.name と一致）
  title: string;
  status: string; // 'CONFIRMED' 等
  category: string | null;
  memo: string | null;
  event_id: string | null;
}

/** 部屋マスター（booking_rooms テーブル） */
export interface BookingRoom {
  id: string;
  name: string;
  short_name: string | null;
  capacity: number | null;
  description: string | null;
  sort_order: number;
}

/** 時間帯の表示順（マスター booking_time_slots に準拠） */
export const BOOKING_SLOTS: BookingSlot[] = ['午前', '午後', '夜間'];

/** 部屋一覧を取得（表示順） */
export async function getBookingRooms(): Promise<BookingRoom[]> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続です。');

  const { data, error } = await supabase
    .from('booking_rooms')
    .select('id,name,short_name,capacity,description,sort_order')
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data as BookingRoom[]) || [];
}

/**
 * 予約を取得（確定分のみ・日付昇順）
 *
 * @param opts.from 取得開始日（YYYY-MM-DD, 含む）
 * @param opts.to   取得終了日（YYYY-MM-DD, 含む）
 */
export async function getBookings(opts?: {
  from?: string;
  to?: string;
}): Promise<Booking[]> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続です。');

  let query = supabase
    .from('bookings')
    .select('id,date,slot,room,title,status,category,memo,event_id')
    .eq('status', 'CONFIRMED');

  if (opts?.from) query = query.gte('date', opts.from);
  if (opts?.to) query = query.lte('date', opts.to);

  const { data, error } = await query.order('date', { ascending: true });

  if (error) throw error;
  return (data as Booking[]) || [];
}
