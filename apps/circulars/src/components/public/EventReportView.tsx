/**
 * イベントレポート専用レンダラー（関ヶ谷レポート）
 *
 * 回覧板の記事表示（CircularsView 内の renderArticleCard）とは別物。
 * 写真で読ませる「読み物」向けに、ゆったりした行間・見出し装飾・
 * 本文中に大きく入る写真・キャプションで表示する。
 * スタイルは index.css の .report-article を参照。
 */

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import type { Article } from '@cc-saas/shared';

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

/** 文字サイズ（電子回覧板の切替と同じ3段階。既定は大きめ） */
type FontSize = 'small' | 'medium' | 'large';
const FONT_PX: Record<FontSize, number> = { small: 16, medium: 18, large: 20 };
const FONT_SIZE_STORAGE_KEY = 'report-font-size';

function loadFontSize(): FontSize {
  try {
    const v = localStorage.getItem(FONT_SIZE_STORAGE_KEY);
    if (v === 'small' || v === 'medium' || v === 'large') return v;
  } catch {
    // localStorage が使えない環境では既定値
  }
  return 'large';
}

function formatEventDate(d?: string | null): string | null {
  if (!d) return null;
  const dt = new Date(d + 'T00:00:00');
  if (isNaN(dt.getTime())) return d;
  return `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日（${WEEK[dt.getDay()]}）`;
}

interface EventReportViewProps {
  article: Article;
  /** 文字サイズ切替を表示するか（既定 true。管理画面のプレビューなどで隠したい場合に false） */
  showFontSizeControl?: boolean;
}

const EventReportView: React.FC<EventReportViewProps> = ({ article, showFontSizeControl = true }) => {
  const [fontSize, setFontSize] = useState<FontSize>(loadFontSize);
  const heroUrl =
    article.thumbnail_url ||
    article.attachments?.find((a: any) => a.type === 'image')?.url ||
    null;
  const dateLabel = formatEventDate(article.event_date);

  const changeFontSize = (size: FontSize) => {
    setFontSize(size);
    try {
      localStorage.setItem(FONT_SIZE_STORAGE_KEY, size);
    } catch {
      // 保存できなくても表示は切り替わる
    }
  };

  return (
    // 文字サイズは基準サイズ(font-size)を変えるだけで、本文・見出し・キャプションは em 指定なので連動して拡大する
    <article className="report-article" style={{ fontSize: `${FONT_PX[fontSize]}px` }}>
      {showFontSizeControl && (
        <div className="report-fontsize" role="group" aria-label="文字サイズ">
          <span className="report-fontsize-label">文字サイズ</span>
          {(['small', 'medium', 'large'] as const).map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => changeFontSize(size)}
              className={fontSize === size ? 'active' : ''}
              aria-pressed={fontSize === size}
              title={size === 'small' ? '小' : size === 'medium' ? '中' : '大'}
            >
              <span style={{ fontSize: size === 'small' ? '14px' : size === 'medium' ? '18px' : '22px' }}>あ</span>
            </button>
          ))}
        </div>
      )}
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
