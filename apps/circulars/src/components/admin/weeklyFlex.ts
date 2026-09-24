/**
 * 週次配信の LINE メッセージ（テキスト＋Flex カルーセル）を組み立てる
 *
 * 1回の配信 = ① 短いテキスト（見出し＋ひとこと） → ② ⭐一押しカード（1枚） → ③ Flex カルーセル
 *   ② ⭐ 今週の一押し … 見出し帯＋（最大2件を縦に）チラシ画像（正方形・切り出し位置は人が決める）＋タイトル・日時・場所・紹介文＋「詳しく見る」
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
import { type Digest, type LinkKind, md, shortTime, siteUrl, topicLink, audienceFee, digestHeading, hasDetailLink } from './weeklyDigestCore';

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
  /** 一押しごとのチラシ画像（予定ID → https・枠に切り出したもの）。無い予定は画像なし */
  flyerImageUrls: Record<string, string | null>;
  /** 一押しごとの画像枠の形（予定ID → '1:1' | '4:3' | '16:9'）。無ければ 1:1 */
  flyerAspects?: Record<string, '1:1' | '4:3' | '16:9'>;
  /** 一押しごとのリンク先の指定（予定ID → pdf / article / event）。無ければ チラシPDF → 記事 → 予定ページ の順 */
  linkKinds: Record<string, LinkKind>;
}

/** テキスト吹き出しの既定文（画面で編集できる） */
export function buildGreetingText(d: Digest): string {
  const lines = [digestHeading(d)];
  if (d.topics.length > 0) {
    const parts = d.topics.map((t) => `${md(t.event_date!)} の「${t.title}」`);
    lines.push(`⭐ 今週の一押しは ${parts.join(' と ')}です。`);
  }
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
  contents: [text(title, { color: '#ffffff', weight: 'bold', size: 'lg' }), text(sub, { color: '#e8eef8', size: 'sm' })],
});
// 文字サイズは全体に一段階大きめ（高齢の読み手が多い）。Flex の文字は LINE の文字サイズ設定（特大など）に連動せず固定のため、
// 見出し lg / 本文 md / 補足 sm を基準にする。ボタンも md（押しやすく）
const linkButton = (label: string, url: string) => ({ type: 'button', style: 'link', height: 'md', action: uri(label, url) });
const primaryButton = (label: string, url: string, color = SITE_BLUE) => ({
  type: 'button',
  style: 'primary',
  color,
  height: 'md',
  action: uri(label, url),
});

/** 行の右端に置く「詳しく ›」の色（濃いめのグレー。カードの色は見出し帯だけに絞る） */
const DETAIL_GRAY = '#555555';
/** 両カード共通の見出し下の案内 */
const ROW_HINT = '「詳しく ›」をタップすると案内が開きます';

/**
 * 予定1件の「行」。今週の予定・申込受付中で共通。
 *
 *   9/25(金) 13:30〜                詳しく ›
 *   映画上映会「愛の調べ」
 *   自治会館1階会議室
 *
 * 日時（または締切）はタイトルの上の1行に置き、横幅いっぱいを使う。
 * 左に日付の列を作ると、実機（本文幅 260px 前後）で「9/25(金)」の閉じカッコや「〜」が次の行に落ちるため。
 * 右端の「詳しく ›」は幅を固定した枠に入れて、縦方向は中央。押せない行（チラシも記事も無い）は枠だけ空ける。
 */
function eventRow(
  c: PublicEventCard,
  opts: { prefix?: string; whenText: string; whenColor?: string; sub?: Array<{ text: string; color?: string; bold?: boolean }> }
) {
  const linkable = hasDetailLink(c);
  const lines: unknown[] = [
    text(opts.whenText, { size: 'md', color: opts.whenColor ?? BLUE, weight: 'bold' }),
    text(`${opts.prefix ?? ''}${c.title}`, { size: 'md', weight: 'bold' }),
  ];
  for (const s of opts.sub ?? []) lines.push(text(s.text, { size: 'sm', color: s.color ?? GRAY, ...(s.bold ? { weight: 'bold' } : {}) }));
  if (c.event_location) lines.push(text(c.event_location, { size: 'sm', color: GRAY }));
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'sm',
    alignItems: 'center',
    ...(linkable ? { action: uri('詳しく', topicLink(c).url) } : {}),
    contents: [
      { type: 'box', layout: 'vertical', flex: 1, spacing: 'xs', contents: lines },
      // 押せる行だけ「詳しく ›」（本文と同じ大きさの太字・濃いグレー）。矢印単体より大きく、文字で意味が分かる
      {
        type: 'box',
        layout: 'vertical',
        width: '76px',
        flex: 0,
        contents: [{ type: 'text', text: linkable ? '詳しく ›' : ' ', size: 'md', weight: 'bold', color: DETAIL_GRAY, align: 'end' }],
      },
    ],
  };
}

/**
 * 一押しバブル（1枚のカードに最大2件を縦に並べる）
 *
 *   ⭐ 今週の一押し（見出し帯）
 *   ┌ 画像（正方形・切り出し位置は人が決める）
 *   │ タイトル / 日時 / 場所 / 紹介文 / [詳しく見る]
 *   ├──────（2件目があれば区切り線）
 *   └ 画像 / タイトル / … / [詳しく見る]
 *
 * 画像は hero ではなく body の image 部品（複数置けるように）。カルーセルにしないので高さ揃えの空白は出ない。
 */
function topicBubble(d: Digest, opts: FlexBuildOptions) {
  const blocks: unknown[] = [];
  d.topics.forEach((t, i) => {
    const link = topicLink(t, opts.linkKinds[t.id]);
    // ボタンは「詳しく見る」1つ・琥珀色。一押しはチラシとは限らないので言葉は固定
    const mainLabel = '詳しく見る';
    const img = opts.flyerImageUrls[t.id] ?? null;
    const items: unknown[] = [];
    if (i > 0) items.push({ type: 'separator', margin: 'lg' });
    if (img) {
      items.push({
        type: 'image',
        url: img,
        size: 'full',
        // 枠の形は切り出しと同じ（横長の写真は 4:3、チラシは 1:1）
        aspectRatio: opts.flyerAspects?.[t.id] ?? '1:1',
        aspectMode: 'cover',
        backgroundColor: '#f5f5f5',
        margin: i > 0 ? 'lg' : 'none',
        action: uri(mainLabel, link.url),
      });
    }
    items.push(text(t.title, { weight: 'bold', size: 'lg', margin: 'md' }));
    items.push(text(`${md(t.event_date!)}${t.event_time ? ` ${t.event_time}` : ''}`, { size: 'md', color: BLUE, weight: 'bold' }));
    const place = [t.event_location, t.organizer ? `主催: ${t.organizer}` : null].filter(Boolean).join(' / ') + audienceFee(t);
    if (place) items.push(text(`📍 ${place}`, { size: 'sm', color: '#666666' }));
    if (t.description) items.push(text(t.description, { size: 'md', color: '#333333', margin: 'md' }));
    items.push({ ...primaryButton(mainLabel, link.url, AMBER), margin: 'md' });
    blocks.push({ type: 'box', layout: 'vertical', spacing: 'sm', contents: items });
  });

  return {
    type: 'bubble',
    size: 'mega',
    header: header('⭐ 今週の一押し', `${md(d.from)}〜${md(d.to)} のお知らせ`, AMBER),
    body: { type: 'box', layout: 'vertical', spacing: 'none', paddingAll: 'lg', contents: blocks },
  };
}

/** 今週の予定バブル（その週に開催されるものだけ。⏰締切間近は申込受付中カードへ） */
function eventsBubble(d: Digest) {
  const rows: unknown[] = [];
  for (const c of d.events) {
    rows.push(eventRow(c, { whenText: `${md(c.event_date!)}${shortTime(c.event_time)}` }));
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

/** 申込受付中バブル（⏰締切間近＝締切3日以内を先頭に、その後に締切順） */
function applyBubble(d: Digest) {
  const contents: unknown[] = [];
  const rows = [...d.urgent.map((c) => ({ c, urgent: true })), ...d.apply.map((c) => ({ c, urgent: false }))];
  rows.forEach(({ c, urgent }, i) => {
    if (i > 0) contents.push(separator());
    // 今週の予定と同じ行レイアウト（1行目: 締切 / タイトル・開催日・場所 / 右端: 詳しく ›）。
    // 各行がそれぞれのチラシ（申込方法）に飛ぶ。申込が複数・別PDFでも行ごとに正しい先へ
    contents.push(
      eventRow(c, {
        prefix: urgent ? '⏰ ' : '',
        whenText: `${urgent ? '締切間近 ' : '締切 '}${md(c.deadline)}${c.deadlineGuessed ? '頃' : ''}`,
        whenColor: RED,
        sub: [{ text: `${md(c.event_date!)}開催${audienceFee(c)}`, color: '#444444' }],
      })
    );
  });
  return {
    type: 'bubble',
    size: 'mega',
    // 下のボタンは置かない（行き先が1つに決められないため）。代わりに見出しの下で行タップを案内する
    header: header('📝 申込受付中', ROW_HINT, GREEN),
    body: { type: 'box', layout: 'vertical', spacing: 'md', contents },
  };
}

/** レポートバブル（1本ずつ） */
function reportBubble(r: Digest['reports'][number]) {
  const url = `${siteUrl()}/?report=${r.id}`;
  const thumb = (r as { thumbnail_url?: string | null }).thumbnail_url || null;
  const brief = ((r as { brief?: string | null }).brief || (r as { summary?: string | null }).summary || '').trim();
  const body: unknown[] = [text('📰 新しいレポート', { size: 'sm', color: RED, weight: 'bold' }), text(r.title, { weight: 'bold', size: 'lg' })];
  if (brief) body.push(text(brief.slice(0, 80), { size: 'md', color: '#666666' }));
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
  if (d.topics.length === 0) return null;
  const alt = `⭐今週の一押し: ${d.topics.map((t) => `${t.title}（${md(t.event_date!)}）`).join('、')}`.slice(0, 400);
  return { type: 'flex', altText: alt, contents: topicBubble(d, opts) };
}

/** 今週の予定／申込受付中／レポートのカルーセル。出すものが無ければ null */
export function buildWeeklyFlex(d: Digest): LineMessage | null {
  const bubbles: unknown[] = [];
  if (d.events.length > 0) bubbles.push(eventsBubble(d));
  if (d.apply.length > 0 || d.urgent.length > 0) bubbles.push(applyBubble(d));
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
