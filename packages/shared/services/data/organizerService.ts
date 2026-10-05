/**
 * 団体マスタ管理サービス
 *
 * 予定の主催（event_cards.organizer）と、回覧板PDFの発行元を1つのマスタでまとめて扱う。
 *
 * 2026-10-05 から、実体はカレンダー（book-system）の団体マスタ `booking_organizations`。
 * それまでは portal 専用の `organizers` を使っていたが、カレンダー側と名前が合わず
 * （関ヶ谷自治会 ⇔ 自治会、関ヶ谷クラブ ⇔ 関ケ谷クラブ）、カレンダーの団体絞り込みで
 * 回覧板の予定が「未分類」になっていたため一本化した（sql/migrations/2026-10-05-org-master-unify.sql）。
 * `organizers` テーブルはもう読まない（後日削除予定）。
 *
 * booking_organizations は会館を借りる団体のアカウントも兼ねるので、
 *   - 一覧に出すのは「主催」か「発行元」の候補にした団体だけ
 *   - 削除はせず「候補から外す」（予約や予定が団体の番号でつながっているため）
 *   - 新しく足す団体は外部団体として「地域の団体・施設」に入れ、会館は予約しない（can_book = false）
 *
 * 会場マスタ（venues）と同じ考え方:
 *   - 抽出時に AI へ登録名を渡して表記を揃える
 *   - 入力欄で候補から選べる
 *   - 別名（aliases）に当たる表記は resolveOrganizerName で正式名に置き換える
 * 管理は管理画面の「マスタ」タブ。
 *
 * @module services/data/organizerService
 */

import { getSupabaseClient } from '../supabaseClient.js';
import { normalizeVenueText } from './venueService.js';

const TABLE = 'booking_organizations';

/** 新しく足す外部団体のグループ（カレンダーの「表示する団体」にもこの名前で出る） */
export const EXTERNAL_ORG_GROUP = '地域の団体・施設';

/** 表示順が未設定の団体（カレンダー側で作られた団体）は後ろに並べる */
const NO_ORDER = 1000;

export interface Organizer {
  id: string;
  /** 互換のため残している（booking_organizations には無いので常に null） */
  organization_id: string | null;
  /** 正式名（例: 釜利谷地区センター） */
  name: string;
  /** 互換のため残している（略称は別名に入れる。常に null） */
  short_name: string | null;
  /** 別名・揺れた表記・誤字（これに一致したら正式名に置き換える） */
  aliases: string[];
  /** 予定の主催の候補に出す */
  use_as_organizer: boolean;
  /** 回覧板PDFの発行元の候補に出す */
  use_as_publisher: boolean;
  display_order: number;
  /** カレンダー側のグループ（自治会・委員会・地域の団体・施設 など） */
  group_name: string | null;
  /** 会館を予約する団体か（外部団体は false） */
  can_book: boolean;
  created_at: string;
}

/** 行をアプリ側の形に整える */
function toOrganizer(row: any): Organizer {
  return {
    id: row.id,
    organization_id: null,
    name: row.name,
    short_name: null,
    aliases: Array.isArray(row?.aliases) ? row.aliases : [],
    use_as_organizer: row?.use_as_organizer === true,
    use_as_publisher: row?.use_as_publisher === true,
    display_order: typeof row?.display_order === 'number' ? row.display_order : NO_ORDER,
    group_name: row?.group_name ?? null,
    can_book: row?.can_book !== false,
    created_at: row.created_at,
  };
}

const SELECT_COLS = 'id,name,aliases,use_as_organizer,use_as_publisher,display_order,group_name,can_book,is_active,created_at';

/** 団体一覧を取得（主催か発行元の候補にしている団体だけ。表示順） */
export async function getOrganizers(): Promise<Organizer[]> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続です。');

  const { data, error } = await supabase
    .from(TABLE)
    .select(SELECT_COLS)
    .or('use_as_organizer.eq.true,use_as_publisher.eq.true')
    .not('is_active', 'is', false)
    .order('display_order', { ascending: true, nullsFirst: false })
    .order('name');

  if (error) throw error;
  return (data || []).map(toOrganizer);
}

/** 団体一覧（AI・候補用）。読めないときは空配列にして抽出は動かす */
export async function getOrganizersSafe(): Promise<Organizer[]> {
  try {
    return await getOrganizers();
  } catch {
    return [];
  }
}

/** 正式名か別名が（正規化して）一致する団体を、候補にしていないものも含めて探す */
async function findByName(name: string): Promise<any | null> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続です。');
  const key = normalizeVenueText(name);
  const { data, error } = await supabase.from(TABLE).select(SELECT_COLS);
  if (error) throw error;
  return (
    (data || []).find(
      (r: any) =>
        normalizeVenueText(r.name) === key ||
        (Array.isArray(r.aliases) && r.aliases.some((a: string) => normalizeVenueText(a) === key))
    ) ?? null
  );
}

/**
 * 団体を追加。
 * カレンダー側にすでに同じ団体（正式名か別名が一致）があれば、新しく作らずにその団体を候補に加える。
 * 無ければ外部団体として「地域の団体・施設」に足す（会館は予約しない）。
 */
export async function addOrganizer(
  name: string,
  _shortName?: string,
  displayOrder?: number,
  options?: { aliases?: string[]; useAsOrganizer?: boolean; useAsPublisher?: boolean }
): Promise<Organizer> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続です。');

  const useAsOrganizer = options?.useAsOrganizer ?? true;
  const useAsPublisher = options?.useAsPublisher ?? false;
  const aliases = options?.aliases ?? [];

  const existing = await findByName(name);
  if (existing) {
    const { data, error } = await supabase
      .from(TABLE)
      .update({
        aliases: [...new Set([...(existing.aliases || []), ...aliases])],
        use_as_organizer: existing.use_as_organizer || useAsOrganizer,
        use_as_publisher: existing.use_as_publisher || useAsPublisher,
        display_order: existing.display_order ?? displayOrder ?? null,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select(SELECT_COLS)
      .single();
    if (error) throw error;
    return toOrganizer(data);
  }

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      name,
      group_name: EXTERNAL_ORG_GROUP,
      category: '3',
      is_active: true,
      can_book: false,
      aliases,
      use_as_organizer: useAsOrganizer,
      use_as_publisher: useAsPublisher,
      display_order: displayOrder ?? 100,
    })
    .select(SELECT_COLS)
    .single();

  if (error) throw error;
  return toOrganizer(data);
}

/**
 * 団体を更新（名前・別名・用途・表示順）。
 * 名前を変えるとカレンダー側（予約・団体の絞り込み）の表示名も変わる。
 */
export async function updateOrganizer(
  id: string,
  patch: Partial<Pick<Organizer, 'name' | 'aliases' | 'use_as_organizer' | 'use_as_publisher' | 'display_order'>>
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続です。');
  const { error } = await supabase
    .from(TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/**
 * 団体を主催・発行元の候補から外す。
 * 団体そのものは消さない（カレンダーの予約や予定が団体の番号でつながっているため）。
 * 予定カードの主催の文字もそのまま残る。
 */
export async function deleteOrganizer(id: string): Promise<void> {
  await updateOrganizer(id, { use_as_organizer: false, use_as_publisher: false });
}

/** 主催の候補に出す団体名の一覧（AI用：名前だけの配列）。読めないときは空配列 */
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
  return findOrganizer(organizer, organizers)?.name ?? organizer ?? null;
}

/** 主催の文字列に当たる団体を探す（正式名か別名に、正規化して一致） */
export function findOrganizer(
  organizer: string | null | undefined,
  organizers: Organizer[]
): Organizer | null {
  if (!organizer) return null;
  const key = normalizeVenueText(organizer);
  if (!key) return null;
  for (const o of organizers) {
    if (normalizeVenueText(o.name) === key) return o;
    if (o.aliases.some((a) => normalizeVenueText(a) === key)) return o;
  }
  return null;
}
