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
  /** 主催団体（AI抽出。列が無い/未設定の場合はundefined） */
  organizer?: string | null;
  /** このイベントの抽出元PDFのURL（PDF抽出時のみ。列が無い/記事由来はnull/undefined） */
  source_pdf_url?: string | null;
  /** 種別: 'reserve'(要予約) / 'recurring'(連続) / 'open'(当日参加OK) / null(一般)。列が無い場合はundefined */
  category?: 'reserve' | 'recurring' | 'open' | null;
  /** 性質: 'community'(地域交流) / 'support'(福祉・健康支援) / 'class'(定例教室) / null。列が無い場合はundefined */
  kind?: 'community' | 'support' | 'class' | null;
  /** 週次LINE配信のトピック候補（1枚ものチラシ・複数掲載・AI判定から。列が無い場合はundefined） */
  weekly_topic?: boolean | null;
  /** weekly_topic の根拠（例: 単独チラシ / 複数掲載 / 年1回の芸術祭） */
  topic_reason?: string | null;
}

/** 公開カレンダー表示用に、出典（リンク記事・由来PDF）を含めたイベントカード */
export interface PublicEventCard extends EventCard {
  /** リンク記事（linked_article_id先。無ければnull） */
  linked_article?: { id: string; title: string; source: string | null } | null;
  /** 出典号の元PDF（source_pdf_url が無い場合のフォールバック＝号の先頭PDF） */
  newsletter_pdf_url?: string | null;
  /** 出典PDFの表示名（「にしかぜ」等。source_pdf_urls のlabel/publisherから解決） */
  source_pdf_label?: string | null;
}

export async function getEventCards(newsletterId: string): Promise<EventCard[]> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続');
  const { data, error } = await supabase
    .from('event_cards')
    .select('*')
    .eq('newsletter_id', newsletterId)
    .order('event_date', { ascending: true, nullsFirst: false })
    .order('display_order');
  if (error) throw error;
  return data || [];
}

/** 複数の号のイベントカードをまとめて取得（日付の近い順、日付未定は末尾） */
export async function getEventCardsForNewsletters(newsletterIds: string[]): Promise<EventCard[]> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続');
  if (newsletterIds.length === 0) return [];
  const { data, error } = await supabase
    .from('event_cards')
    .select('*')
    .in('newsletter_id', newsletterIds)
    .order('event_date', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data || [];
}

/**
 * 公開中(status=published)の号に紐づくイベントカードをまとめて取得（日付昇順・日付未定は末尾）
 *
 * 出典表示用に、リンク記事(id/title/source)と出典号の元PDFを埋め込む。
 */
export async function getPublishedEventCards(
  previewNewsletterId?: string
): Promise<PublicEventCard[]> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続');

  let query = supabase
    .from('event_cards')
    .select(
      '*, newsletters!inner(status,source_pdf_url,source_pdf_urls), linked_article:articles!linked_article_id(id,title,source)'
    );
  // 通常は公開済みのみ。公開プレビュー時はプレビュー対象号（下書き）も含めるため、
  // SQLでは status で絞らずJS側で「公開済み or プレビュー号」を残す。
  if (!previewNewsletterId) {
    query = query.eq('newsletters.status', 'published');
  }
  const { data, error } = await query.order('event_date', { ascending: true, nullsFirst: false });
  if (error) throw error;

  const rows = previewNewsletterId
    ? (data || []).filter(
        (row: any) =>
          row.newsletters?.status === 'published' || row.newsletter_id === previewNewsletterId
      )
    : data || [];

  return rows.map((row: any): PublicEventCard => {
    const nl = row.newsletters;
    // source_pdf_urls は { url, label, publisher, ... } のオブジェクト配列（古いデータは文字列）
    const entries: any[] = Array.isArray(nl?.source_pdf_urls) ? nl.source_pdf_urls : [];
    const firstUrl =
      (entries[0] && (typeof entries[0] === 'string' ? entries[0] : entries[0].url)) ||
      nl?.source_pdf_url ||
      null;
    const { newsletters: _n, linked_article, ...card } = row;

    // 由来PDF（card.source_pdf_url）があればそのラベルを解決
    let source_pdf_label: string | null = null;
    if (card.source_pdf_url) {
      const matched = entries.find(
        (e: any) => e && typeof e !== 'string' && e.url === card.source_pdf_url
      );
      source_pdf_label = (matched?.label || matched?.publisher || null) as string | null;
    }

    return {
      ...card,
      linked_article: linked_article ?? null,
      newsletter_pdf_url: firstUrl,
      source_pdf_label,
    };
  });
}

/**
 * マイグレーション未適用で未追加の列に起因するエラーなら、その列名を返す。
 * organizer / source_pdf_url など、後から足した任意列に対応する。
 */
function missingColumnName(error: any): string | null {
  const msg = String(error?.message ?? '');
  const isColumnError = error?.code === 'PGRST204' || /column/i.test(msg);
  if (!isColumnError) return null;
  // PostgREST: Could not find the 'xxx' column ... / SQL: column "xxx" does not exist
  const m = msg.match(/'([a-z_]+)'/i) || msg.match(/"([a-z_]+)"/);
  return m ? m[1] : null;
}

export async function addEventCard(card: Omit<EventCard, 'id' | 'created_at'>): Promise<EventCard> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続');

  // 未追加の列(organizer/source_pdf_url等)があればそれを外して再試行し、登録自体は通す
  let payload: Record<string, unknown> = { ...card };
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase.from('event_cards').insert(payload).select().single();
    if (!error) return data;
    const col = missingColumnName(error);
    if (col && col in payload) {
      delete payload[col];
      continue;
    }
    throw error;
  }
  throw new Error('イベントカードの登録に失敗しました');
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
