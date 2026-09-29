/**
 * 予定の「同じイベントか」判定（イベント抽出の重複判定に使う）
 *
 * 以前は「同じ日付＋題名の先頭8文字が一致」だけだったため、
 * 「歩く会第172回ズーラシア」と「歩く会（ズーラシア）」、「後期安否確認訓練」と「下期 関ケ谷自治会「安否確認 訓練」」のように
 * 号ごとに書き方が違うと別の予定として二重登録されていた（2026-09-25 に 9月号と10月号で発生）。
 * 同じ日付なら、題名が「片方がもう片方を含む」か「2文字ずつの重なり（Dice係数）が 0.5 以上」なら同じ予定とみなす。
 */

/** 題名の正規化: 空白・括弧・記号を除き、ケ→ヶ、全角英数→半角、小文字に */
export function normalizeEventTitle(title: string): string {
  return title
    .replace(/[\s　]/g, '')
    .replace(/[「」『』（）()【】\[\]〈〉《》・･、。,.!！?？:：;；~〜～\-‐–—―]/g, '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/ケ/g, 'ヶ')
    .toLowerCase();
}

/** 2文字ずつの組（bigram）。1文字なら1文字そのもの */
function bigrams(s: string): string[] {
  if (s.length < 2) return s ? [s] : [];
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

/** 題名どうしの似ている度合い（0〜1。Dice係数） */
export function titleSimilarity(a: string, b: string): number {
  const x = bigrams(normalizeEventTitle(a));
  const y = bigrams(normalizeEventTitle(b));
  if (x.length === 0 || y.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const g of x) counts.set(g, (counts.get(g) ?? 0) + 1);
  let common = 0;
  for (const g of y) {
    const n = counts.get(g) ?? 0;
    if (n > 0) {
      common++;
      counts.set(g, n - 1);
    }
  }
  return (2 * common) / (x.length + y.length);
}

/** 同じ予定とみなす類似度のしきい値（短い題名は「ふれあい」のような語尾だけの一致で当たりやすいので厳しめ） */
export const SAME_EVENT_THRESHOLD = 0.5;
export const SAME_EVENT_THRESHOLD_SHORT = 0.7;
/** これ以下の長さ（正規化後）は短い題名として扱う */
const SHORT_TITLE_LEN = 6;
/** これ以上の長さの共通部分があれば同じ予定（例: 「安否確認訓練」） */
const COMMON_RUN_LEN = 5;

/** 2つの文字列の最長共通部分（連続）の長さ */
function longestCommonRun(a: string, b: string): number {
  let best = 0;
  let prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        cur[j] = prev[j - 1] + 1;
        if (cur[j] > best) best = cur[j];
      }
    }
    prev = cur;
  }
  return best;
}

/**
 * 同じ日付の2つの題名が同じ予定を指しているか
 * - 正規化して一致
 * - 片方がもう片方を含む（短い方が3文字以上）
 * - 5文字以上の共通部分が短い方の6割以上を占める（「後期安否確認訓練」と「下期…安否確認訓練」）
 * - Dice係数が 0.5 以上（どちらかが6文字以下の短い題名なら 0.7 以上）
 */
export function isSameEventTitle(a: string, b: string): boolean {
  const na = normalizeEventTitle(a);
  const nb = normalizeEventTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
  if (short.length >= 3 && long.includes(short)) return true;
  // 共通部分が短い方の題名の6割以上を占めるときだけ（「映画上映会」だけ共通で作品名が違う、を除く）
  const run = longestCommonRun(na, nb);
  if (run >= COMMON_RUN_LEN && run / short.length >= 0.6) return true;
  const threshold = short.length <= SHORT_TITLE_LEN ? SAME_EVENT_THRESHOLD_SHORT : SAME_EVENT_THRESHOLD;
  return titleSimilarity(na, nb) >= threshold;
}

/** 日付が同じで題名が同じ予定なら true */
export function isSameEvent(a: { event_date: string | null; title: string }, b: { event_date: string | null; title: string }): boolean {
  if (!a.event_date || !b.event_date || a.event_date !== b.event_date) return false;
  return isSameEventTitle(a.title, b.title);
}

/** event_time の先頭の時刻（"13:30-15:30" → "13:30"）。読み取れなければ null */
export function startTimeOf(time: string | null | undefined): string | null {
  const m = (time ?? '').match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

/** 重複を疑う理由 */
export type DuplicateReason =
  /** 題名が似ている */
  | 'title'
  /** 題名は違うが、同じ日・同じ開始時刻・同じ主催（同じ枠の催しが別名で入っている） */
  | 'slot';

export interface DuplicateHit {
  id: string;
  reason: DuplicateReason;
}

/** 重複を疑う予定の最小の形 */
export type DuplicateCandidate = {
  id: string;
  event_date: string | null;
  title: string;
  event_time?: string | null;
  organizer?: string | null;
};

/**
 * 一覧の中の「同じ予定」の組を見つける（予定タブの重複警告用）。
 *
 * 2つの見方で探す。
 * 1. **題名が似ている**（`isSameEventTitle`）… 号ごとの書き方の違いを拾う
 * 2. **同じ日・同じ開始時刻・同じ主催**… 題名が全く違っても同じ枠の催しのことがある
 *    （2026-09-29: 10/19 13:30 ふれあいの会の「YouTube カフェ」と「歌声喫茶～秋の思い出と懐かしの名曲を歌おう～」。
 *    予定表には枠の名前、記事には当日の催し名が書かれていた）
 *
 * 戻り値: 予定ID → 同じ予定とみなした相手（理由つき）
 */
export function findDuplicateGroups<T extends DuplicateCandidate>(cards: T[]): Map<string, DuplicateHit[]> {
  const out = new Map<string, DuplicateHit[]>();
  const add = (a: string, b: string, reason: DuplicateReason) => {
    out.set(a, [...(out.get(a) ?? []), { id: b, reason }]);
    out.set(b, [...(out.get(b) ?? []), { id: a, reason }]);
  };
  const byDate = new Map<string, T[]>();
  for (const c of cards) {
    if (!c.event_date) continue;
    const list = byDate.get(c.event_date) ?? [];
    list.push(c);
    byDate.set(c.event_date, list);
  }
  for (const list of byDate.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (isSameEventTitle(a.title, b.title)) {
          add(a.id, b.id, 'title');
          continue;
        }
        // 題名が違っても、同じ時刻に同じ団体が開くものは同じ催しのことが多い
        const ta = startTimeOf(a.event_time);
        const tb = startTimeOf(b.event_time);
        const orgA = a.organizer?.trim();
        const orgB = b.organizer?.trim();
        if (ta && tb && ta === tb && orgA && orgB && orgA === orgB) add(a.id, b.id, 'slot');
      }
    }
  }
  return out;
}

/** 重複を統合するときに引き継ぐ項目（残す側が空欄のときだけ、消す側の値で埋める） */
type MergeableCard = {
  event_time: string | null;
  event_location: string | null;
  linked_article_id: string | null;
  organizer?: string | null;
  source_pdf_url?: string | null;
  category?: string | null;
  kind?: string | null;
  weekly_topic?: boolean | null;
  topic_reason?: string | null;
  apply_deadline?: string | null;
  target_audience?: string | null;
  fee?: string | null;
  description?: string | null;
  digest_exclude?: boolean | null;
  hero_crop?: unknown;
  hero_crop_y?: number | null;
};

/**
 * 重複した2件を1件にまとめるとき、残す側の空欄を消す側の値で埋める更新内容（抽出ダイアログの buildFillUpdates と同じ考え方）。
 * 題名・日付など、残す側に値があるものは触らない。埋めるものが無ければ null。
 */
export function buildMergeUpdates<T extends MergeableCard>(keep: T, drop: T): Partial<T> | null {
  const u: Partial<MergeableCard> = {};
  const fillKeys = ['event_time', 'event_location', 'linked_article_id', 'organizer', 'source_pdf_url', 'category', 'kind', 'apply_deadline', 'target_audience', 'fee', 'description'] as const;
  for (const k of fillKeys) {
    if (!keep[k] && drop[k]) (u as any)[k] = drop[k];
  }
  if (!keep.weekly_topic && drop.weekly_topic) {
    u.weekly_topic = true;
    if (!keep.topic_reason && drop.topic_reason) u.topic_reason = drop.topic_reason;
  }
  if (!keep.digest_exclude && drop.digest_exclude) u.digest_exclude = true;
  if (!keep.hero_crop && drop.hero_crop) {
    u.hero_crop = drop.hero_crop;
    u.hero_crop_y = drop.hero_crop_y ?? null;
  }
  return Object.keys(u).length > 0 ? (u as Partial<T>) : null;
}
