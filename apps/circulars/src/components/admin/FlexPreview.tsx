/**
 * Flex カルーセルの見た目プレビュー（LINE のトーク画面風）
 *
 * weeklyFlex.ts と同じ Digest から、同じ構成（一押し／今週の予定／申込受付中／レポート）を
 * HTML で描く。本物の描画は LINE Developers の Flex Message Simulator か「テスト送信」で確認する。
 */

import React from 'react';
import type { PublicEventCard } from '@cc-saas/shared';
import { type Digest, type LinkKind, md, shortTime, siteUrl, topicLink, audienceFee, hasDetailLink } from './weeklyDigestCore';

interface FlexPreviewProps {
  digest: Digest;
  greeting: string;
  /** 一押しごとのチラシ画像（予定ID → 正方形に切り出した data URL か https）。無ければ画像なし */
  flyerSrcs: Record<string, string | null>;
  /** 一押しごとのリンク先の指定 */
  linkKinds: Record<string, LinkKind>;
}

/**
 * カード1枚。LINE のカルーセルは全カードの高さが一番高いカードに揃い、フッター（ボタン）は下端に付く。
 * ここでも縦方向の flex にし、フッターを置くカードはその要素に `mt-auto` を付けて下に寄せる
 * （フッターの無いカードは本文が上から並ぶ＝実物と同じ）
 */
const Bubble: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="shrink-0 w-[300px] bg-white rounded-2xl overflow-hidden shadow-sm text-slate-800 flex flex-col">{children}</div>
);

/** 両カード共通の見出し下の案内 */
const ROW_HINT = '「詳しく ›」をタップすると案内が開きます';

/**
 * 予定の行。日時（または締切）をタイトルの上の1行に置き、右端に固定幅の「詳しく ›」（実機で日付列が折れないように）。
 * チラシか記事がある予定だけタップできる
 */
const Row: React.FC<{ c: PublicEventCard; when: string; whenColor?: string; prefix?: string; sub?: string }> = ({ c, when, whenColor, prefix, sub }) => {
  const linkable = hasDetailLink(c);
  const inner = (
    <>
      <span className="flex-1 min-w-0">
        <span className={`block text-sm font-bold leading-snug ${whenColor ?? 'text-blue-700'}`}>{when}</span>
        <span className="block text-sm font-bold leading-snug">
          {prefix}
          {c.title}
        </span>
        {sub && <span className="block text-xs text-slate-600">{sub}</span>}
        {c.event_location && <span className="block text-xs text-slate-400">{c.event_location}</span>}
      </span>
      {/* 押せる行だけ「詳しく ›」（本文と同じ大きさの太字・濃いグレー）。枠は固定幅で、押せない行も位置を揃える */}
      <span className="shrink-0 text-sm font-bold text-slate-600 text-right w-16">{linkable ? '詳しく ›' : ''}</span>
    </>
  );
  const cls = 'flex items-center gap-2 py-2 border-b border-slate-100 last:border-0';
  return linkable ? (
    <a href={topicLink(c).url} target="_blank" rel="noopener noreferrer" className={`${cls} hover:bg-slate-50`}>
      {inner}
    </a>
  ) : (
    <div className={cls}>{inner}</div>
  );
};

export const FlexPreview: React.FC<FlexPreviewProps> = ({ digest: d, greeting, flyerSrcs, linkKinds }) => {
  return (
    <div className="rounded-xl p-3 space-y-2" style={{ background: '#7494c0' }}>
      {/* ① テキスト */}
      <div className="bg-white rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap max-w-[260px] shadow-sm text-slate-800">
        {greeting}
      </div>
      {/* ② ⭐一押し（1枚だけの吹き出しに最大2件を縦に。カルーセルと高さを揃えなくて済む） */}
      {d.topics.length > 0 && (
        <div className="flex">
          <Bubble>
            <div className="px-3 py-2 text-white" style={{ background: '#b45309' }}>
              <div className="text-base font-bold">⭐ 今週の一押し</div>
              <div className="text-xs opacity-80">
                {md(d.from)}〜{md(d.to)} のお知らせ
              </div>
            </div>
            <div className="px-3 pt-3 pb-3">
              {d.topics.map((t, i) => {
                const link = topicLink(t, linkKinds[t.id]);
                const src = flyerSrcs[t.id] ?? null;
                return (
                  <div key={t.id} className={i > 0 ? 'mt-4 pt-4 border-t border-slate-200' : ''}>
                    {src && <img src={src} alt="" className="w-full bg-slate-100 rounded" style={{ aspectRatio: '1/1', objectFit: 'cover' }} />}
                    <div className="pt-2 space-y-1">
                      <div className="text-base font-bold leading-snug">{t.title}</div>
                      <div className="text-sm font-bold text-blue-700">
                        {md(t.event_date!)}
                        {t.event_time ? ` ${t.event_time}` : ''}
                      </div>
                      {(t.event_location || t.organizer) && (
                        <div className="text-xs text-slate-500">
                          📍 {[t.event_location, t.organizer ? `主催: ${t.organizer}` : null].filter(Boolean).join(' / ')}
                          {audienceFee(t)}
                        </div>
                      )}
                      {t.description && <div className="text-sm text-slate-700 leading-relaxed pt-1">{t.description}</div>}
                    </div>
                    {/* ボタンは「詳しく見る」1つ（行き先は指定があればそれ、無ければ チラシPDF → 記事 → 予定ページ） */}
                    <a href={link.url} target="_blank" rel="noopener noreferrer" className="block text-center rounded-lg py-2 mt-2 text-sm font-bold text-white" style={{ background: '#b45309' }}>
                      詳しく見る
                    </a>
                  </div>
                );
              })}
            </div>
          </Bubble>
        </div>
      )}
      {/* ③ カルーセル（今週の予定／申込受付中／レポート） */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(d.events.length > 0 || d.urgent.length > 0) && (
          <Bubble>
            <div className="px-3 py-2 text-white" style={{ background: '#2563eb' }}>
              <div className="text-base font-bold">📅 今週の予定</div>
              <div className="text-xs opacity-80">
                {md(d.from)}〜{md(d.to)}　{ROW_HINT}
              </div>
            </div>
            <div className="px-3">
              {d.urgent.map((c) => (
                <Row
                  key={c.id}
                  c={c}
                  prefix="⏰ "
                  when={`締切 ${md(c.deadline)}${c.deadlineGuessed ? '頃' : ''}`}
                  whenColor="text-red-700"
                  sub={`${md(c.event_date!)}開催${audienceFee(c)}`}
                />
              ))}
              {d.events.map((c) => (
                <Row key={c.id} c={c} when={`${md(c.event_date!)}${shortTime(c.event_time)}`} />
              ))}
            </div>
            <div className="px-3 py-2 mt-auto text-center text-sm font-bold text-blue-700">ほかの予定も見る</div>
          </Bubble>
        )}

        {d.apply.length > 0 && (
          <Bubble>
            <div className="px-3 py-2 text-white" style={{ background: '#2f6f4e' }}>
              <div className="text-base font-bold">📝 申込受付中</div>
              <div className="text-xs opacity-80">{ROW_HINT}</div>
            </div>
            <div className="px-3 pb-2">
              {d.apply.map((c) => (
                <Row
                  key={c.id}
                  c={c}
                  when={`締切 ${md(c.deadline)}${c.deadlineGuessed ? '頃' : ''}`}
                  whenColor="text-red-700"
                  sub={`${md(c.event_date!)}開催${audienceFee(c)}`}
                />
              ))}
            </div>
          </Bubble>
        )}

        {d.reports.map((r) => {
          const thumb = (r as { thumbnail_url?: string | null }).thumbnail_url || null;
          const brief = ((r as { brief?: string | null }).brief || (r as { summary?: string | null }).summary || '').trim();
          return (
            <Bubble key={r.id}>
              {thumb && <img src={thumb} alt="" className="w-full object-cover" style={{ aspectRatio: '16/9' }} />}
              <div className="px-3 pt-3 pb-1 space-y-1">
                <div className="text-xs font-bold text-red-700">📰 新しいレポート</div>
                <div className="text-base font-bold leading-snug">{r.title}</div>
                {brief && <div className="text-sm text-slate-500">{brief.slice(0, 80)}</div>}
              </div>
              <div className="px-3 pb-3 pt-2 mt-auto">
                <a href={`${siteUrl()}/?report=${r.id}`} target="_blank" rel="noopener noreferrer" className="block text-center rounded-lg py-2 text-sm font-bold text-white" style={{ background: '#c0392b' }}>
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
