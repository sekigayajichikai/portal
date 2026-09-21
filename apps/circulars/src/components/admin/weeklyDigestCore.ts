/**
 * 週次配信（今週のお知らせ）の組み立てロジック（画面から独立した純粋な部分）
 *
 * - buildDigest: 公開中の予定カードとレポートから、配信日を起点に各セクションを選ぶ
 * - renderText: 配信文（プレーンテキスト）
 * - topicLink: 一押し等のリンク先（チラシPDF → 記事 → 予定ページ）
 * - shortenUrl: TinyURL での短縮
 *
 * 画面（WeeklyDigest.tsx）と Flex 組み立て（weeklyFlex.ts）の両方から使う。
 * 仕様: docs/週次配信.md
 */

import type { PublicEventCard, Article } from '@cc-saas/shared';

export const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
/** 件数上限（情報量の抑制） */
export const LIMITS = { topic: 1, reports: 2, events: 6, apply: 4 };
/** 目安の文字数（LINE で読みやすい上限） */
export const CHAR_GUIDE = 600;

export const toDate = (s: string) => new Date(s + 'T00:00:00');
export const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (s: string, n: number) => {
  const d = toDate(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
};
/** "2026-09-27" → "9/27(日)" */
export const md = (s: string) => {
  const d = toDate(s);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEK[d.getDay()]})`;
};
/** "10:00-12:00（10/23も）" → " 10:00〜" のように配信向けに短くする */
export const shortTime = (t?: string | null) => {
  if (!t) return '';
  const m = t.match(/^(\d{1,2}:\d{2})/);
  return m ? ` ${m[1]}〜` : '';
};
/** 「（65歳以上・無料）」の形で対象者・参加費を添える（両方無ければ空文字） */
export const audienceFee = (c: { target_audience?: string | null; fee?: string | null }) => {
  const s = [c.target_audience, c.fee].filter(Boolean).join('・');
  return s ? `（${s}）` : '';
};
export const siteUrl = () =>
  ((import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined) || window.location.origin).replace(/\/+$/, '');

export type LinkKind = 'pdf' | 'article' | 'event';
/**
 * 予定のリンク先（文面の「▶」行・リッチメッセージのタップ先・Flex の行タップに使う）。
 * 住民がすぐ詳細を見られるよう、間に画面を挟まず直接つなぐ:
 *   1. 由来PDF（チラシ）があれば PDF に直接
 *   2. リンク記事があれば記事の個別ページ（/?article=<記事ID>）に直接
 *   3. どちらも無ければ予定の個別ページ（/?event=<予定ID>）
 */
export const topicLink = (c: PublicEventCard): { url: string; kind: LinkKind; label: string } => {
  if (c.source_pdf_url) return { url: c.source_pdf_url, kind: 'pdf', label: 'チラシ（PDF）' };
  if (c.linked_article_id) return { url: `${siteUrl()}/?article=${c.linked_article_id}`, kind: 'article', label: '記事' };
  return { url: `${siteUrl()}/?event=${c.id}`, kind: 'event', label: '予定ページ' };
};
/**
 * 「押すと詳しい情報がある」予定か（チラシPDF か リンク記事がある）。
 * 行事予定表から拾っただけの予定（合同会議など）は false で、カードの行をタップなしにする。
 */
export const hasDetailLink = (c: PublicEventCard) => !!c.source_pdf_url || !!c.linked_article_id;

/** 一押しの画像に使うPDF（由来PDFが無ければ号の先頭PDFで代用） */
export const topicPdf = (c: PublicEventCard | null): { url: string; fallback: boolean } | null => {
  if (!c) return null;
  if (c.source_pdf_url) return { url: c.source_pdf_url, fallback: false };
  if (c.newsletter_pdf_url) return { url: c.newsletter_pdf_url, fallback: true };
  return null;
};

/**
 * 短縮URL（TinyURL）。チラシPDFの直リンクは Supabase Storage のURLで130文字前後になり
 * 文面が長くなるので、配信文では短縮したものに置き換える。キー不要・ブラウザから直接呼べる（CORS対応）。
 * 失敗したときは元のURLをそのまま使う。同じURLは再度問い合わせない。
 */
const shortUrlCache = new Map<string, string>();
export async function shortenUrl(url: string): Promise<string> {
  const cached = shortUrlCache.get(url);
  if (cached) return cached;
  // localhost 等は短縮サービス側で弾かれるので、そのまま
  if (/^https?:\/\/(localhost|127\.|192\.168\.)/.test(url)) return url;
  try {
    const res = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`);
    const text = (await res.text()).trim();
    if (res.ok && /^https:\/\/tinyurl\.com\/\S+$/.test(text)) {
      shortUrlCache.set(url, text);
      return text;
    }
  } catch (e) {
    console.warn('短縮URLの取得に失敗:', e);
  }
  return url;
}

/** 申込が必要な予定（締切付き） */
export type ApplyItem = PublicEventCard & { deadline: string; deadlineGuessed: boolean };

export interface Digest {
  from: string;
  to: string;
  topic: PublicEventCard | null;
  reports: Article[];
  events: PublicEventCard[];
  apply: ApplyItem[];
  urgent: ApplyItem[];
}

/**
 * 配信日を起点に、各セクションの候補を選ぶ
 *
 *   ⭐ 今週の一押し … 1件（⭐配信候補のうち直近のもの）
 *   📰 新しいレポート … 最大2件（直近14日に公開されたレポート）
 *   📅 今週の予定 … 最大6件（open / recurring / 種別なし。配信日から7日間）
 *   📝 申込受付中 … 最大4件（reserve。締切が14日以内。締切不明は開催7日前を仮締切）
 *   ⏰ 締切間近 … 締切が3日以内のもの（申込受付中から抜き出して先頭に）
 */
export function buildDigest(cards: PublicEventCard[], reports: Article[], baseDate: string): Digest {
  const from = baseDate;
  // 「配信日から7日間」= 配信日を含めて7日（月曜配信なら日曜まで）。+7 にすると翌週の月曜まで8日間になるので +6
  const to = addDays(baseDate, 6);
  const applyUntil = addDays(baseDate, 14);
  const urgentUntil = addDays(baseDate, 3);

  // 「週次配信に載せない」（役員向け会議など）は最初から候補に入れない。カレンダーには載る
  const future = cards.filter((c) => c.event_date && c.event_date >= from && !c.digest_exclude);
  // 日付順、同じ日は開始時刻順（時刻なしは末尾）
  const byDate = (a: PublicEventCard, b: PublicEventCard) => {
    if (a.event_date !== b.event_date) return a.event_date! < b.event_date! ? -1 : 1;
    const ta = a.event_time?.match(/^\d{1,2}:\d{2}/)?.[0] ?? '99:99';
    const tb = b.event_time?.match(/^\d{1,2}:\d{2}/)?.[0] ?? '99:99';
    return ta.padStart(5, '0') < tb.padStart(5, '0') ? -1 : ta === tb ? 0 : 1;
  };

  // 一押し: ⭐配信候補のうち、開催が直近（2週間以内優先）のもの
  const topicPool = future.filter((c) => c.weekly_topic).sort(byDate);
  const topic = topicPool.find((c) => c.event_date! <= applyUntil) ?? topicPool[0] ?? null;

  // 「申込が必要」= 要予約、または締切が入っているもの（定員制の連続講座など）
  const needsApply = (c: PublicEventCard) => c.category === 'reserve' || !!c.apply_deadline;

  // 今週の予定: 申込不要のもので、配信日から7日間に開催
  const events = future
    .filter((c) => !needsApply(c) && c.event_date! <= to && c.id !== topic?.id)
    .sort(byDate)
    .slice(0, LIMITS.events);

  // 申込受付中: 申込が必要で、締切（不明なら開催7日前）が14日以内
  const apply = future
    .filter(needsApply)
    .map((c) => {
      const deadlineGuessed = !c.apply_deadline;
      const deadline = c.apply_deadline || addDays(c.event_date!, -7);
      return { ...c, deadline, deadlineGuessed };
    })
    .filter((c) => c.deadline >= from && c.deadline <= applyUntil)
    .sort((a, b) => (a.deadline < b.deadline ? -1 : 1));
  const urgent = apply.filter((c) => c.deadline <= urgentUntil);
  const applyRest = apply.filter((c) => c.deadline > urgentUntil).slice(0, LIMITS.apply);

  // 新しいレポート: 直近14日に公開（updated_at 基準）
  const since = addDays(baseDate, -14);
  const recentReports = reports
    .filter((r) => (r.updated_at || r.created_at || '').slice(0, 10) >= since)
    .slice(0, LIMITS.reports);

  return { from, to, topic, reports: recentReports, events, apply: applyRest, urgent };
}

/** 見出し「【関ヶ谷自治会 今週のお知らせ】9/21(月)〜9/27(日)」 */
export const digestHeading = (d: Digest) => `【関ヶ谷自治会 今週のお知らせ】${md(d.from)}〜${md(d.to)}`;

/** 「（西金沢地域ケアプラザ 多目的ホール）」の形の場所 */
export const loc = (c: PublicEventCard) => (c.event_location ? `（${c.event_location}）` : '');

/** 配信文（プレーンテキスト）を組み立てる。shortUrls は 元URL→短縮URL の対応（取得済みのものだけ） */
export function renderText(d: Digest, shortUrls: Record<string, string> = {}): string {
  const lines: string[] = [];
  lines.push(digestHeading(d));

  if (d.topic) {
    const t = d.topic;
    lines.push('', '⭐ 今週の一押し');
    lines.push(`${md(t.event_date!)}${shortTime(t.event_time)} ${t.title}`);
    // 紹介文（1〜2文）。タイトルの直下に置く
    if (t.description) lines.push(t.description);
    const sub = [t.event_location, t.organizer ? `主催: ${t.organizer}` : null].filter(Boolean).join(' / ') + audienceFee(t);
    if (sub) lines.push(sub);
    // チラシPDF → 記事 → 予定ページ の順で、いちばん直接的なリンクを付ける
    const link = topicLink(t);
    lines.push(
      `▶ ${link.kind === 'pdf' ? 'チラシを見る' : link.kind === 'article' ? '記事を読む' : '詳しく'}: ${shortUrls[link.url] ?? link.url}`
    );
  }

  if (d.reports.length > 0) {
    lines.push('', '📰 新しいレポート');
    for (const r of d.reports) {
      lines.push(`・${r.title}`);
      lines.push(`  ${siteUrl()}/?report=${r.id}`);
    }
  }

  if (d.urgent.length > 0) {
    lines.push('', '⏰ 締切間近');
    for (const c of d.urgent) {
      lines.push(`・${c.title}${loc(c)} 締切${md(c.deadline)}${c.deadlineGuessed ? '頃' : ''}${audienceFee(c)}`);
    }
  }

  if (d.events.length > 0) {
    lines.push('', '📅 今週の予定');
    for (const c of d.events) {
      lines.push(`・${md(c.event_date!)}${shortTime(c.event_time)} ${c.title}${loc(c)}`);
    }
  }

  if (d.apply.length > 0) {
    lines.push('', '📝 申込受付中');
    for (const c of d.apply) {
      lines.push(
        `・${c.title}${loc(c)} ${md(c.event_date!)}開催 締切${md(c.deadline)}${c.deadlineGuessed ? '頃' : ''}${audienceFee(c)}`
      );
    }
  }

  lines.push('', '▶ 詳しくは回覧板サイトへ', `${siteUrl()}/`);
  return lines.join('\n');
}
