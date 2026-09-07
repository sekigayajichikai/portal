/**
 * イベントレポート専用レンダラー（関ヶ谷レポート）
 *
 * 回覧板の記事表示（CircularsView 内の renderArticleCard）とは別物。
 * 写真で読ませる「読み物」向けに、ゆったりした行間・見出し装飾・
 * 本文中に大きく入る写真・キャプションで表示する。
 * スタイルは index.css の .report-article を参照。
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import type { Article } from '@cc-saas/shared';

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

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
  const heroUrl =
    article.thumbnail_url ||
    article.attachments?.find((a: any) => a.type === 'image')?.url ||
    null;
  const dateLabel = formatEventDate(article.event_date);

  return (
    <article className="report-article">
      <span className="report-tag">イベントレポート</span>
      <h1>{article.title}</h1>

      <div className="report-meta">
        {dateLabel && (
          <span>
            📅 {dateLabel}
            {article.event_time ? ` ${article.event_time}` : ''}
          </span>
        )}
        {article.event_location && <span>📍 {article.event_location}</span>}
        {article.source && <span>✍️ {article.source}</span>}
      </div>

      {heroUrl && (
        <figure>
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
                  <video src={src} controls preload="metadata" />
                ) : (
                  <img src={src} alt="" />
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
