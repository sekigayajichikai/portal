/**
 * 週次配信の LINE メッセージ（テキスト＋Flex カルーセル）を組み立てる
 *
 * 1回の配信 = ① 短いテキスト（見出し＋ひとこと） → ② Flex カルーセル（案A）
 *   カルーセルの中身（該当が無いセクションは出さない）:
 *     1. ⭐ 今週の一押し … チラシ画像（あれば）＋タイトル・日時・場所・紹介文＋「チラシを見る」「予定の詳細」
 *     2. 📅 今週の予定 … 行ごとにタップで詳細（⏰締切間近があれば先頭に）
 *     3. 📝 申込受付中 … タイトル・開催日・締切・場所。行ごとにタップ
 *     4. 📰 新しいレポート … 1本ずつ（扉写真＋タイトル＋「レポートを読む」）
 *
 * Flex の制約: 画像は https のURL、カルーセルは最大12バブル、altText は400文字以内。
 * 仕様: docs/週次配信.md
 */

import type { LineMessage, PublicEventCard } from '@cc-saas/shared';
import { type Digest, md, shortTime, siteUrl, topicLink, audienceFee, digestHeading } from './weeklyDigestCore';

const RED = '#c0392b';
const GREEN = '#2f6f4e';
const BLUE = '#1d4ed8';
const GRAY = '#888888';
const LINE_GREEN = '#06C755';

export interface FlexBuildOptions {
  /** 一押しのチラシ画像（https）。無ければ画像なしの一押しバブルにする */
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
  contents: [text(title, { color: '#ffffff', weight: 'bold', size: 'md' }), text(sub, { color: '#f4e3e0', size: 'xs' })],
});
const linkButton = (label: string, url: string) => ({ type: 'button', style: 'link', height: 'sm', action: uri(label, url) });
const primaryButton = (label: string, url: string, color = LINE_GREEN) => ({
  type: 'button',
  style: 'primary',
  color,
  height: 'sm',
  action: uri(label, url),
});

/** 予定1件の「行」（日付 / タイトル＋場所 / ›）。行全体がタップできる */
function eventRow(c: PublicEventCard, opts: { prefix?: string; whenText: string; whenColor?: string }) {
  const link = topicLink(c);
  const right: unknown[] = [text(`${opts.prefix ?? ''}${c.title}`, { size: 'sm', weight: 'bold' })];
  if (c.event_location) right.push(text(c.event_location, { size: 'xs', color: GRAY }));
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'md',
    action: uri('詳しく', link.url),
    contents: [
      text(opts.whenText, { size: 'xs', color: opts.whenColor ?? BLUE, weight: 'bold', flex: 2 }),
      { type: 'box', layout: 'vertical', flex: 7, contents: right },
      { type: 'text', text: '›', size: 'lg', color: '#aaaaaa', flex: 1, align: 'end' },
    ],
  };
}

/** 一押しバブル */
function topicBubble(d: Digest, flyerImageUrl: string | null) {
  const t = d.topic!;
  const link = topicLink(t);
  const body: unknown[] = [
    text('⭐ 今週の一押し', { size: 'xs', color: RED, weight: 'bold' }),
    text(t.title, { weight: 'bold', size: 'md' }),
    text(`${md(t.event_date!)}${t.event_time ? ` ${t.event_time}` : ''}`, { size: 'sm', color: BLUE, weight: 'bold' }),
  ];
  const place = [t.event_location, t.organizer ? `主催: ${t.organizer}` : null].filter(Boolean).join(' / ') + audienceFee(t);
  if (place) body.push(text(`📍 ${place}`, { size: 'xs', color: '#666666' }));
  if (t.description) body.push(text(t.description, { size: 'sm', color: '#333333', margin: 'md' }));

  const footer: unknown[] = [];
  const mainLabel = link.kind === 'pdf' ? 'チラシを見る' : link.kind === 'article' ? '記事を読む' : '詳しく見る';
  footer.push(primaryButton(mainLabel, link.url));
  if (link.kind !== 'event') footer.push(linkButton('予定の詳細', `${siteUrl()}/?event=${t.id}`));

  return {
    type: 'bubble',
    size: 'mega',
    ...(flyerImageUrl
      ? {
          hero: {
            type: 'image',
            url: flyerImageUrl,
            size: 'full',
            aspectRatio: '210:297', // A4 縦のチラシをそのまま
            aspectMode: 'fit',
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
    header: header('📅 今週の予定', `${md(d.from)}〜${md(d.to)}`, RED),
    body: { type: 'box', layout: 'vertical', spacing: 'md', contents },
    footer: { type: 'box', layout: 'vertical', contents: [linkButton('回覧板サイトで全部見る', `${siteUrl()}/`)] },
  };
}

/** 申込受付中バブル */
function applyBubble(d: Digest) {
  const contents: unknown[] = [];
  d.apply.forEach((c, i) => {
    if (i > 0) contents.push(separator());
    const link = topicLink(c);
    const items: unknown[] = [
      text(c.title, { size: 'sm', weight: 'bold' }),
      text(`${md(c.event_date!)}開催 ・ 締切 ${md(c.deadline)}${c.deadlineGuessed ? '頃' : ''}${audienceFee(c)}`, {
        size: 'xs',
        color: RED,
        weight: 'bold',
      }),
    ];
    if (c.event_location) items.push(text(c.event_location, { size: 'xs', color: GRAY }));
    contents.push({ type: 'box', layout: 'vertical', spacing: 'xs', action: uri('詳しく', link.url), contents: items });
  });
  return {
    type: 'bubble',
    size: 'mega',
    header: header('📝 申込受付中', '締切の近い順', GREEN),
    body: { type: 'box', layout: 'vertical', spacing: 'md', contents },
    footer: { type: 'box', layout: 'vertical', contents: [linkButton('申し込み方法を見る', `${siteUrl()}/`)] },
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

/** Flex メッセージ（カルーセル）。出すものが無ければ null */
export function buildWeeklyFlex(d: Digest, opts: FlexBuildOptions): LineMessage | null {
  const bubbles: unknown[] = [];
  if (d.topic) bubbles.push(topicBubble(d, opts.flyerImageUrl));
  if (d.events.length > 0 || d.urgent.length > 0) bubbles.push(eventsBubble(d));
  if (d.apply.length > 0) bubbles.push(applyBubble(d));
  for (const r of d.reports) bubbles.push(reportBubble(r));
  if (bubbles.length === 0) return null;

  const alt = [digestHeading(d), d.topic ? `⭐一押し: ${d.topic.title}（${md(d.topic.event_date!)}）` : null]
    .filter(Boolean)
    .join(' ')
    .slice(0, 400);
  return { type: 'flex', altText: alt, contents: { type: 'carousel', contents: bubbles.slice(0, 12) } };
}

/** 1回の配信ぶんのメッセージ配列（テキスト → Flex）。Flex が無ければテキストだけ */
export function buildWeeklyMessages(d: Digest, greeting: string, opts: FlexBuildOptions): LineMessage[] {
  const msgs: LineMessage[] = [{ type: 'text', text: greeting.trim() || digestHeading(d) }];
  const flex = buildWeeklyFlex(d, opts);
  if (flex) msgs.push(flex);
  return msgs;
}
