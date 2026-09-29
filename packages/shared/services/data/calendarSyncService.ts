/**
 * 予定カード（event_cards）→ カレンダー（calendar_events）への反映
 *
 * 回覧板ポータルで整えた予定を、自治会カレンダー（book-system）に載せる。
 * 以前は「JSONをコピーしてカレンダー側の画面に貼る」手作業だったが、
 * 2026-09 に本番DBが同じプロジェクトになったので、回覧板側から直接書けるようにした（2026-09-29）。
 *
 * 考え方:
 * - 流すのは **公開済みの号の予定** だけ（下書きの号は公開カレンダーに出ないのと同じ扱い）
 * - `calendar_events.source_event_card_id` で予定カードと紐づけ、何度流しても二重にならない
 * - カレンダー側で人が直した内容を勝手に戻さないよう、**差分を見せて選んでから**書く（画面側で確認）
 * - 会館予約（event_type='facility'）など、カレンダー側だけにある予定には触れない
 *
 * @module services/data/calendarSyncService
 */

import { getSupabaseClient } from '../supabaseClient.js';

/** カレンダーに書く1件（calendar_events の列に合わせる） */
export interface CalendarSyncValues {
  date: string;
  title: string;
  location: string | null;
  start_time: string | null;
  end_time: string | null;
  description: string | null;
  org_name: string | null;
  article_url: string | null;
  event_type: 'general';
  visibility: 'public';
  source_event_card_id: string;
}

/** 差分の種類 */
export type CalendarDiffKind =
  /** カレンダーに無いので新しく載せる */
  | 'new'
  /** 前に載せたものの内容が変わった */
  | 'update'
  /** 前に載せたものと同じ */
  | 'same'
  /** 紐づきは無いが、同じ日に似た予定がカレンダーにある（会館予約など）。既定では載せない */
  | 'conflict';

export interface CalendarDiffRow {
  kind: CalendarDiffKind;
  /** 元の予定カード */
  cardId: string;
  /** カレンダーに書く内容 */
  values: CalendarSyncValues;
  /** 既にあるカレンダー予定（update / conflict のとき） */
  existing?: { id: string; title: string; date: string; event_type: string | null; source_event_card_id: string | null } | null;
  /** update のとき、何が変わるか（画面の説明用） */
  changes?: string[];
}

/** カレンダー側の既存予定（突き合わせ用に必要な列だけ） */
export interface CalendarRowForSync {
  id: string;
  date: string;
  title: string;
  location: string | null;
  start_time: string | null;
  end_time: string | null;
  description: string | null;
  org_name: string | null;
  article_url: string | null;
  event_type: string | null;
  visibility: string | null;
  source_event_card_id: string | null;
}

const SYNC_COLS =
  'id,date,title,location,start_time,end_time,description,org_name,article_url,event_type,visibility,source_event_card_id';

/** 反映の突き合わせに使うカレンダー予定を取る（指定日以降。会館予約も含む） */
export async function getCalendarRowsForSync(fromDate: string): Promise<CalendarRowForSync[]> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続です。');
  const { data, error } = await supabase.from('calendar_events').select(SYNC_COLS).gte('date', fromDate).order('date');
  if (error) throw error;
  return (data as CalendarRowForSync[]) || [];
}

/** 「10:00-12:00」「13時～」などを開始・終了に分ける（カレンダーは HH:MM:SS） */
export function splitTimeForCalendar(time: string | null | undefined): { start: string | null; end: string | null } {
  if (!time) return { start: null, end: null };
  const hhmm = (h: string, m: string) => `${h.padStart(2, '0')}:${m}:00`;
  const range = time.match(/(\d{1,2}):(\d{2})\s*[-–—~〜～]\s*(\d{1,2}):(\d{2})/);
  if (range) return { start: hhmm(range[1], range[2]), end: hhmm(range[3], range[4]) };
  const one = time.match(/(\d{1,2}):(\d{2})/);
  if (one) return { start: hhmm(one[1], one[2]), end: null };
  // 「13時半」「9時」など
  const jp = time.match(/(\d{1,2})\s*時\s*(半)?/);
  if (jp) return { start: hhmm(jp[1], jp[2] ? '30' : '00'), end: null };
  return { start: null, end: null };
}

/** 予定カード1件をカレンダーの値にする */
export function toCalendarValues(
  card: {
    id: string;
    title: string;
    event_date: string | null;
    event_time?: string | null;
    event_location?: string | null;
    description?: string | null;
    organizer?: string | null;
    linked_article_id?: string | null;
  },
  siteUrl: string
): CalendarSyncValues | null {
  if (!card.event_date) return null;
  const { start, end } = splitTimeForCalendar(card.event_time);
  return {
    date: card.event_date,
    title: card.title,
    location: card.event_location ?? null,
    start_time: start,
    end_time: end,
    description: card.description ?? null,
    org_name: card.organizer ?? null,
    // 記事があれば回覧板ポータルの記事ページへ誘導する（カレンダーのメディア化）
    article_url: card.linked_article_id ? `${siteUrl}/?article=${card.linked_article_id}` : null,
    event_type: 'general',
    visibility: 'public',
    source_event_card_id: card.id,
  };
}

/** 内容が変わったか（変わった項目の名前を返す） */
function diffFields(next: CalendarSyncValues, prev: CalendarRowForSync): string[] {
  const pairs: Array<[string, unknown, unknown]> = [
    ['日付', next.date, prev.date],
    ['題名', next.title, prev.title],
    ['場所', next.location, prev.location],
    ['開始時刻', next.start_time, prev.start_time],
    ['終了時刻', next.end_time, prev.end_time],
    ['説明', next.description, prev.description],
    ['主催', next.org_name, prev.org_name],
    ['記事リンク', next.article_url, prev.article_url],
  ];
  return pairs.filter(([, a, b]) => (a ?? null) !== (b ?? null)).map(([label]) => label);
}

/**
 * 差分を組み立てる
 *
 * @param cards 流す候補の予定カード（画面側で「公開済みの号・今日以降」に絞っておく）
 * @param rows  カレンダー側の既存予定（getCalendarRowsForSync）
 * @param siteUrl 記事リンクに使う回覧板ポータルのURL
 * @param isSameTitle 同じ予定とみなす題名の判定（eventMatch の isSameEventTitle を渡す）
 */
export function buildCalendarDiff(
  cards: Array<Parameters<typeof toCalendarValues>[0]>,
  rows: CalendarRowForSync[],
  siteUrl: string,
  isSameTitle: (a: string, b: string) => boolean
): CalendarDiffRow[] {
  const byCard = new Map(rows.filter((r) => r.source_event_card_id).map((r) => [r.source_event_card_id as string, r]));
  const out: CalendarDiffRow[] = [];
  for (const card of cards) {
    const values = toCalendarValues(card, siteUrl);
    if (!values) continue;
    const linked = byCard.get(card.id);
    if (linked) {
      const changes = diffFields(values, linked);
      out.push({ kind: changes.length > 0 ? 'update' : 'same', cardId: card.id, values, existing: linked, changes });
      continue;
    }
    // 紐づきが無い場合、同じ日に似た題名の予定がカレンダーにあれば重複の恐れ（会館予約など）
    const similar = rows.find((r) => !r.source_event_card_id && r.date === values.date && isSameTitle(r.title, values.title));
    out.push({ kind: similar ? 'conflict' : 'new', cardId: card.id, values, existing: similar ?? null });
  }
  return out;
}

/** 反映する（new/conflict は追加、update は更新）。戻り値は追加・更新の件数 */
export async function applyCalendarDiff(rows: CalendarDiffRow[]): Promise<{ added: number; updated: number }> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続です。');
  const toAdd = rows.filter((r) => r.kind === 'new' || r.kind === 'conflict').map((r) => r.values);
  const toUpdate = rows.filter((r) => r.kind === 'update');

  if (toAdd.length > 0) {
    const { error } = await supabase.from('calendar_events').insert(toAdd);
    if (error) throw error;
  }
  for (const r of toUpdate) {
    if (!r.existing) continue;
    const { error } = await supabase.from('calendar_events').update(r.values).eq('id', r.existing.id);
    if (error) throw error;
  }
  return { added: toAdd.length, updated: toUpdate.length };
}

/** カレンダーから外す（回覧板由来のものだけ消せる。カレンダー側で作った予定には触れない） */
export async function removeCalendarEventByCard(cardId: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続です。');
  const { error } = await supabase.from('calendar_events').delete().eq('source_event_card_id', cardId);
  if (error) throw error;
}
