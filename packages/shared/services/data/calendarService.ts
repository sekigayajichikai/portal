/**
 * カレンダー（イベント・自治会館予定）取得サービス
 *
 * book-system（イベントカレンダー）と同じ sekigaya-portal DB の
 * `calendar_events` テーブルを参照する。回覧板ポータルからは読み取り専用で表示する。
 *
 * @module services/data/calendarService
 */

import { getSupabaseClient } from '../supabaseClient.js';

// 記事取得（getArticleById）は newsletterService に定義済みのものを利用する。
// ここで重複定義すると barrel の `export *` が曖昧になり import が壊れるため定義しない。

/** カレンダーイベント種別 */
export type CalendarEventType = 'facility' | 'closure' | 'general';

/** カレンダーイベント（calendar_events テーブル） */
export interface CalendarEvent {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  display_title: string | null;
  location: string | null;
  start_time: string | null; // HH:MM:SS
  end_time: string | null;
  memo: string | null;
  description: string | null;
  event_type: CalendarEventType;
  visibility: string;
  is_closure: boolean | null;
  is_major: boolean | null;
  org_name: string | null;
  article_url: string | null;
}

const SELECT_COLS =
  'id,date,title,display_title,location,start_time,end_time,memo,description,event_type,visibility,is_closure,is_major,org_name,article_url';

/**
 * 公開カレンダーイベントを取得（日付昇順）
 *
 * @param opts.from 取得開始日（YYYY-MM-DD, 含む）。省略時は全期間。
 * @param opts.to   取得終了日（YYYY-MM-DD, 含む）。省略時は全期間。
 */
export async function getCalendarEvents(opts?: {
  from?: string;
  to?: string;
}): Promise<CalendarEvent[]> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続です。');

  let query = supabase
    .from('calendar_events')
    .select(SELECT_COLS)
    .eq('visibility', 'public');

  if (opts?.from) query = query.gte('date', opts.from);
  if (opts?.to) query = query.lte('date', opts.to);

  const { data, error } = await query
    .order('date', { ascending: true })
    .order('start_time', { ascending: true, nullsFirst: true });

  if (error) throw error;
  return (data as CalendarEvent[]) || [];
}
