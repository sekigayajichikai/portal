/**
 * 予定の個別ページ（/?event=<予定カードID>）と記事の個別ページ（/?article=<記事ID>）
 *
 * 週次LINE配信の「⭐今週の一押し」のリンク先。一押しは チラシPDF → 記事(/?article=) → 予定ページ(/?event=)
 * の順でいちばん直接的な先にリンクするので、予定ページは「PDFも記事も無い予定」のときの受け皿。
 * 予定カードの内容（日時・場所・主催・対象・費用・紹介文）に加えて、
 * リンク記事の本文と出典PDF（チラシ）をこの1ページで見られるようにする。
 * 公開中の号に紐づくカードだけ表示する（下書きの号は「見つかりません」）。
 *
 * 仕様: docs/週次配信.md
 */

import React, { useEffect, useState } from 'react';
import { getPublishedEventCardById, getArticleById, type PublicEventCard, type Article } from '@cc-saas/shared';
import { Loader2, Calendar, Clock, MapPin, Users, FileText, ChevronLeft } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
const CATEGORY_LABEL: Record<string, string> = {
  reserve: '要予約',
  recurring: '連続・定期',
  open: '当日参加OK',
};

/** "2026-09-27" → "9月27日(土)" */
function formatDate(s: string | null): string {
  if (!s) return '日付未定';
  const d = new Date(s + 'T00:00:00');
  return `${d.getMonth() + 1}月${d.getDate()}日(${WEEK[d.getDay()]})`;
}

/** 記事本文から定型文を除く（CircularsView と同じ） */
const displayContent = (a: Article) =>
  (a.content || '')
    .replace(/詳細は添付のPDFファイルをご覧ください。?\n?/g, '')
    .replace(/詳細はPDFをご覧ください。?\n?/g, '')
    .replace(/添付PDFを参照してください。?\n?/g, '')
    .trim();

/** 記事1本の本文（見出し・扉画像・本文・添付PDF）。予定ページと記事ページで共用 */
const ArticleBody: React.FC<{ article: Article }> = ({ article }) => {
  const thumbUrl = article.thumbnail_url || article.attachments?.find((a: any) => a.type === 'image')?.url;
  const pdfs = article.attachments?.filter((a: any) => a.type === 'pdf') || [];
  return (
    <div className="bg-white rounded-2xl shadow border border-slate-200 p-5">
      <h2 className="text-lg font-bold text-slate-800 mb-3 leading-snug">{article.title}</h2>
      {thumbUrl && (
        <div className="mb-4 rounded-lg overflow-hidden bg-slate-100">
          <img src={thumbUrl} alt="" className="w-full h-auto max-h-72 object-contain" />
        </div>
      )}
      <div className="prose-compact max-w-none text-slate-700">
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{displayContent(article)}</ReactMarkdown>
      </div>
      {pdfs.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {pdfs.map((att: any, i: number) => (
            <a
              key={i}
              href={att.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm hover:bg-blue-100 transition"
            >
              📄 PDF: {att.label || '添付資料'}
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * 記事の個別ページ（/?article=<記事ID>）
 *
 * 週次配信の一押しが記事由来のとき、間に画面を挟まず記事へ直接飛ぶ先。
 * 公開範囲が public / members-only の記事だけ表示する。
 */
export const ArticleView: React.FC<{ id: string }> = ({ id }) => {
  const [article, setArticle] = useState<Article | null | undefined>(undefined);

  useEffect(() => {
    (async () => {
      try {
        const a = await getArticleById(id);
        setArticle(a && (a.visibility === 'public' || a.visibility === 'members-only') ? a : null);
      } catch {
        setArticle(null);
      }
    })();
  }, [id]);

  if (article === undefined) {
    return (
      <div className="flex items-center justify-center gap-2 text-slate-400 text-sm py-16">
        <Loader2 size={16} className="animate-spin" /> 読み込み中...
      </div>
    );
  }
  if (article === null) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <p className="text-slate-600 font-medium">この記事は見つかりませんでした。</p>
        <p className="text-sm text-slate-400 mt-2">公開が終了したか、リンクが間違っている可能性があります。</p>
        <a href="/" className="inline-block mt-6 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold">
          回覧板トップへ
        </a>
      </div>
    );
  }
  return (
    <div className="max-w-xl mx-auto px-4 pb-16">
      <div className="py-3">
        <a href="/" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ChevronLeft size={16} /> 回覧板トップ
        </a>
      </div>
      <ArticleBody article={article} />
      <div className="text-center mt-8">
        <a href="/" className="text-sm text-blue-600 font-medium">
          他の予定・回覧板を見る →
        </a>
      </div>
    </div>
  );
};

interface EventCardViewProps {
  id: string;
}

const EventCardView: React.FC<EventCardViewProps> = ({ id }) => {
  const [card, setCard] = useState<PublicEventCard | null | undefined>(undefined);
  const [article, setArticle] = useState<Article | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const c = await getPublishedEventCardById(id);
        setCard(c);
        if (c?.linked_article_id) {
          try {
            const a = await getArticleById(c.linked_article_id);
            if (a && (a.visibility === 'public' || a.visibility === 'members-only')) setArticle(a);
          } catch {
            /* 記事が取れなくても予定は表示する */
          }
        }
      } catch {
        setCard(null);
      }
    })();
  }, [id]);

  if (card === undefined) {
    return (
      <div className="flex items-center justify-center gap-2 text-slate-400 text-sm py-16">
        <Loader2 size={16} className="animate-spin" /> 読み込み中...
      </div>
    );
  }

  if (card === null) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <p className="text-slate-600 font-medium">この予定は見つかりませんでした。</p>
        <p className="text-sm text-slate-400 mt-2">公開が終了したか、リンクが間違っている可能性があります。</p>
        <a href="/" className="inline-block mt-6 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold">
          回覧板トップへ
        </a>
      </div>
    );
  }

  const pdfUrl = card.source_pdf_url || card.newsletter_pdf_url || null;
  const pdfLabel = card.source_pdf_url ? card.source_pdf_label || 'チラシ' : card.newsletter_title || '回覧板';
  const meta = [card.target_audience, card.fee].filter(Boolean).join('・');

  return (
    <div className="max-w-xl mx-auto px-4 pb-16">
      <div className="py-3">
        <a href="/" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ChevronLeft size={16} /> 回覧板トップ
        </a>
      </div>

      {/* 予定の要約カード */}
      <div className="bg-white rounded-2xl shadow border border-slate-200 p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs mb-2">
          {card.weekly_topic && (
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">⭐ 今週の一押し</span>
          )}
          {card.category && CATEGORY_LABEL[card.category] && (
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{CATEGORY_LABEL[card.category]}</span>
          )}
          {card.newsletter_title && <span className="text-slate-400">📰 {card.newsletter_title} より</span>}
        </div>
        <h1 className="text-xl font-bold text-slate-800 leading-snug">{card.title}</h1>
        {card.description && <p className="text-slate-600 mt-2 leading-relaxed">{card.description}</p>}

        <dl className="mt-4 space-y-1.5 text-sm text-slate-700">
          <div className="flex items-start gap-2">
            <Calendar size={16} className="mt-0.5 text-blue-600 shrink-0" />
            <span className="font-bold text-blue-700">{formatDate(card.event_date)}</span>
          </div>
          {card.event_time && (
            <div className="flex items-start gap-2">
              <Clock size={16} className="mt-0.5 text-slate-400 shrink-0" />
              <span>{card.event_time}</span>
            </div>
          )}
          {card.event_location && (
            <div className="flex items-start gap-2">
              <MapPin size={16} className="mt-0.5 text-slate-400 shrink-0" />
              <span>{card.event_location}</span>
            </div>
          )}
          {(meta || card.organizer) && (
            <div className="flex items-start gap-2">
              <Users size={16} className="mt-0.5 text-slate-400 shrink-0" />
              <span>
                {meta}
                {meta && card.organizer && '　'}
                {card.organizer && <span className="text-slate-500">主催: {card.organizer}</span>}
              </span>
            </div>
          )}
          {card.apply_deadline && (
            <div className="flex items-start gap-2">
              <span className="w-4 text-center shrink-0">⏰</span>
              <span>申込締切 {formatDate(card.apply_deadline)}</span>
            </div>
          )}
        </dl>

        {pdfUrl && (
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition"
          >
            <FileText size={18} /> {card.source_pdf_url ? `チラシ（PDF）を開く` : `${pdfLabel}のPDFを開く`}
          </a>
        )}
        {card.source_pdf_url && card.source_pdf_label && (
          <p className="text-center text-xs text-slate-400 mt-1.5">出典: {card.source_pdf_label}</p>
        )}
      </div>

      {/* リンク記事の本文 */}
      {article && (
        <div className="mt-4">
          <ArticleBody article={article} />
        </div>
      )}

      <div className="text-center mt-8">
        <a href="/" className="text-sm text-blue-600 font-medium">
          他の予定・回覧板を見る →
        </a>
      </div>
    </div>
  );
};

export default EventCardView;
