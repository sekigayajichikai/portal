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
