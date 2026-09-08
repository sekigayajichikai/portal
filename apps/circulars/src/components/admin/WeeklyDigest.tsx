/**
 * 週次配信（今週のお知らせ）の下書きを自動で組み立てる画面
 *
 * 公開中の予定カード（event_cards）と公開中のレポート記事から、
 * 公式LINEで毎週流す文面と画像を、AIを使わず決まったルールで生成する。
 * 生成した文面は編集してからコピーし、LINE公式アカウントに貼って配信する（送信自体は手動）。
 *
 * 構成と件数上限（情報量が増えすぎないように固定）:
 *   ⭐ 今週の一押し … 1件（⭐配信候補のうち直近のもの）
 *   📰 新しいレポート … 最大2件（直近14日に公開されたレポート）
 *   📅 今週の予定 … 最大6件（open / recurring / 種別なし。配信日から7日間）
 *   📝 申込受付中 … 最大4件（reserve。締切が14日以内。締切不明は開催7日前を仮締切）
 *   ⏰ 締切間近 … 締切が3日以内のもの（申込受付中から抜き出して先頭に）
 *
 * 配信のタイミングは「開催日」ではなく「行動が必要な日（申込締切）」で決める。
 * 要予約のイベントは開催の2〜3週間前に「申込受付中」で初めて登場し、締切3日前に「締切間近」で再掲される。
 *
 * 仕様: docs/週次配信.md
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  getPublishedEventCards,
  getNewsletters,
  getArticlesByNewsletterId,
  type PublicEventCard,
  type Article,
} from '@cc-saas/shared';
import { Copy, Check, Download, RefreshCw, Loader2, Send } from 'lucide-react';
import { showError } from '@/components/ui/feedback';

const REPORT_NEWSLETTER_TITLE = '関ヶ谷レポート';
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
/** 件数上限（情報量の抑制） */
const LIMITS = { topic: 1, reports: 2, events: 6, apply: 4 };
/** 目安の文字数（LINE で読みやすい上限） */
const CHAR_GUIDE = 600;

const toDate = (s: string) => new Date(s + 'T00:00:00');
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (s: string, n: number) => {
  const d = toDate(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
};
const md = (s: string) => {
  const d = toDate(s);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEK[d.getDay()]})`;
};
/** "10:00-12:00（10/23も）" → "10:00〜" のように配信向けに短くする */
const shortTime = (t?: string | null) => {
  if (!t) return '';
  const m = t.match(/^(\d{1,2}:\d{2})/);
  return m ? ` ${m[1]}〜` : '';
};
const siteUrl = () =>
  ((import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined) || window.location.origin).replace(/\/+$/, '');

interface Digest {
  from: string;
  to: string;
  topic: PublicEventCard | null;
  reports: Article[];
  events: PublicEventCard[];
  apply: Array<PublicEventCard & { deadline: string; deadlineGuessed: boolean }>;
  urgent: Array<PublicEventCard & { deadline: string; deadlineGuessed: boolean }>;
}

/**
 * 配信日を起点に、各セクションの候補を選ぶ（ルールは冒頭コメント参照）
 */
function buildDigest(cards: PublicEventCard[], reports: Article[], baseDate: string): Digest {
  const from = baseDate;
  const to = addDays(baseDate, 7);
  const applyUntil = addDays(baseDate, 14);
  const urgentUntil = addDays(baseDate, 3);

  const future = cards.filter((c) => c.event_date && c.event_date >= from);
  const byDate = (a: PublicEventCard, b: PublicEventCard) => (a.event_date! < b.event_date! ? -1 : 1);

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

/** 配信文（プレーンテキスト）を組み立てる */
function renderText(d: Digest): string {
  const lines: string[] = [];
  lines.push(`【関ヶ谷 今週のお知らせ】${md(d.from)}〜${md(d.to)}`);

  if (d.topic) {
    const t = d.topic;
    lines.push('', '⭐ 今週の一押し');
    lines.push(`${md(t.event_date!)}${shortTime(t.event_time)} ${t.title}`);
    const sub = [t.event_location, t.organizer ? `主催: ${t.organizer}` : null].filter(Boolean).join(' / ');
    if (sub) lines.push(sub);
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
      lines.push(`・${c.title} 締切${md(c.deadline)}${c.deadlineGuessed ? '頃' : ''}${c.first_come ? ' ※先着' : ''}`);
    }
  }

  if (d.events.length > 0) {
    lines.push('', '📅 今週の予定');
    for (const c of d.events) {
      lines.push(`・${md(c.event_date!)}${shortTime(c.event_time)} ${c.title}${c.event_location ? `（${c.event_location}）` : ''}`);
    }
  }

  if (d.apply.length > 0) {
    lines.push('', '📝 申込受付中');
    for (const c of d.apply) {
      lines.push(
        `・${c.title} ${md(c.event_date!)}開催 締切${md(c.deadline)}${c.deadlineGuessed ? '頃' : ''}${c.first_come ? ' ※先着' : ''}`
      );
    }
  }

  lines.push('', '▶ 詳しくは回覧板サイトへ', `${siteUrl()}/`);
  return lines.join('\n');
}

/** 配信用の画像（1040×1040）を canvas で描く。今週の予定と申込受付中を最大8行 */
function drawImage(canvas: HTMLCanvasElement, d: Digest) {
  const W = 1040;
  const H = 1040;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#faf7f2';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(0, 0, W, 150);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 56px "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif';
  ctx.fillText('関ヶ谷 今週のお知らせ', 60, 95);
  ctx.font = '32px "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif';
  ctx.fillText(`${md(d.from)}〜${md(d.to)}`, 60, 138);

  let y = 230;
  const line = (text: string, opts: { bold?: boolean; color?: string; size?: number } = {}) => {
    ctx.fillStyle = opts.color ?? '#2d2a26';
    ctx.font = `${opts.bold ? 'bold ' : ''}${opts.size ?? 36}px "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif`;
    // 長い行は末尾を省略
    let t = text;
    while (ctx.measureText(t).width > W - 120 && t.length > 4) t = t.slice(0, -2) + '…';
    ctx.fillText(t, 60, y);
    y += (opts.size ?? 36) + 22;
  };

  if (d.topic) {
    line('⭐ 今週の一押し', { bold: true, color: '#a93226', size: 40 });
    line(`${md(d.topic.event_date!)} ${d.topic.title}`, { bold: true, size: 44 });
    if (d.topic.event_location) line(d.topic.event_location, { color: '#6b665c', size: 32 });
    y += 16;
  }
  const rows: string[] = [];
  for (const c of d.urgent) rows.push(`⏰ ${c.title} 締切${md(c.deadline)}`);
  for (const c of d.events) rows.push(`${md(c.event_date!)} ${c.title}`);
  for (const c of d.apply) rows.push(`📝 ${c.title} 締切${md(c.deadline)}`);
  if (rows.length > 0) {
    line('📅 今週の予定・申込', { bold: true, color: '#a93226', size: 40 });
    for (const r of rows.slice(0, 8)) {
      if (y > H - 120) break;
      line(r);
    }
  }
  ctx.fillStyle = '#8a8578';
  ctx.font = '28px "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif';
  ctx.fillText('詳しくは回覧板サイト（公式LINEのメニューから）', 60, H - 50);
}

export const WeeklyDigest: React.FC = () => {
  const [baseDate, setBaseDate] = useState<string>(ymd(new Date()));
  const [cards, setCards] = useState<PublicEventCard[]>([]);
  const [reports, setReports] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);
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

  // データや配信日が変わったら文面を作り直す（手で編集した内容は「作り直す」で上書き）
  useEffect(() => {
    setText(renderText(digest));
  }, [digest]);

  useEffect(() => {
    if (canvasRef.current) drawImage(canvasRef.current, digest);
  }, [digest]);

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
    a.download = `weekly-${baseDate}.png`;
    a.click();
  };

  const counts = {
    topic: digest.topic ? 1 : 0,
    reports: digest.reports.length,
    urgent: digest.urgent.length,
    events: digest.events.length,
    apply: digest.apply.length,
  };
  const total = counts.topic + counts.reports + counts.urgent + counts.events + counts.apply;

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
                      onClick={() => setText(renderText(digest))}
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
                <canvas ref={canvasRef} className="w-full max-w-md rounded-lg border border-slate-200" />
              </div>
            </div>
          </>
        )}
      </div>

      <div className="bg-white p-5 rounded-2xl shadow border border-slate-200 text-xs text-slate-500 space-y-1">
        <p className="font-bold text-slate-600">組み立てのルール</p>
        <p>・⭐一押し: 配信候補（⭐）のうち開催が近いもの1件 ／ 📰レポート: 直近14日に公開したもの最大2件</p>
        <p>・📅今週の予定: 要予約以外で配信日から7日間、最大6件 ／ 📝申込受付中: 要予約で締切が14日以内、締切順に最大4件</p>
        <p>・⏰締切間近: 締切3日以内。締切が未入力の要予約は「開催7日前」を仮締切にして「頃」を付けます（抽出ダイアログの「締切」欄で入力できます）</p>
        <p>・件数の上限を超えた分は載りません。載せたいものがあれば文面を直接編集してください</p>
      </div>
    </div>
  );
};
