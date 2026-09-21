/**
 * 週次配信の LINE メッセージ（テキスト＋Flex カルーセル）を組み立てる
 *
 * 1回の配信 = ① 短いテキスト（見出し＋ひとこと） → ② ⭐一押しカード（1枚） → ③ Flex カルーセル
 *   ② ⭐ 今週の一押し … 見出し帯＋チラシ画像（上部を正方形に）＋タイトル・日時・場所・紹介文＋「詳しく見る」
 *      （カルーセルは全カードの高さが揃う仕様なので、背の高い一押しは別の吹き出しにする）
 *   ③ カルーセルの中身（該当が無いカードは出さない）:
 *     1. 📅 今週の予定 … 行ごとにタップで詳細（⏰締切間近があれば先頭に）
 *     2. 📝 申込受付中 … タイトル・開催日・締切・場所。行ごとにタップ
 *     3. 📰 新しいレポート … 1本ずつ（扉写真＋タイトル＋「レポートを読む」）
 *
 * Flex の制約: 画像は https のURL、カルーセルは最大12バブル、altText は400文字以内。
 * 仕様: docs/週次配信.md
 */

import type { LineMessage, PublicEventCard } from '@cc-saas/shared';
import { type Digest, md, shortTime, siteUrl, topicLink, audienceFee, digestHeading, hasDetailLink } from './weeklyDigestCore';

/**
 * 配色は「役割別＝リンク先の色」（2026-09-21 決定）:
 *   今週の予定・一押しのボタン … 回覧板サイトのブルー（押した先がサイト／チラシ）
 *   申込受付中 … グリーン（申込＝行動が必要なもの。締切の赤が埋もれない）
 *   レポート … レポート画面の赤
 */
const RED = '#c0392b';
const GREEN = '#2f6f4e';
const BLUE = '#1d4ed8';
const SITE_BLUE = '#2563eb';
/** 一押しの見出し帯（⭐ の琥珀色。他のカードと役割が違うことが分かる色） */
const AMBER = '#b45309';
const GRAY = '#888888';

export interface FlexBuildOptions {
  /** 一押しのチラシ画像（https・正方形に切り出したもの）。無ければ画像なしの一押しバブルにする */
  flyerImageUrl: string | null;
}

/** テキスト吹き出しの既定文（画面で編集できる） */
export function buildGreetingText(d: Digest): string {
  const lines = [digestHeading(d)];
  if (d.topic) lines.push(`⭐ 今週の一押しは ${md(d.topic.event_date!)} の「${d.topic.title}」です。`);
  lines.push('今週の予定と申込は、下のカードをスワイプしてご覧ください 👇');
  return lines.join('\n');
}

const text = (t: string, extra: Record<string, unknown> = {}) => ({ type: 'text', text: t || ' ', wrap: true, ...extra });
const uri = (label: string, url: string) => ({ type: 'uri', label: label.slice(0, 20), uri: url });
const separator = () => ({ type: 'separator' });
const header = (title: string, sub: string, color: string) => ({
  type: 'box',
  layout: 'vertical',
  backgroundColor: color,
  paddingAll: 'md',
  contents: [text(title, { color: '#ffffff', weight: 'bold', size: 'md' }), text(sub, { color: '#e8eef8', size: 'xs' })],
});
const linkButton = (label: string, url: string) => ({ type: 'button', style: 'link', height: 'sm', action: uri(label, url) });
const primaryButton = (label: string, url: string, color = SITE_BLUE) => ({
  type: 'button',
  style: 'primary',
  color,
  height: 'sm',
  action: uri(label, url),
});

/** 行の右端に置く「詳しく ›」の色（濃いめのグレー。カードの色は見出し帯だけに絞る） */
const DETAIL_GRAY = '#555555';
/** 両カード共通の見出し下の案内 */
const ROW_HINT = '「詳しく ›」をタップすると案内が開きます';

/**
 * 予定1件の「行」（左: 日付や締切 / 中央: タイトル＋補足 / 右端: 「詳しく ›」）。今週の予定・申込受付中で共通。
 * チラシか記事がある予定は行全体がタップでき、無い予定（行事予定表から拾っただけ）は「詳しく ›」を出さずタップなし
 */
function eventRow(
  c: PublicEventCard,
  opts: { prefix?: string; whenText: string; whenColor?: string; sub?: Array<{ text: string; color?: string; bold?: boolean }> }
) {
  const linkable = hasDetailLink(c);
  const middle: unknown[] = [text(`${opts.prefix ?? ''}${c.title}`, { size: 'sm', weight: 'bold' })];
  for (const s of opts.sub ?? []) middle.push(text(s.text, { size: 'xs', color: s.color ?? GRAY, ...(s.bold ? { weight: 'bold' } : {}) }));
  if (c.event_location) middle.push(text(c.event_location, { size: 'xs', color: GRAY }));
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'md',
    alignItems: 'center',
    ...(linkable ? { action: uri('詳しく', topicLink(c).url) } : {}),
    contents: [
      text(opts.whenText, { size: 'xs', color: opts.whenColor ?? BLUE, weight: 'bold', flex: 2 }),
      { type: 'box', layout: 'vertical', flex: 6, contents: middle },
      // 押せる行だけ「詳しく ›」（本文と同じ大きさの太字・濃いグレー）。矢印単体より大きく、文字で意味が分かる
      { type: 'text', text: linkable ? '詳しく ›' : ' ', size: 'sm', weight: 'bold', color: DETAIL_GRAY, flex: 2, align: 'end' },
    ],
  };
}

/** 一押しバブル */
function topicBubble(d: Digest, flyerImageUrl: string | null) {
  const t = d.topic!;
  const link = topicLink(t);
  const body: unknown[] = [
    text(t.title, { weight: 'bold', size: 'md' }),
    text(`${md(t.event_date!)}${t.event_time ? ` ${t.event_time}` : ''}`, { size: 'sm', color: BLUE, weight: 'bold' }),
  ];
  const place = [t.event_location, t.organizer ? `主催: ${t.organizer}` : null].filter(Boolean).join(' / ') + audienceFee(t);
  if (place) body.push(text(`📍 ${place}`, { size: 'xs', color: '#666666' }));
  if (t.description) body.push(text(t.description, { size: 'sm', color: '#333333', margin: 'md' }));

  // ボタンは「詳しく見る」1つ。行き先は チラシPDF → 記事 → 予定ページ の順（topicLink）。
  // 一押しはチラシとは限らないので、言葉はリンク先の種類で変えずに汎用にしておく
  const mainLabel = '詳しく見る';
  // ボタンは見出し帯と同じ琥珀色（カードの色を1つに揃える）
  const footer: unknown[] = [primaryButton(mainLabel, link.url, AMBER)];

  return {
    type: 'bubble',
    size: 'mega',
    // 他のカードと同じく見出し帯を付ける（帯 → チラシ画像 → 本文 → ボタン）
    header: header('⭐ 今週の一押し', `${md(d.from)}〜${md(d.to)} のお知らせ`, AMBER),
    ...(flyerImageUrl
      ? {
          hero: {
            type: 'image',
            url: flyerImageUrl,
            size: 'full',
            // チラシ上部を正方形に切り出した画像（WeeklyDigest 側で作る）。縦長のままだとカードが高くなりすぎる
            aspectRatio: '1:1',
            aspectMode: 'cover',
            backgroundColor: '#f5f5f5',
            action: uri(mainLabel, link.url),
          },
        }
      : {}),
    body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: body },
    footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: footer },
  };
}

/** 今週の予定バブル（⏰締切間近を先頭に） */
function eventsBubble(d: Digest) {
  const rows: unknown[] = [];
  for (const c of d.urgent) {
    rows.push(eventRow(c, { prefix: '⏰ ', whenText: `締切\n${md(c.deadline)}${c.deadlineGuessed ? '頃' : ''}`, whenColor: RED }));
  }
  for (const c of d.events) {
    rows.push(eventRow(c, { whenText: `${md(c.event_date!)}${shortTime(c.event_time).replace(' ', '\n')}` }));
  }
  const contents: unknown[] = [];
  rows.forEach((r, i) => {
    if (i > 0) contents.push(separator());
    contents.push(r);
  });
  return {
    type: 'bubble',
    size: 'mega',
    header: header('📅 今週の予定', `${md(d.from)}〜${md(d.to)}　${ROW_HINT}`, SITE_BLUE),
    body: { type: 'box', layout: 'vertical', spacing: 'md', contents },
    // 行は今週の分。ボタンは来週以降も含めた一覧（回覧板サイトの「今後のイベント」）
    footer: { type: 'box', layout: 'vertical', contents: [linkButton('ほかの予定も見る', `${siteUrl()}/`)] },
  };
}

/** 申込受付中バブル */
function applyBubble(d: Digest) {
  const contents: unknown[] = [];
  d.apply.forEach((c, i) => {
    if (i > 0) contents.push(separator());
    // 今週の予定と同じ行レイアウト（左: 締切 / 中央: タイトル・開催日・場所 / 右端: 詳しく ›）。
    // 各行がそれぞれのチラシ（申込方法）に飛ぶ。申込が複数・別PDFでも行ごとに正しい先へ
    contents.push(
      eventRow(c, {
        whenText: `締切\n${md(c.deadline)}${c.deadlineGuessed ? '頃' : ''}`,
        whenColor: RED,
        sub: [{ text: `${md(c.event_date!)}開催${audienceFee(c)}`, color: '#444444' }],
      })
    );
  });
  return {
    type: 'bubble',
    size: 'mega',
    // 下のボタンは置かない（行き先が1つに決められないため）。代わりに見出しの下で行タップを案内する
    header: header('📝 申込受付中', `締切の近い順　${ROW_HINT}`, GREEN),
    body: { type: 'box', layout: 'vertical', spacing: 'md', contents },
  };
}

/** レポートバブル（1本ずつ） */
function reportBubble(r: Digest['reports'][number]) {
  const url = `${siteUrl()}/?report=${r.id}`;
  const thumb = (r as { thumbnail_url?: string | null }).thumbnail_url || null;
  const brief = ((r as { brief?: string | null }).brief || (r as { summary?: string | null }).summary || '').trim();
  const body: unknown[] = [text('📰 新しいレポート', { size: 'xs', color: RED, weight: 'bold' }), text(r.title, { weight: 'bold', size: 'md' })];
  if (brief) body.push(text(brief.slice(0, 80), { size: 'sm', color: '#666666' }));
  return {
    type: 'bubble',
    size: 'mega',
    ...(thumb && /^https:\/\//.test(thumb)
      ? { hero: { type: 'image', url: thumb, size: 'full', aspectRatio: '16:9', aspectMode: 'cover', action: uri('レポートを読む', url) } }
      : {}),
    body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: body },
    footer: { type: 'box', layout: 'vertical', contents: [primaryButton('レポートを読む', url, RED)] },
  };
}

/**
 * ⭐一押しの Flex（1枚だけのバブル）。
 * カルーセルは全カードの高さが一番高いカードに揃う仕様なので、背の高い一押しは別の吹き出しにして、
 * 残り（今週の予定／申込受付中／レポート）だけをカルーセルにする（高さの近いカード同士で揃う）。
 */
export function buildTopicFlex(d: Digest, opts: FlexBuildOptions): LineMessage | null {
  if (!d.topic) return null;
  const alt = `⭐今週の一押し: ${d.topic.title}（${md(d.topic.event_date!)}）`.slice(0, 400);
  return { type: 'flex', altText: alt, contents: topicBubble(d, opts.flyerImageUrl) };
}

/** 今週の予定／申込受付中／レポートのカルーセル。出すものが無ければ null */
export function buildWeeklyFlex(d: Digest): LineMessage | null {
  const bubbles: unknown[] = [];
  if (d.events.length > 0 || d.urgent.length > 0) bubbles.push(eventsBubble(d));
  if (d.apply.length > 0) bubbles.push(applyBubble(d));
  for (const r of d.reports) bubbles.push(reportBubble(r));
  if (bubbles.length === 0) return null;

  const alt = `${digestHeading(d)} 今週の予定・申込受付中`.slice(0, 400);
  // バブルが1枚だけならカルーセルにせずそのまま
  const contents = bubbles.length === 1 ? bubbles[0] : { type: 'carousel', contents: bubbles.slice(0, 12) };
  return { type: 'flex', altText: alt, contents };
}

/**
 * 1回の配信ぶんのメッセージ配列: テキスト → ⭐一押し（1枚） → カルーセル（今週の予定・申込・レポート）。
 * 無いものは飛ばす（最大3吹き出し。LINE の上限は5）
 */
export function buildWeeklyMessages(d: Digest, greeting: string, opts: FlexBuildOptions): LineMessage[] {
  const msgs: LineMessage[] = [{ type: 'text', text: greeting.trim() || digestHeading(d) }];
  const topic = buildTopicFlex(d, opts);
  if (topic) msgs.push(topic);
  const rest = buildWeeklyFlex(d);
  if (rest) msgs.push(rest);
  return msgs;
}
