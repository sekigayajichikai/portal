/**
 * Flex カルーセルの見た目プレビュー（LINE のトーク画面風）
 *
 * weeklyFlex.ts と同じ Digest から、同じ構成（一押し／今週の予定／申込受付中／レポート）を
 * HTML で描く。本物の描画は LINE Developers の Flex Message Simulator か「テスト送信」で確認する。
 */

import React from 'react';
import type { PublicEventCard } from '@cc-saas/shared';
import { type Digest, md, shortTime, siteUrl, topicLink, audienceFee } from './weeklyDigestCore';

interface FlexPreviewProps {
  digest: Digest;
  greeting: string;
  /** 一押しのチラシ画像（上部を正方形に切り出した data URL か https）。無ければ画像なし */
  flyerSrc: string | null;
}

/**
 * カード1枚。LINE のカルーセルは全カードの高さが一番高いカードに揃い、フッター（ボタン）は下端に付くので、
 * ここでも縦方向の flex にして最後の要素（フッター）を下に寄せる
 */
const Bubble: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="shrink-0 w-[260px] bg-white rounded-2xl overflow-hidden shadow-sm text-slate-800 flex flex-col [&>*:last-child]:mt-auto">
    {children}
  </div>
);

const Row: React.FC<{ c: PublicEventCard; when: string; whenColor?: string; prefix?: string }> = ({ c, when, whenColor, prefix }) => (
  <a
    href={topicLink(c).url}
    target="_blank"
    rel="noopener noreferrer"
    className="flex items-center gap-2 py-2 border-b border-slate-100 last:border-0 hover:bg-slate-50"
  >
    <span className={`w-12 shrink-0 text-[10px] font-bold leading-tight whitespace-pre-line ${whenColor ?? 'text-blue-700'}`}>{when}</span>
    <span className="flex-1 min-w-0">
      <span className="block text-xs font-bold leading-snug">
        {prefix}
        {c.title}
      </span>
      {c.event_location && <span className="block text-[10px] text-slate-400 truncate">{c.event_location}</span>}
    </span>
    <span className="text-slate-300 text-lg leading-none">›</span>
  </a>
);

export const FlexPreview: React.FC<FlexPreviewProps> = ({ digest: d, greeting, flyerSrc }) => {
  const t = d.topic;
  const link = t ? topicLink(t) : null;
  return (
    <div className="rounded-xl p-3 space-y-2" style={{ background: '#7494c0' }}>
      {/* ① テキスト */}
      <div className="bg-white rounded-2xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap max-w-[260px] shadow-sm text-slate-800">
        {greeting}
      </div>
      {/* ② ⭐一押し（1枚だけの吹き出し。カルーセルと高さを揃えなくて済む） */}
      {t && link && (
        <div className="flex">
          <Bubble>
            {flyerSrc ? <img src={flyerSrc} alt="" className="w-full bg-slate-100" style={{ aspectRatio: '1/1', objectFit: 'cover' }} /> : null}
            <div className="px-3 pt-3 pb-1 space-y-1">
              <div className="text-[10px] font-bold text-red-700">⭐ 今週の一押し</div>
              <div className="text-sm font-bold leading-snug">{t.title}</div>
              <div className="text-xs font-bold text-blue-700">
                {md(t.event_date!)}
                {t.event_time ? ` ${t.event_time}` : ''}
              </div>
              {(t.event_location || t.organizer) && (
                <div className="text-[10px] text-slate-500">
                  📍 {[t.event_location, t.organizer ? `主催: ${t.organizer}` : null].filter(Boolean).join(' / ')}
                  {audienceFee(t)}
                </div>
              )}
              {t.description && <div className="text-xs text-slate-700 leading-relaxed pt-1">{t.description}</div>}
            </div>
            <div className="px-3 pb-3 pt-2 space-y-1.5">
              <a href={link.url} target="_blank" rel="noopener noreferrer" className="block text-center rounded-lg py-2 text-xs font-bold text-white" style={{ background: '#2563eb' }}>
                {link.kind === 'pdf' ? 'チラシを見る' : link.kind === 'article' ? '記事を読む' : '詳しく見る'}
              </a>
              {link.kind !== 'event' && (
                <a href={`${siteUrl()}/?event=${t.id}`} target="_blank" rel="noopener noreferrer" className="block text-center py-1 text-xs font-bold text-blue-700">
                  予定の詳細
                </a>
              )}
            </div>
          </Bubble>
        </div>
      )}
      {/* ③ カルーセル（今週の予定／申込受付中／レポート） */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(d.events.length > 0 || d.urgent.length > 0) && (
          <Bubble>
            <div className="px-3 py-2 text-white" style={{ background: '#2563eb' }}>
              <div className="text-sm font-bold">📅 今週の予定</div>
              <div className="text-[10px] opacity-80">
                {md(d.from)}〜{md(d.to)}
              </div>
            </div>
            <div className="px-3">
              {d.urgent.map((c) => (
                <Row key={c.id} c={c} prefix="⏰ " when={`締切\n${md(c.deadline)}${c.deadlineGuessed ? '頃' : ''}`} whenColor="text-red-700" />
              ))}
              {d.events.map((c) => (
                <Row key={c.id} c={c} when={`${md(c.event_date!)}${shortTime(c.event_time).replace(' ', '\n')}`} />
              ))}
            </div>
            <div className="px-3 py-2 text-center text-xs font-bold text-blue-700">回覧板サイトで全部見る</div>
          </Bubble>
        )}

        {d.apply.length > 0 && (
          <Bubble>
            <div className="px-3 py-2 text-white" style={{ background: '#2f6f4e' }}>
              <div className="text-sm font-bold">📝 申込受付中</div>
              <div className="text-[10px] opacity-80">締切の近い順</div>
            </div>
            <div className="px-3">
              {d.apply.map((c) => (
                <a key={c.id} href={topicLink(c).url} target="_blank" rel="noopener noreferrer" className="block py-2 border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <div className="text-xs font-bold">{c.title}</div>
                  <div className="text-[10px] font-bold text-red-700">
                    {md(c.event_date!)}開催 ・ 締切 {md(c.deadline)}
                    {c.deadlineGuessed ? '頃' : ''}
                    {audienceFee(c)}
                  </div>
                  {c.event_location && <div className="text-[10px] text-slate-400">{c.event_location}</div>}
                </a>
              ))}
            </div>
            <div className="px-3 py-2 text-center text-xs font-bold text-blue-700">申し込み方法を見る</div>
          </Bubble>
        )}

        {d.reports.map((r) => {
          const thumb = (r as { thumbnail_url?: string | null }).thumbnail_url || null;
          const brief = ((r as { brief?: string | null }).brief || (r as { summary?: string | null }).summary || '').trim();
          return (
            <Bubble key={r.id}>
              {thumb && <img src={thumb} alt="" className="w-full object-cover" style={{ aspectRatio: '16/9' }} />}
              <div className="px-3 pt-3 pb-1 space-y-1">
                <div className="text-[10px] font-bold text-red-700">📰 新しいレポート</div>
                <div className="text-sm font-bold leading-snug">{r.title}</div>
                {brief && <div className="text-xs text-slate-500">{brief.slice(0, 80)}</div>}
              </div>
              <div className="px-3 pb-3 pt-2">
                <a href={`${siteUrl()}/?report=${r.id}`} target="_blank" rel="noopener noreferrer" className="block text-center rounded-lg py-2 text-xs font-bold text-white" style={{ background: '#c0392b' }}>
                  レポートを読む
                </a>
              </div>
            </Bubble>
          );
        })}
      </div>
    </div>
  );
};
