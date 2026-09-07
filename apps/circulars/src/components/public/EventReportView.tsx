/**
 * イベントレポート専用レンダラー（関ヶ谷レポート）
 *
 * 回覧板の記事表示（CircularsView 内の renderArticleCard）とは別物。
 * 写真で読ませる「読み物」向けに、ゆったりした行間・見出し装飾・
 * 本文中に大きく入る写真・キャプションで表示する。
 * スタイルは index.css の .report-article を参照。
 *
 * 高齢の読み手が多いので、文字サイズを 小/中/大 で切り替えられる。
 * 選択は localStorage に保存し、次に開いたときも維持する。
 */

import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { Calendar, MapPin, PenLine } from 'lucide-react';
import type { Article } from '@cc-saas/shared';

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

type TextSize = 'sm' | 'md' | 'lg';
/** .report-article の基準サイズ（16px）を上書きする。本文は em 指定なので全体が連動する */
const TEXT_SIZE_PX: Record<TextSize, number> = { sm: 15, md: 17, lg: 20 };
const TEXT_SIZE_LABELS: Array<{ key: TextSize; label: string }> = [
  { key: 'sm', label: '小' },
  { key: 'md', label: '中' },
  { key: 'lg', label: '大' },
];
const TEXT_SIZE_STORAGE_KEY = 'sekigaya-report-text-size';

function loadTextSize(): TextSize {
  try {
    const v = localStorage.getItem(TEXT_SIZE_STORAGE_KEY);
    if (v === 'sm' || v === 'md' || v === 'lg') return v;
  } catch {
    /* プライベートブラウジング等では読めないことがある */
  }
  return 'md';
}

function formatEventDate(d?: string | null): string | null {
  if (!d) return null;
  const dt = new Date(d + 'T00:00:00');
  if (isNaN(dt.getTime())) return d;
  return `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日（${WEEK[dt.getDay()]}）`;
}

interface EventReportViewProps {
  article: Article;
}

const EventReportView: React.FC<EventReportViewProps> = ({ article }) => {
  const [textSize, setTextSize] = useState<TextSize>(loadTextSize);

  useEffect(() => {
    try {
      localStorage.setItem(TEXT_SIZE_STORAGE_KEY, textSize);
    } catch {
      /* 保存できなくても表示には影響しない */
    }
  }, [textSize]);

  const heroUrl =
    article.thumbnail_url ||
    article.attachments?.find((a: any) => a.type === 'image')?.url ||
    null;
  const dateLabel = formatEventDate(article.event_date);

  return (
    <article className="report-article" style={{ fontSize: TEXT_SIZE_PX[textSize] }}>
      <div className="report-head">
        <span className="report-tag">イベントレポート</span>
        <div className="report-textsize" role="group" aria-label="文字サイズ">
          <span className="report-textsize-label">文字サイズ</span>
          {TEXT_SIZE_LABELS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTextSize(key)}
              aria-pressed={textSize === key}
              className={textSize === key ? 'is-active' : undefined}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <h1>{article.title}</h1>

      <div className="report-meta">
        {dateLabel && (
          <span>
            <Calendar size={14} aria-hidden />
            {dateLabel}
            {article.event_time ? ` ${article.event_time}` : ''}
          </span>
        )}
        {article.event_location && (
          <span>
            <MapPin size={14} aria-hidden />
            {article.event_location}
          </span>
        )}
        {article.source && (
          <span>
            <PenLine size={14} aria-hidden />
            {article.source}
          </span>
        )}
      </div>

      {heroUrl && (
        <figure className="report-hero">
          <img src={heroUrl} alt="" />
        </figure>
      )}

      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          // 画像は figure + キャプション（alt をキャプションに）で全幅表示。
          // src が動画拡張子なら <video> として埋め込む。
          img: ({ src, alt }: any) => {
            const isVideo = typeof src === 'string' && /\.(mp4|webm|mov)$/i.test(src);
            return (
              <figure>
                {isVideo ? (
                  <video src={src} controls preload="metadata" playsInline />
                ) : (
                  <img src={src} alt="" loading="lazy" />
                )}
                {alt ? <figcaption>{alt}</figcaption> : null}
              </figure>
            );
          },
          // 画像だけの段落は <p> で包まない（p > figure の不正ネストを回避）
          p: ({ children }: any) => {
            const arr = React.Children.toArray(children);
            const hasBlock = arr.some((c: any) => c?.type === 'figure');
            return hasBlock ? <>{children}</> : <p>{children}</p>;
          },
          a: ({ href, children }: any) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {article.content}
      </ReactMarkdown>

      <div className="report-footer">関ヶ谷レポート ・ 文：DX委員会</div>
    </article>
  );
};

export default EventReportView;
