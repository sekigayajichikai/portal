/**
 * 週次配信（今週のお知らせ）の下書きを自動で組み立てる画面
 *
 * 公開中の予定カード（event_cards）と公開中のレポート記事から、
 * 公式LINEで毎週流す文面と画像を、AIを使わず決まったルールで生成する。
 * 生成した文面は編集してからコピーし、LINE公式アカウントに貼って配信する（送信自体は手動）。
 *
 * 構成と件数上限（情報量が増えすぎないように固定）:
 *   ⭐ 今週の一押し … 1件（⭐配信候補のうち直近のもの。紹介文と、チラシPDF／記事／予定ページへの直リンクを添える）
 *   📰 新しいレポート … 最大2件（直近14日に公開されたレポート）
 *   📅 今週の予定 … 最大6件（open / recurring / 種別なし。配信日から7日間）
 *   📝 申込受付中 … 最大4件（reserve。締切が14日以内。締切不明は開催7日前を仮締切）
 *   ⏰ 締切間近 … 締切が3日以内のもの（申込受付中から抜き出して先頭に）
 *
 * 配信のタイミングは「開催日」ではなく「行動が必要な日（申込締切）」で決める。
 * 要予約のイベントは開催の2〜3週間前に「申込受付中」で初めて登場し、締切3日前に「締切間近」で再掲される。
 *
 * 配信画像（1040×1040・リッチメッセージ用）は4種類から選ぶ:
 *   flyer  … 一押しの出典PDF（チラシ）1ページ目を画像にして、日付とタイトルを添える（既定）
 *   topic  … 一押しだけを文字で大きく（チラシが無いときの自動フォールバック）
 *   hybrid … 上にチラシ＋紹介文、下に今週の予定・申込を数行
 *   list   … 従来の文字一覧
 *
 * 仕様: docs/週次配信.md
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  getPublishedEventCards,
  getNewsletters,
  getArticlesByNewsletterId,
  updateEventCard,
  sendLineMessages,
  uploadWeeklyImage,
  recordWeeklyDigestSend,
  getWeeklyDigestSends,
  type PublicEventCard,
  type Article,
  type LineMessage,
  type LineSendMode,
  type WeeklyDigestSend,
} from '@cc-saas/shared';
import { Copy, Check, Download, RefreshCw, Loader2, Send, ExternalLink, MessageCircle, ShieldCheck, Users } from 'lucide-react';
import { showError, showToast, appConfirm } from '@/components/ui/feedback';
import { PDFJS_DOC_OPTIONS } from '@/lib/pdfConfig';

import {
  type Digest,
  LIMITS,
  CHAR_GUIDE,
  ymd,
  md,
  shortTime,
  audienceFee,
  topicLink,
  topicPdf,
  shortenUrl,
  buildDigest,
  renderText,
} from './weeklyDigestCore';
import { buildGreetingText, buildWeeklyMessages } from './weeklyFlex';
import { FlexPreview } from './FlexPreview';

const REPORT_NEWSLETTER_TITLE = '関ヶ谷レポート';
/** canvas のフォント */
const FONT = '"Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif';

/** 配信画像の種類 */
type ImageMode = 'flyer' | 'topic' | 'hybrid' | 'list';
const IMAGE_MODES: Array<{ key: ImageMode; label: string; hint: string }> = [
  { key: 'flyer', label: '一押しチラシ', hint: '一押しの出典PDF（チラシ）をそのまま画像に。チラシが無ければ「一押しのみ」で描きます' },
  { key: 'topic', label: '一押しのみ（文字）', hint: '一押し1件だけを大きな文字で。写真なし' },
  { key: 'hybrid', label: 'チラシ＋今週の予定', hint: '上にチラシと紹介文、下に今週の予定・申込を数行' },
  { key: 'list', label: '文字一覧（従来）', hint: '一押し＋今週の予定・申込を文字だけで一覧' },
];

// ---------------------------------------------------------------------------
// 配信画像
// ---------------------------------------------------------------------------

/** PDFの1ページ目を canvas に描いたもの（URLごとにキャッシュ） */
const flyerCache = new Map<string, HTMLCanvasElement>();

/** PDF 1ページ目を最大 1400px の canvas にレンダリングする（PdfThumbnail と同じ pdf.js 設定） */
async function renderPdfFirstPage(url: string): Promise<HTMLCanvasElement> {
  const cached = flyerCache.get(url);
  if (cached) return cached;
  const pdfjsLib = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const doc = await pdfjsLib.getDocument({ data: await res.arrayBuffer(), ...PDFJS_DOC_OPTIONS }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = 1400 / Math.max(base.width, base.height);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context を取得できません');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
    flyerCache.set(url, canvas);
    return canvas;
  } finally {
    doc.destroy();
  }
}

/** 日本語向けの折り返し（1文字ずつ幅を測る）。maxLines を超えた分は末尾を「…」にする */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let cur = '';
  const isWordChar = (c: string) => /[A-Za-z0-9]/.test(c);
  for (const ch of text.replace(/\s*\n\s*/g, ' ')) {
    if (ctx.measureText(cur + ch).width > maxWidth && cur) {
      // 英数字の単語（LINE / YouTube 等）は途中で切らず、単語ごと次の行へ送る
      let head = cur;
      let carry = '';
      if (isWordChar(ch)) {
        const m = cur.match(/[A-Za-z0-9]+$/);
        if (m && m[0].length < cur.length) {
          head = cur.slice(0, -m[0].length);
          carry = m[0];
        }
      }
      lines.push(head.trimEnd());
      cur = carry + ch;
      if (lines.length === maxLines) break;
    } else {
      cur += ch;
    }
  }
  if (lines.length < maxLines) {
    if (cur) lines.push(cur);
  } else if (cur) {
    // 収まらなかった: 最終行の末尾を省略記号に
    let last = lines[maxLines - 1];
    while (ctx.measureText(last + '…').width > maxWidth && last.length > 1) last = last.slice(0, -1);
    lines[maxLines - 1] = last + '…';
  }
  return lines;
}

/** チラシ画像を枠内に「収まるように」白いカード＋影付きで描く */
function drawFlyer(ctx: CanvasRenderingContext2D, flyer: HTMLCanvasElement, x: number, y: number, w: number, h: number) {
  const scale = Math.min(w / flyer.width, h / flyer.height);
  const dw = Math.round(flyer.width * scale);
  const dh = Math.round(flyer.height * scale);
  const dx = Math.round(x + (w - dw) / 2);
  const dy = Math.round(y + (h - dh) / 2);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.22)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = '#fff';
  ctx.fillRect(dx, dy, dw, dh);
  ctx.restore();
  ctx.drawImage(flyer, dx, dy, dw, dh);
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 2;
  ctx.strokeRect(dx + 1, dy + 1, dw - 2, dh - 2);
}

/**
 * 配信用の画像（1040×1040）を canvas で描く。
 * flyer / hybrid でチラシ画像が無いときは topic（一押しのみ）にフォールバックする。
 */
function drawImage(canvas: HTMLCanvasElement, d: Digest, mode: ImageMode, flyer: HTMLCanvasElement | null) {
  const W = 1040;
  const H = 1040;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#faf7f2';
  ctx.fillRect(0, 0, W, H);

  const font = (size: number, bold = false) => {
    ctx.font = `${bold ? 'bold ' : ''}${size}px ${FONT}`;
  };
  const footer = () => {
    ctx.fillStyle = '#8a8578';
    font(28);
    ctx.textAlign = 'left';
    ctx.fillText('詳しくは回覧板サイト（公式LINEのメニューから）', 60, H - 44);
  };
  /** 赤い見出し帯（従来版・一押しのみ版） */
  const bigHeader = () => {
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(0, 0, W, 150);
    ctx.fillStyle = '#fff';
    font(56, true);
    ctx.fillText('関ヶ谷自治会 今週のお知らせ', 60, 95);
    font(32);
    ctx.fillText(`${md(d.from)}〜${md(d.to)}`, 60, 138);
  };
  /** 細い見出し帯（チラシ版・ハイブリッド版）。左に「⭐ 今週の一押し」、右に期間 */
  const slimHeader = () => {
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(0, 0, W, 120);
    ctx.fillStyle = '#fff';
    font(48, true);
    ctx.textAlign = 'left';
    ctx.fillText('⭐ 今週の一押し', 60, 80);
    // 右側は2段（媒体名／期間）で小さく
    ctx.textAlign = 'right';
    font(26);
    ctx.fillText('関ヶ谷自治会 今週のお知らせ', W - 60, 52);
    ctx.fillText(`${md(d.from)}〜${md(d.to)}`, W - 60, 92);
    ctx.textAlign = 'left';
  };
  /** 今週の予定・申込の行（画像用） */
  const rows: string[] = [];
  for (const c of d.urgent) rows.push(`⏰ ${c.title} 締切${md(c.deadline)}`);
  for (const c of d.events) rows.push(`${md(c.event_date!)} ${c.title}`);
  for (const c of d.apply) rows.push(`📝 ${c.title} 締切${md(c.deadline)}`);

  // フォールバック: チラシが必要なモードでチラシが無い → 一押しのみ。一押し自体が無い → 従来の一覧
  let effective: ImageMode = mode;
  if ((mode === 'flyer' || mode === 'hybrid') && !flyer) effective = 'topic';
  if ((effective === 'topic' || effective === 'flyer' || effective === 'hybrid') && !d.topic) effective = 'list';

  // ---- 従来の文字一覧 ----
  if (effective === 'list') {
    bigHeader();
    let y = 230;
    const line = (text: string, opts: { bold?: boolean; color?: string; size?: number } = {}) => {
      ctx.fillStyle = opts.color ?? '#2d2a26';
      font(opts.size ?? 36, opts.bold);
      let t = text;
      while (ctx.measureText(t).width > W - 120 && t.length > 4) t = t.slice(0, -2) + '…';
      ctx.fillText(t, 60, y);
      y += (opts.size ?? 36) + 22;
    };
    if (d.topic) {
      line('⭐ 今週の一押し', { bold: true, color: '#a93226', size: 40 });
      line(`${md(d.topic.event_date!)} ${d.topic.title}`, { bold: true, size: 44 });
      const topicSub = [d.topic.event_location, audienceFee(d.topic)].filter(Boolean).join(' ');
      if (topicSub) line(topicSub, { color: '#6b665c', size: 32 });
      y += 16;
    }
    if (rows.length > 0) {
      line('📅 今週の予定・申込', { bold: true, color: '#a93226', size: 40 });
      for (const r of rows.slice(0, 8)) {
        if (y > H - 120) break;
        line(r);
      }
    }
    footer();
    return;
  }

  const t = d.topic!;
  const when = `${md(t.event_date!)}${shortTime(t.event_time)}`;
  const place = [t.event_location, t.organizer ? `主催: ${t.organizer}` : null].filter(Boolean).join(' / ');
  const meta = [t.target_audience, t.fee].filter(Boolean).join('・');

  // ---- 一押しのみ（文字） ----
  if (effective === 'topic') {
    bigHeader();
    let y = 250;
    ctx.fillStyle = '#a93226';
    font(40, true);
    ctx.fillText('⭐ 今週の一押し', 60, y);
    y += 80;
    ctx.fillStyle = '#1d4ed8';
    font(52, true);
    ctx.fillText(when, 60, y);
    y += 90;
    ctx.fillStyle = '#2d2a26';
    font(64, true);
    for (const l of wrapText(ctx, t.title, W - 120, 2)) {
      ctx.fillText(l, 60, y);
      y += 82;
    }
    y += 6;
    ctx.fillStyle = '#6b665c';
    font(34);
    if (place) {
      for (const l of wrapText(ctx, `📍 ${place}`, W - 120, 2)) {
        ctx.fillText(l, 60, y);
        y += 48;
      }
      y += 4;
    }
    if (meta) {
      ctx.fillText(meta, 60, y);
      y += 52;
    }
    if (t.description) {
      y += 18;
      font(38);
      const lines = wrapText(ctx, t.description, W - 150, 3);
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(60, y - 40, 6, lines.length * 58 - 8);
      ctx.fillStyle = '#2d2a26';
      for (const l of lines) {
        ctx.fillText(l, 90, y);
        y += 58;
      }
    }
    const others = rows.length;
    if (others > 0) {
      ctx.fillStyle = '#8a8578';
      font(30);
      ctx.fillText(`ほかにも今週の予定・申込が ${others} 件。文面をご覧ください`, 60, H - 110);
    }
    footer();
    return;
  }

  // ---- 一押しチラシ ----
  if (effective === 'flyer') {
    slimHeader();
    // 下の文字エリア: 日時1行＋タイトル最大2行＋場所1行。タイトルが1行で収まれば場所を詰める
    font(44, true);
    const titleLines = wrapText(ctx, t.title, W - 120, 2);
    const bottomH = 60 + 40 + titleLines.length * 54 + 44;
    drawFlyer(ctx, flyer!, 60, 150, W - 120, H - 150 - bottomH - 20);
    let y = H - bottomH + 30;
    ctx.fillStyle = '#1d4ed8';
    font(36, true);
    ctx.fillText(when, 60, y);
    y += 52;
    ctx.fillStyle = '#2d2a26';
    font(44, true);
    for (const l of titleLines) {
      ctx.fillText(l, 60, y);
      y += 54;
    }
    ctx.fillStyle = '#6b665c';
    font(28);
    const sub = [place ? `📍 ${place}` : null, meta || null].filter(Boolean).join('　');
    if (sub) {
      const [l] = wrapText(ctx, sub, W - 120, 1);
      ctx.fillText(l, 60, y);
    }
    ctx.fillStyle = '#8a8578';
    font(26);
    ctx.textAlign = 'right';
    ctx.fillText('タップで詳しく', W - 60, H - 30);
    ctx.textAlign = 'left';
    return;
  }

  // ---- チラシ＋今週の予定 ----
  slimHeader();
  // 左: チラシ
  drawFlyer(ctx, flyer!, 60, 150, 430, 520);
  // 右: 一押しの文字
  const rx = 530;
  const rw = W - rx - 60;
  let y = 200;
  ctx.fillStyle = '#1d4ed8';
  font(40, true);
  ctx.fillText(when, rx, y);
  y += 66;
  ctx.fillStyle = '#2d2a26';
  font(44, true);
  for (const l of wrapText(ctx, t.title, rw, 2)) {
    ctx.fillText(l, rx, y);
    y += 58;
  }
  y += 4;
  ctx.fillStyle = '#6b665c';
  font(28);
  if (place) {
    for (const l of wrapText(ctx, `📍 ${place}`, rw, 2)) {
      ctx.fillText(l, rx, y);
      y += 40;
    }
  }
  if (meta) {
    ctx.fillText(meta, rx, y);
    y += 40;
  }
  if (t.description) {
    y += 14;
    ctx.fillStyle = '#2d2a26';
    font(30);
    for (const l of wrapText(ctx, t.description, rw, 4)) {
      if (y > 660) break;
      ctx.fillText(l, rx, y);
      y += 44;
    }
  }
  // 下: 今週の予定・申込（最大4行。残りは右下に件数だけ）
  let ly = 740;
  if (rows.length > 0) {
    ctx.fillStyle = '#a93226';
    font(34, true);
    ctx.fillText('📅 今週の予定・申込', 60, ly);
    ly += 50;
    ctx.fillStyle = '#2d2a26';
    font(30);
    const max = 4;
    for (const r of rows.slice(0, max)) {
      const [l] = wrapText(ctx, r, W - 120, 1);
      ctx.fillText(l, 60, ly);
      ly += 44;
    }
    if (rows.length > max) {
      // 収まらない分はフッターの文言に含めて1行にまとめる（重なり防止）
      ctx.fillStyle = '#8a8578';
      font(28);
      ctx.fillText(`ほか ${rows.length - max} 件と詳しい内容は回覧板サイトへ（公式LINEのメニューから）`, 60, H - 44);
      return;
    }
  }
  footer();
}

// ---------------------------------------------------------------------------
// 画面
// ---------------------------------------------------------------------------

export const WeeklyDigest: React.FC = () => {
  const [baseDate, setBaseDate] = useState<string>(ymd(new Date()));
  const [cards, setCards] = useState<PublicEventCard[]>([]);
  const [reports, setReports] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);
  const [imageMode, setImageMode] = useState<ImageMode>('flyer');
  const [flyer, setFlyer] = useState<HTMLCanvasElement | null>(null);
  const [flyerState, setFlyerState] = useState<'idle' | 'loading' | 'error'>('idle');
  /** ⭐一押しの紹介文（この画面でその場で編集・保存する） */
  const [descDraft, setDescDraft] = useState('');
  const [savingDesc, setSavingDesc] = useState(false);
  /** 元URL→短縮URL（取得できたものだけ入る） */
  const [shortUrls, setShortUrls] = useState<Record<string, string>>({});
  /** LINE 送信（Flex）: テキスト吹き出しの文、送信中のモード、直近の結果、履歴 */
  const [greeting, setGreeting] = useState('');
  const [sending, setSending] = useState<LineSendMode | null>(null);
  const [sendNote, setSendNote] = useState<string | null>(null);
  const [history, setHistory] = useState<WeeklyDigestSend[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [c, ns] = await Promise.all([getPublishedEventCards(), getNewsletters('published')]);
      setCards(c);
      const frame = ns.find((n) => n.title === REPORT_NEWSLETTER_TITLE);
      if (frame) {
        const arts = await getArticlesByNewsletterId(frame.id);
        setReports(
          arts
            .filter((a) => a.visibility === 'public' || a.visibility === 'members-only')
            .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
        );
      } else {
        setReports([]);
      }
    } catch (e) {
      console.error('週次配信の読み込みエラー:', e);
      showError('予定データを読み込めませんでした。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const digest = useMemo(() => buildDigest(cards, reports, baseDate), [cards, reports, baseDate]);
  const pdf = useMemo(() => topicPdf(digest.topic), [digest.topic]);

  // 一押しが変わったら紹介文の下書きを入れ替える
  useEffect(() => {
    setDescDraft(digest.topic?.description ?? '');
  }, [digest.topic?.id, digest.topic?.description]);

  /** 一押しの紹介文を予定カードに保存し、文面・画像に反映する */
  const saveDescription = async () => {
    const topic = digest.topic;
    if (!topic) return;
    const description = descDraft.trim() || null;
    setSavingDesc(true);
    try {
      const saved = await updateEventCard(topic.id, { description });
      // DBに description 列が無い（マイグレーション未適用）と黙って落ちるので、返ってきた行で確認する
      if (description && !('description' in saved)) {
        showError(
          '紹介文は保存されませんでした。DBに紹介文の列がありません（sql/migrations/2026-09-21-event-cards-description.sql を SQL Editor で実行してください）。'
        );
        return;
      }
      setCards((prev) => prev.map((c) => (c.id === topic.id ? { ...c, description } : c)));
      showToast('紹介文を保存しました');
    } catch (e) {
      console.error('紹介文の保存エラー:', e);
      showError('紹介文を保存できませんでした。');
    } finally {
      setSavingDesc(false);
    }
  };
  const descDirty = descDraft.trim() !== (digest.topic?.description ?? '').trim();

  // 一押しのリンクを短縮URLにする（取得できたら文面を作り直す）
  const link = useMemo(() => (digest.topic ? topicLink(digest.topic) : null), [digest.topic]);
  useEffect(() => {
    if (!link || shortUrls[link.url]) return;
    let cancelled = false;
    shortenUrl(link.url).then((s) => {
      if (!cancelled && s !== link.url) setShortUrls((prev) => ({ ...prev, [link.url]: s }));
    });
    return () => {
      cancelled = true;
    };
  }, [link?.url]);

  // データや配信日が変わったら文面を作り直す（手で編集した内容は「作り直す」で上書き）
  useEffect(() => {
    setText(renderText(digest, shortUrls));
  }, [digest, shortUrls]);

  // 一押しのチラシ（PDF 1ページ目）を画像化。URLが変わったときだけ
  useEffect(() => {
    let cancelled = false;
    if (!pdf) {
      setFlyer(null);
      setFlyerState('idle');
      return;
    }
    setFlyerState('loading');
    renderPdfFirstPage(pdf.url)
      .then((c) => {
        if (cancelled) return;
        setFlyer(c);
        setFlyerState('idle');
      })
      .catch((e) => {
        console.error('チラシPDFの画像化エラー:', e);
        if (cancelled) return;
        setFlyer(null);
        setFlyerState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [pdf?.url]);

  useEffect(() => {
    if (canvasRef.current) drawImage(canvasRef.current, digest, imageMode, flyer);
  }, [digest, imageMode, flyer]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showError('コピーできませんでした。文面を選択してコピーしてください。');
    }
  };

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `weekly-${baseDate}-${imageMode}.png`;
    a.click();
  };

  // ---- LINE 送信（Flex） ----

  // テキスト吹き出しの既定文（一押しが変わったら作り直す。手で直した後は「作り直す」で戻す）
  useEffect(() => {
    setGreeting(buildGreetingText(digest));
  }, [digest]);

  const loadHistory = () => getWeeklyDigestSends(8).then(setHistory);
  useEffect(() => {
    loadHistory();
  }, []);

  /** チラシ画像（プレビュー用の data URL） */
  const flyerSrc = useMemo(() => (flyer ? flyer.toDataURL('image/jpeg', 0.8) : null), [flyer]);

  /**
   * 送るメッセージを組み立てる。Flex のヒーロー画像は https が必要なので、
   * チラシ画像を Storage（newsletter-images/weekly/）に置いてから使う。
   */
  const buildMessages = async (): Promise<LineMessage[]> => {
    let flyerImageUrl: string | null = null;
    if (digest.topic && flyer) {
      const blob = await new Promise<Blob | null>((resolve) => flyer.toBlob(resolve, 'image/jpeg', 0.85));
      if (blob) flyerImageUrl = await uploadWeeklyImage(blob, baseDate, 'flyer');
    }
    return buildWeeklyMessages(digest, greeting, { flyerImageUrl });
  };

  /** validate: 形式チェックのみ / test: 自分にだけ / broadcast: 全員 */
  const send = async (mode: LineSendMode) => {
    if (mode === 'broadcast') {
      const ok = await appConfirm({
        title: '友だち全員に配信しますか？',
        message: `${md(digest.from)}〜${md(digest.to)} の「今週のお知らせ」を公式LINEの友だち全員に送ります。取り消しはできません。先に「テスト送信」で見た目を確認してください。`,
        confirmLabel: '全員に配信する',
      });
      if (!ok) return;
    }
    setSending(mode);
    setSendNote(null);
    try {
      const messages = await buildMessages();
      const result = await sendLineMessages(mode, messages);
      const label = mode === 'validate' ? '形式チェックOK。LINE に送れる内容です' : mode === 'test' ? 'テスト送信しました。自分のLINEで見た目を確認してください' : '友だち全員に配信しました';
      setSendNote(`✅ ${label}（${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}）`);
      showToast(label);
      if (mode !== 'validate') {
        await recordWeeklyDigestSend({ base_date: baseDate, mode, text: greeting, messages, line_status: result.status });
        loadHistory();
      }
    } catch (e: any) {
      console.error('LINE 送信エラー:', e);
      setSendNote(`❌ ${e?.message ?? '送信に失敗しました'}`);
      showError(e?.message ?? '送信に失敗しました');
    } finally {
      setSending(null);
    }
  };

  /** Flex JSON をコピー（LINE Developers の Flex Message Simulator に貼って確認する用） */
  const copyFlexJson = async () => {
    try {
      const messages = buildWeeklyMessages(digest, greeting, { flyerImageUrl: null });
      const flex = messages.find((m) => m.type === 'flex');
      await navigator.clipboard.writeText(JSON.stringify(flex ?? messages, null, 2));
      showToast('Flex JSON をコピーしました（チラシ画像は送信時に付きます）');
    } catch {
      showError('コピーできませんでした');
    }
  };
  const alreadySentThisWeek = history.find((h) => h.mode === 'broadcast' && h.base_date === baseDate);

  const counts = {
    topic: digest.topic ? 1 : 0,
    reports: digest.reports.length,
    urgent: digest.urgent.length,
    events: digest.events.length,
    apply: digest.apply.length,
  };
  const total = counts.topic + counts.reports + counts.urgent + counts.events + counts.apply;
  const needsFlyer = imageMode === 'flyer' || imageMode === 'hybrid';

  return (
    <div className="space-y-4">
      <div className="bg-white p-6 rounded-2xl shadow border border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Send size={20} className="text-emerald-600" />
              週次配信（今週のお知らせ）
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              公開中の予定カードとレポートから、公式LINEで流す文面と画像を自動で組み立てます。文面を直してコピーし、LINEに貼って配信してください。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">配信日</label>
            <input
              type="date"
              value={baseDate}
              onChange={(e) => setBaseDate(e.target.value)}
              className="text-sm border border-slate-300 rounded-lg px-2 py-1.5"
            />
            <button
              onClick={load}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition"
              title="予定データを読み直す"
            >
              <RefreshCw size={14} /> 読み直す
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-10 justify-center">
            <Loader2 size={16} className="animate-spin" /> 予定を読み込み中...
          </div>
        ) : (
          <>
            {/* 内訳（何が何件入ったか） */}
            <div className="flex flex-wrap gap-2 mt-4 text-xs">
              {[
                ['⭐ 一押し', counts.topic, LIMITS.topic],
                ['📰 レポート', counts.reports, LIMITS.reports],
                ['⏰ 締切間近', counts.urgent, null],
                ['📅 予定', counts.events, LIMITS.events],
                ['📝 申込受付中', counts.apply, LIMITS.apply],
              ].map(([label, n, max]) => (
                <span
                  key={String(label)}
                  className={`px-2 py-1 rounded-full border ${Number(n) > 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-400'}`}
                >
                  {label} {n}
                  {max !== null ? `/${max}` : ''}件
                </span>
              ))}
              <span className="px-2 py-1 text-slate-400">合計 {total} 件</span>
            </div>
            {total === 0 && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
                この配信日の範囲に予定がありません。予定カードが登録・公開されているか、配信日を確認してください。
              </p>
            )}
            {/* ⭐一押しの紹介文（ここで入力して保存すると予定カードに保存され、文面・画像に載る） */}
            {digest.topic && (
              <div className={`mt-3 rounded-lg border px-3 py-2 ${digest.topic.description ? 'border-slate-200 bg-slate-50' : 'border-amber-200 bg-amber-50'}`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="text-xs font-bold text-slate-600">
                    ⭐ 一押し「{digest.topic.title}」の紹介文（1〜2文）
                  </label>
                  <button
                    onClick={saveDescription}
                    disabled={savingDesc || !descDirty}
                    className="flex items-center gap-1 px-3 py-1 text-xs font-bold text-white bg-slate-700 rounded-lg hover:bg-slate-800 transition disabled:opacity-40"
                  >
                    {savingDesc ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    {savingDesc ? '保存しています…' : '紹介文を保存'}
                  </button>
                </div>
                <textarea
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  rows={2}
                  placeholder="例: 地元の作品展示と演奏会。お茶を飲みながら気軽に楽しめます。"
                  className="w-full text-sm border border-slate-300 rounded-lg px-2 py-1.5 resize-none leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  {digest.topic.description
                    ? '保存すると予定カードにも残り、次回以降もこの紹介文が使われます。'
                    : 'まだ紹介文がありません。ここで入力して保存すると、文面と画像に載ります（予定カードにも保存されます）。'}
                  {' '}{descDraft.length} 文字
                </p>
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2 mt-4">
              {/* 文面 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-500">配信文（編集できます）</label>
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] ${text.length > CHAR_GUIDE ? 'text-amber-600 font-bold' : 'text-slate-400'}`}>
                      {text.length} 文字{text.length > CHAR_GUIDE ? `（目安 ${CHAR_GUIDE} 文字を超えています。項目を削ると読みやすくなります）` : ''}
                    </span>
                    <button
                      onClick={() => setText(renderText(digest, shortUrls))}
                      className="text-[11px] text-slate-500 hover:text-slate-800"
                      title="自動生成の文面に戻す"
                    >
                      作り直す
                    </button>
                    <button
                      onClick={copy}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition"
                    >
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                      {copied ? 'コピーしました' : '文面をコピー'}
                    </button>
                  </div>
                </div>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={22}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
                {link && (
                  <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1 flex-wrap">
                    一押しのリンク先（{link.label}に直接）:
                    <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-0.5 break-all">
                      {shortUrls[link.url] ?? link.url} <ExternalLink size={10} />
                    </a>
                    {shortUrls[link.url] ? '（短縮URL。リッチメッセージのタップ先にも使えます）' : '（短縮URLを取得中か、取得できませんでした。元のURLのままです）'}
                  </p>
                )}
              </div>

              {/* 画像 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-500">配信画像（1040×1040・LINE のリッチメッセージ用）</label>
                  <button
                    onClick={download}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-700 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 transition"
                  >
                    <Download size={14} /> PNGを保存
                  </button>
                </div>
                {/* 画像の種類 */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {IMAGE_MODES.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setImageMode(m.key)}
                      title={m.hint}
                      className={`text-[11px] px-2 py-1 rounded-full border transition ${
                        imageMode === m.key
                          ? 'bg-slate-700 text-white border-slate-700'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <canvas ref={canvasRef} className="w-full max-w-md rounded-lg border border-slate-200" />
                  {needsFlyer && flyerState === 'loading' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/60 rounded-lg text-xs text-slate-500 gap-1.5 max-w-md">
                      <Loader2 size={14} className="animate-spin" /> チラシを画像にしています...
                    </div>
                  )}
                </div>
                {needsFlyer && digest.topic && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    {!pdf
                      ? '⭐一押しに出典PDFが無いため「一押しのみ（文字）」で描いています。'
                      : flyerState === 'error'
                        ? 'チラシPDFを画像にできなかったため「一押しのみ（文字）」で描いています。'
                        : pdf.fallback
                          ? 'チラシ: 一押しに由来PDFが無いため、出典号の先頭PDFを使っています（内容が合わなければ他の種類を選んでください）。'
                          : `チラシ: 一押しの由来PDF${digest.topic.source_pdf_label ? `（${digest.topic.source_pdf_label}）` : ''}の1ページ目。`}
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* LINE に送る（Flex カルーセル） */}
      {!loading && (
        <div className="bg-white p-6 rounded-2xl shadow border border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <MessageCircle size={18} className="text-emerald-600" />
                LINE に送る（カード形式）
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                短いテキスト＋カード（一押し／今週の予定／申込受付中／レポート）を1回の配信で送ります。まず「テスト送信」で自分のLINEに届く見た目を確認してから「全員に配信」してください。
              </p>
            </div>
          </div>

          {alreadySentThisWeek && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
              ⚠ この配信日（{md(baseDate)}）はすでに全員配信済みです（{new Date(alreadySentThisWeek.sent_at).toLocaleString('ja-JP')}）。二重配信に注意してください。
            </p>
          )}

          <div className="grid gap-4 lg:grid-cols-2 mt-4">
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-500">テキスト（吹き出し①・編集できます）</label>
                  <button onClick={() => setGreeting(buildGreetingText(digest))} className="text-[11px] text-slate-500 hover:text-slate-800" title="自動生成の文に戻す">
                    作り直す
                  </button>
                </div>
                <textarea
                  value={greeting}
                  onChange={(e) => setGreeting(e.target.value)}
                  rows={4}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => send('validate')}
                  disabled={sending !== null}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 transition disabled:opacity-50"
                  title="送らずに LINE 側で形式だけチェックします"
                >
                  {sending === 'validate' ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} 形式チェック
                </button>
                <button
                  onClick={copyFlexJson}
                  disabled={sending !== null}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 transition disabled:opacity-50"
                  title="LINE Developers の Flex Message Simulator に貼って本物の見た目を確認できます"
                >
                  <Copy size={14} /> Flex JSON をコピー
                </button>
                <button
                  onClick={() => send('test')}
                  disabled={sending !== null}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition disabled:opacity-50"
                  title="自分のLINE（LINE_TEST_USER_ID）にだけ送ります"
                >
                  {sending === 'test' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} テスト送信（自分に）
                </button>
                <button
                  onClick={() => send('broadcast')}
                  disabled={sending !== null}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 transition disabled:opacity-50"
                  title="公式LINEの友だち全員に配信します（確認あり）"
                >
                  {sending === 'broadcast' ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />} 全員に配信
                </button>
              </div>
              {sendNote && <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 whitespace-pre-wrap">{sendNote}</p>}
              <p className="text-[11px] text-slate-400">
                テスト送信と全員配信は、送るたびに公式LINEの通数（無料枠は月200通）を使います。テスト送信は1通です。チラシ画像は送信時に自動でアップロードされます。
              </p>

              {history.length > 0 && (
                <div className="pt-1">
                  <p className="text-xs font-bold text-slate-500 mb-1">配信履歴</p>
                  <ul className="text-[11px] text-slate-500 space-y-0.5">
                    {history.map((h) => (
                      <li key={h.id}>
                        {new Date(h.sent_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}{' '}
                        <span className={`px-1.5 py-0.5 rounded font-bold ${h.mode === 'broadcast' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                          {h.mode === 'broadcast' ? '全員配信' : 'テスト'}
                        </span>{' '}
                        配信日 {h.base_date}
                        {h.line_status && h.line_status >= 300 ? ` （LINE ${h.line_status}）` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">見た目のプレビュー（実際の描画はテスト送信で確認）</label>
              <FlexPreview digest={digest} greeting={greeting} flyerSrc={flyerSrc} />
            </div>
          </div>
        </div>
      )}

      <div className="bg-white p-5 rounded-2xl shadow border border-slate-200 text-xs text-slate-500 space-y-1">
        <p className="font-bold text-slate-600">組み立てのルール</p>
        <p>・⭐一押し: 配信候補（⭐）のうち開催が近いもの1件。紹介文（1〜2文）と、チラシPDF→記事→予定ページの順でいちばん直接的なURLを添えます ／ 📰レポート: 直近14日に公開したもの最大2件</p>
        <p>・📅今週の予定: 要予約以外で配信日から7日間、最大6件 ／ 📝申込受付中: 要予約で締切が14日以内、締切順に最大4件</p>
        <p>・⏰締切間近: 締切3日以内。締切が未入力の要予約は「開催7日前」を仮締切にして「頃」を付けます（抽出ダイアログの「締切」欄で入力できます）</p>
        <p>・対象者・参加費は ⭐一押し と 📝申込受付中／⏰締切間近 の行にだけ「（65歳以上・無料）」の形で添えます（📅今週の予定には付けません）</p>
        <p>・画像は「一押しチラシ」が既定。チラシが無いときは「一押しのみ（文字）」になります。LINEのリッチメッセージでは画像のタップ先に一押しのURLを設定してください</p>
        <p>・件数の上限を超えた分は載りません。載せたいものがあれば文面を直接編集してください</p>
      </div>
    </div>
  );
};
