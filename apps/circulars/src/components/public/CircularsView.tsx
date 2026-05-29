/**
 * 会員向け電子回覧板閲覧コンポーネント
 *
 * タイムライン型UI。記事の長さに応じて表示方法を自動切替。
 * 短い記事はインライン完結、中程度はアコーディオン展開、長い記事はモーダル。
 * PDF資料は下部にサムネイル付きグリッドで分離表示。
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Newsletter, Article, getNewsletters, getArticlesByNewsletterId, getPublishers, getEventCards, toggleLike, getLikeCounts, getMyLikes, type Publisher, type EventCard } from '@cc-saas/shared';
import { FileText, AlertCircle, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { PdfThumbnail } from './PdfThumbnail';

interface CircularsViewProps {
  isSimpleMode: boolean;
  previewNewsletterId?: string;
}

const CATEGORY_ICONS: Record<string, string> = {
  event: '🎉', admin: '📋', safety: '🛡️', culture: '📚', column: '💡', facility: '🏠', info: '📢',
};

const CATEGORY_COLORS: Record<string, string> = {
  event: 'bg-blue-100 text-blue-700',
  admin: 'bg-gray-100 text-gray-700',
  safety: 'bg-red-100 text-red-700',
  culture: 'bg-purple-100 text-purple-700',
  column: 'bg-cyan-100 text-cyan-700',
  facility: 'bg-orange-100 text-orange-700',
  info: 'bg-yellow-100 text-yellow-700',
};

const CATEGORY_LABELS: Record<string, string> = {
  event: 'イベント', notice: 'お知らせ', meeting: '会議',
  admin: '運営', safety: '防犯・防災', culture: '文化・教養', column: 'コラム・読み物', facility: '施設', info: 'お知らせ',
};

const PRIORITY_LABELS: Record<string, string> = {
  high: '重要', medium: '通常', low: '参考',
};

/** 記事の長さ判定 */
type ArticleLength = 'short' | 'medium' | 'long';
/** 表示用の本文を取得（定型文を除去） */
const getDisplayContent = (article: Article): string => {
  return article.content
    .replace(/詳細は添付のPDFファイルをご覧ください。?\n?/g, '')
    .replace(/詳細はPDFをご覧ください。?\n?/g, '')
    .replace(/添付PDFを参照してください。?\n?/g, '')
    .trim();
};

/** PDFサムネイル自動アスペクト比判定 */
const PdfThumbnailAuto: React.FC<{ pdf: { url: string; thumbnail: string } }> = ({ pdf }) => {
  const [isLandscape, setIsLandscape] = useState(false);

  return (
    <div className={`${isLandscape ? 'aspect-[7/5]' : 'aspect-[5/7]'} bg-white rounded-lg overflow-hidden shadow-[6px_6px_9px_rgba(0,0,0,0.15)] group-hover:shadow-[8px_8px_16px_rgba(0,0,0,0.2)]`}>
      {pdf.thumbnail && pdf.thumbnail !== 'failed' ? (
        <img
          src={pdf.thumbnail}
          alt=""
          className="w-full h-full object-cover"
          onLoad={(e) => {
            const img = e.currentTarget;
            setIsLandscape(img.naturalWidth > img.naturalHeight);
          }}
        />
      ) : pdf.thumbnail === 'failed' || pdf.thumbnail === 'pending' ? (
        <div className="w-full h-full bg-slate-100 flex items-center justify-center">
          <FileText size={40} className="text-slate-400" />
        </div>
      ) : (
        <PdfThumbnail url={pdf.url} className="w-full h-full" />
      )}
    </div>
  );
};

const getArticleLength = (article: Article): ArticleLength => {
  const len = getDisplayContent(article).length;
  if (len <= 100) return 'short';
  if (len <= 300) return 'medium';
  return 'long';
};

const CircularsView: React.FC<CircularsViewProps> = ({ isSimpleMode, previewNewsletterId }) => {
  const [newsletters, setNewsletters] = useState<(Newsletter & { article_count: number })[]>([]);
  const [selectedNewsletterId, setSelectedNewsletterId] = useState<string | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [expandedArticles, setExpandedArticles] = useState<Set<string>>(new Set());
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [myLikes, setMyLikes] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingArticles, setIsLoadingArticles] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publisherOrder, setPublisherOrder] = useState<Record<string, number>>({});
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large'>('large');

  // 発行元の表示順を取得
  useEffect(() => {
    getPublishers().then((pubs) => {
      const order: Record<string, number> = {};
      pubs.forEach((p) => { order[p.name] = (p as any).display_order ?? 100; });
      setPublisherOrder(order);
    }).catch(() => {});
  }, []);

  // Newsletter取得
  useEffect(() => {
    const fetchNewsletters = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = previewNewsletterId
          ? await getNewsletters()
          : await getNewsletters('published');
        setNewsletters(data);
        if (previewNewsletterId) {
          setSelectedNewsletterId(previewNewsletterId);
        } else if (data.length > 0 && !selectedNewsletterId) {
          setSelectedNewsletterId(data[0].id);
        }
      } catch (err: any) {
        setError('電子回覧板の読み込みに失敗しました');
      } finally {
        setIsLoading(false);
      }
    };
    fetchNewsletters();
  }, []);

  // 記事取得
  useEffect(() => {
    const fetchArticles = async () => {
      if (!selectedNewsletterId) { setArticles([]); return; }
      setIsLoadingArticles(true);
      setError(null);
      try {
        const data = await getArticlesByNewsletterId(selectedNewsletterId);
        const visible = data.filter(a => a.visibility === 'public' || a.visibility === 'members-only');

        const sorted = visible.sort((a, b) => {
          const po = { high: 0, medium: 1, low: 2 };
          const pd = po[a.priority] - po[b.priority];
          if (pd !== 0) return pd;
          if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
          if (a.display_order !== null && b.display_order !== null) return a.display_order - b.display_order;
          if (a.display_order !== null) return -1;
          if (b.display_order !== null) return 1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
        setArticles(sorted);
        // いいねデータ取得
        const ids = sorted.map(a => a.id);
        if (ids.length > 0) {
          getLikeCounts(ids).then(setLikeCounts).catch(() => {});
          getMyLikes(ids).then(setMyLikes).catch(() => {});
        }
      } catch {
        setError('記事の読み込みに失敗しました');
      } finally {
        setIsLoadingArticles(false);
      }
    };
    fetchArticles();
  }, [selectedNewsletterId]);

  const selectedNewsletter = useMemo(
    () => newsletters.find(n => n.id === selectedNewsletterId),
    [newsletters, selectedNewsletterId]
  );

  // PDFを「PDFで読む」(source)と「回覧板PDF」(attachment)に分離
  const { sourcePdfs, attachmentPdfs } = useMemo(() => {
    const sourceMap = new Map<string, { url: string; label: string; publisher: string; thumbnail: string }>();
    const attachMap = new Map<string, { url: string; label: string; publisher: string; thumbnail: string }>();

    const pdfUrls: any[] = (selectedNewsletter as any)?.source_pdf_urls || [];
    pdfUrls.forEach((entry: any) => {
      const url = typeof entry === 'string' ? entry : entry.url;
      const label = typeof entry === 'string' ? '' : (entry.label || '');
      const publisher = typeof entry === 'string' ? '' : (entry.publisher || '');
      const thumbnail = typeof entry === 'string' ? '' : (entry.thumbnail || '');
      const type = typeof entry === 'string' ? 'source' : (entry.type || 'source');
      const target = type === 'source' ? sourceMap : attachMap;
      if (url && !target.has(url)) {
        target.set(url, { url, label: label || url.split('/').pop() || 'PDF', publisher, thumbnail });
      }
    });

    return {
      sourcePdfs: Array.from(sourceMap.values()),
      attachmentPdfs: Array.from(attachMap.values()),
    };
  }, [articles, selectedNewsletter, publisherOrder]);

  const officialArticles = articles.filter(a => a.article_type === 'official');
  const localInfoArticles = articles.filter(a => a.article_type === 'local-info');

  // イベントカード（DBから取得）
  const [eventCards, setEventCards] = useState<EventCard[]>([]);

  useEffect(() => {
    if (!selectedNewsletterId) return;
    getEventCards(selectedNewsletterId).then(cards => {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      // 過ぎていないイベントのみ表示
      const upcoming = cards.filter(c => {
        if (!c.event_date) return true; // 日付未定は表示
        return new Date(c.event_date) >= now;
      });
      setEventCards(upcoming);
    }).catch(() => setEventCards([]));
  }, [selectedNewsletterId]);

  const [carouselIndex, setCarouselIndex] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);

  const [collapsingId, setCollapsingId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    if (expandedArticles.has(id)) {
      // 閉じる: まずアニメーション開始
      setCollapsingId(id);
      setTimeout(() => {
        setExpandedArticles(prev => { const next = new Set(prev); next.delete(id); return next; });
        setCollapsingId(null);
      }, 300);
    } else {
      setExpandedArticles(prev => new Set(prev).add(id));
    }
  };

  /** カルーセルからタップ → 該当記事を展開してスクロール */
  const handleLike = async (articleId: string) => {
    try {
      const result = await toggleLike(articleId);
      setLikeCounts(prev => ({ ...prev, [articleId]: result.count }));
      setMyLikes(prev => {
        const next = new Set(prev);
        if (result.liked) next.add(articleId); else next.delete(articleId);
        return next;
      });
    } catch { }
  };

  const scrollToArticle = (articleId: string) => {
    setExpandedArticles(prev => new Set(prev).add(articleId));
    setTimeout(() => {
      const el = document.getElementById(`article-${articleId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  /** タイムラインカード */
  const renderArticleCard = (article: Article) => {
    const length = getArticleLength(article);
    const isExpanded = expandedArticles.has(article.id);
    const thumbUrl = article.thumbnail_url || article.attachments?.find((a: any) => a.type === 'image')?.url;
    const fit = article.thumbnail_fit === 'contain' ? 'object-contain' : 'object-cover';
    const images = article.attachments?.filter((a: any) => a.type === 'image') || [];

    return (
      <div
        id={`article-${article.id}`}
        key={article.id}
        className={`rounded-xl shadow-sm border overflow-hidden ${
          article.priority === 'high'
            ? 'bg-white border-slate-200 border-l-4 border-l-red-500'
            : article.source && !article.source.includes('関ヶ谷だより') && !article.source.includes('会報ふれあい')
            ? 'bg-slate-50 border-slate-200 border-l-4 border-l-slate-300'
            : 'bg-white border-slate-200'
        }`}
      >
        {/* 画像表示 */}
        {thumbUrl && (
          article.image_display === 'tall' ? (
            <div className="w-full bg-slate-100 cursor-pointer flex justify-center" onClick={() => setLightboxUrl(thumbUrl)}>
              <img src={thumbUrl} alt="" className="w-full sm:max-w-md h-auto" />
              <p className="text-center text-xs text-slate-400 py-1">タップで拡大</p>
            </div>
          ) : article.image_display === 'full' ? (
            <div className="w-full bg-slate-100 max-h-64 overflow-hidden flex items-center justify-center">
              <img src={thumbUrl} alt="" className="w-full h-auto object-contain max-h-64" />
            </div>
          ) : (
            <div className="w-full h-48 bg-slate-100 overflow-hidden">
              <img src={thumbUrl} alt="" className={`w-full h-full ${fit}`} />
            </div>
          )
        )}

        <div className="p-5">
          {/* カテゴリ + 優先度 + タグバッジ */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {(
              <span className={`text-[0.85em] px-3 py-1 rounded-full font-medium ${CATEGORY_COLORS[article.category] || 'bg-gray-100 text-gray-700'}`}>
                {CATEGORY_ICONS[article.category] || '📄'} {CATEGORY_LABELS[article.category] || article.category}
              </span>
            )}
            {article.priority === 'high' && (
              <span className="text-[0.85em] px-3 py-1 rounded-full font-bold bg-red-500 text-white">
                {PRIORITY_LABELS.high}
              </span>
            )}
            {article.tags?.map((tag, i) => (
              <span key={i} className="text-[0.85em] px-3 py-1 rounded-full font-medium bg-pink-100 text-pink-700">
                {tag}
              </span>
            ))}
            {article.source && !article.source.includes('関ヶ谷だより') && !article.source.includes('会報ふれあい') && (
              <span className="text-[0.8em] text-slate-400">
                📍 {article.source}
              </span>
            )}
          </div>

          {/* タイトル */}
          <h3 className="font-bold text-slate-800 text-[1.2em] mb-2">{article.title}</h3>

          {/* 本文表示（長さに応じて切替） */}
          {length === 'short' ? (
            // 短い記事: 本文をそのまま表示
            <div className="prose-compact max-w-none text-slate-700">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                {getDisplayContent(article)}
              </ReactMarkdown>
              {/* 添付PDF */}
              {article.attachments?.filter((a: any) => a.type === 'pdf').length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {article.attachments.filter((a: any) => a.type === 'pdf').map((att: any, i: number) => (
                    <a key={i} href={att.url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-[0.85em] hover:bg-blue-100 transition">
                      📄 PDF: {att.label || '添付資料'}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ) : (
            // 中・長い記事: 要約 + アコーディオン展開
            <>
              {!isExpanded && collapsingId !== article.id && (
                <p className="text-slate-600 line-clamp-2 mb-2">{article.summary}</p>
              )}
              {(isExpanded || collapsingId === article.id) && (
                <div className={`prose-compact max-w-none text-slate-700 mb-3 overflow-hidden transition-all duration-300 ease-in-out ${
                  collapsingId === article.id ? 'max-h-0 opacity-0' : 'max-h-[5000px] opacity-100'
                }`}>
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                    {getDisplayContent(article)}
                  </ReactMarkdown>
                  {/* サムネイル以外の画像を表示（2枚以上の場合のみ） */}
                  {images.length > 1 && (
                    <div className="flex gap-2 flex-wrap mt-3">
                      {images.filter((img: any) => img.url !== thumbUrl).map((img: any, i: number) => (
                        <a key={i} href={img.url} target="_blank" rel="noopener noreferrer"
                          className="block rounded-lg overflow-hidden border border-slate-200">
                          <img src={img.url} alt="" className="w-32 h-auto" />
                        </a>
                      ))}
                    </div>
                  )}
                  {/* 添付PDF */}
                  {article.attachments?.filter((a: any) => a.type === 'pdf').length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {article.attachments.filter((a: any) => a.type === 'pdf').map((att: any, i: number) => (
                        <a key={i} href={att.url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-[0.85em] hover:bg-blue-100 transition">
                          📄 PDF: {att.label || '添付資料'}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <button
                onClick={() => toggleExpand(article.id)}
                className="flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium transition"
              >
                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                {isExpanded ? '閉じる' : '続きを読む'}
              </button>
            </>
          )}

          {/* いいねボタン */}
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100">
            <button
              onClick={(e) => { e.stopPropagation(); handleLike(article.id); }}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 hover:bg-slate-200 transition-all active:scale-95"
            >
              <span className={`text-lg ${myLikes.has(article.id) ? 'text-blue-600' : 'grayscale opacity-60'}`}>👍</span>
              <span className={`font-medium ${myLikes.has(article.id) ? 'text-blue-600' : 'text-slate-500'}`}>
                いいね
              </span>
            </button>
            {(likeCounts[article.id] || 0) > 0 && (
              <span className="text-slate-500">
                {likeCounts[article.id]}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`space-y-5 px-4 ${fontSize === 'small' ? 'text-[14px]' : fontSize === 'large' ? 'text-[20px]' : 'text-[16px]'}`}>
      {/* ヘッダー */}
      <div className={`p-6 rounded-2xl ${
        isSimpleMode
          ? 'bg-blue-50 border border-blue-200'
          : 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white'
      }`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <h1 className={`text-2xl font-bold flex items-center gap-2 ${isSimpleMode ? 'text-slate-800' : ''}`}>
              <FileText size={24} />
              関ヶ谷自治会 電子回覧板
            </h1>
            <p className={`text-sm mt-1 ${isSimpleMode ? 'text-slate-600' : 'text-white/80'}`}>
              自治会の回覧板をスマホやパソコンでご覧いただけます。
            </p>
            {selectedNewsletter && (
              <div className={`text-sm mt-2 space-y-0.5 ${isSimpleMode ? 'text-slate-500' : 'text-white/75'}`}>
                <p>「関ヶ谷だより」と「会報ふれあい」の内容は記事形式で掲載しています。</p>
                <p>その他の配布物はPDFでそのままご覧いただけます。</p>
              </div>
            )}
          </div>
          {/* 文字サイズ切替 */}
          <div className={`flex items-center gap-1 rounded-lg p-1 shrink-0 ${isSimpleMode ? 'bg-white/80' : 'bg-white/20'}`}>
            {(['small', 'medium', 'large'] as const).map((size) => (
              <button
                key={size}
                onClick={() => setFontSize(size)}
                className={`w-9 h-9 flex items-center justify-center rounded-md transition ${
                  fontSize === size
                    ? isSimpleMode ? 'bg-blue-600 text-white' : 'bg-white text-blue-700'
                    : isSimpleMode ? 'text-slate-600 hover:bg-slate-200' : 'text-white/70 hover:bg-white/10'
                }`}
              >
                <span style={{ fontSize: size === 'small' ? '14px' : size === 'medium' ? '18px' : '22px', fontWeight: 'bold' }}>あ</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* エラー */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle size={20} className="text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Newsletter選択 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={24} className="animate-spin text-blue-600" />
          <span className="ml-2 text-slate-600">読み込み中...</span>
        </div>
      ) : newsletters.length > 0 ? (
        <div>
          <label className="font-medium text-slate-700 mb-1 block">回覧板を選択</label>
          <div className="relative">
            <select
              value={selectedNewsletterId || ''}
              onChange={(e) => setSelectedNewsletterId(e.target.value)}
              className="w-full p-3 pr-10 border border-slate-300 rounded-xl bg-white text-slate-800 font-medium appearance-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {newsletters.map(nl => (
                <option key={nl.id} value={nl.id}>
                  {nl.title} ({nl.article_count}件)
                </option>
              ))}
            </select>
            <ChevronDown size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-slate-500">回覧板がありません</div>
      )}

      {/* 記事読み込み中 */}
      {isLoadingArticles ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-blue-600" />
          <span className="ml-2 text-slate-600">記事を読み込み中...</span>
        </div>
      ) : (
        <>
          {/* 今後のイベント（イベントカードから表示） */}
          {eventCards.length > 0 && (
            <div>
              <h2 className="font-bold text-slate-700 mb-2 flex items-center gap-2">
                🗓️ 今後のイベント
              </h2>
              <div ref={carouselRef} className="flex gap-3 overflow-x-auto pt-1 pb-3 -mx-1 px-1 snap-x scroll-smooth">
                {eventCards.map((card, idx) => {
                  const d = card.event_date ? new Date(card.event_date) : null;
                  const dayLabel = d ? `${d.getMonth() + 1}/${d.getDate()}` : '';
                  const dayOfWeek = d ? ['日','月','火','水','木','金','土'][d.getDay()] : '';

                  return (
                    <button
                      key={`ev-${card.id}`}
                      onClick={() => { if (card.linked_article_id) scrollToArticle(card.linked_article_id); }}
                      className={`shrink-0 w-52 rounded-xl border-2 p-4 text-left transition-all snap-center ${
                        idx === carouselIndex
                          ? 'border-blue-500 bg-blue-50 shadow-md scale-[1.02]'
                          : 'border-slate-200 bg-white hover:border-blue-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[1.2em] font-bold text-blue-600">{dayLabel || '日付未定'}</span>
                        {dayOfWeek && <span className="text-[0.8em] text-slate-500">({dayOfWeek})</span>}
                      </div>
                      {card.event_time && (
                        <p className="text-[0.8em] text-slate-500 mb-1">{card.event_time}</p>
                      )}
                      <p className="font-medium text-slate-800 line-clamp-2">{card.title}</p>
                      {card.event_location && (
                        <p className="text-[0.8em] text-slate-400 mt-1 truncate">📍 {card.event_location}</p>
                      )}
                    </button>
                  );
                })}
              </div>
              {/* ドットインジケーター */}
              {eventCards.length > 1 && (
                <div className="flex justify-center gap-1.5 mt-1">
                  {eventCards.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setCarouselIndex(idx);
                        if (carouselRef.current) {
                          const card = carouselRef.current.children[idx] as HTMLElement;
                          if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                        }
                      }}
                      className={`w-2 h-2 rounded-full transition ${
                        idx === carouselIndex ? 'bg-blue-500' : 'bg-slate-300'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 自治会のお知らせ（タイムライン） */}
          {officialArticles.length > 0 && (
            <div className="space-y-4">
              {officialArticles.map(renderArticleCard)}
            </div>
          )}


          {/* PDFで読む（記事化済みの元PDF） */}
          {sourcePdfs.length > 0 && (
            <>
              <div className="flex items-center gap-3 pt-4">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="font-medium text-slate-500">記事をPDF版で読む（{sourcePdfs.length}件）</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>
              <div className={`grid gap-4 ${fontSize === 'large' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
                {sourcePdfs.map((pdf, i) => (
                  <a key={`src-${i}`} href={pdf.url} target="_blank" rel="noopener noreferrer"
                    className="group block hover:scale-[1.02] transition-all">
                    <PdfThumbnailAuto pdf={pdf} />
                    <div className="pt-2 px-0.5">
                      <p className="font-medium text-slate-700 line-clamp-2">
                        <span className="text-slate-400 text-[0.9em]">{i + 1}/{sourcePdfs.length}</span>{' '}{pdf.label}
                      </p>
                      {pdf.publisher && <p className="text-xs text-slate-500 mt-0.5 truncate">{pdf.publisher}</p>}
                    </div>
                  </a>
                ))}
              </div>
            </>
          )}

          {/* 回覧板PDF（近隣のお知らせ等） */}
          {attachmentPdfs.length > 0 && (
            <>
              <div className="flex items-center gap-3 pt-4">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="font-medium text-slate-500">回覧板PDF（{attachmentPdfs.length}件）</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>
              <div className={`grid gap-4 ${fontSize === 'large' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
                {attachmentPdfs.map((pdf, i) => (
                  <a key={`att-${i}`} href={pdf.url} target="_blank" rel="noopener noreferrer"
                    className="group block hover:scale-[1.02] transition-all">
                    <PdfThumbnailAuto pdf={pdf} />
                    <div className="pt-2 px-0.5">
                      <p className="font-medium text-slate-700 line-clamp-2">
                        <span className="text-slate-400 text-sm">{i + 1}/{attachmentPdfs.length}</span>{' '}{pdf.label}
                      </p>
                      {pdf.publisher && <p className="text-xs text-slate-500 mt-0.5 truncate">{pdf.publisher}</p>}
                    </div>
                  </a>
                ))}
              </div>
            </>
          )}

          {/* 記事なし */}
          {articles.length === 0 && !isLoadingArticles && selectedNewsletterId && (
            <div className="text-center py-12 text-slate-500">
              <FileText size={48} className="mx-auto text-slate-300 mb-3" />
              <p>記事がありません</p>
            </div>
          )}
        </>
      )}

      {/* ライトボックス（タップ拡大） */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-2"
          onClick={() => setLightboxUrl(null)}
        >
          <div className="max-w-full max-h-full overflow-auto">
            <img src={lightboxUrl} alt="" className="max-w-none" style={{ maxHeight: '90vh' }} />
          </div>
        </div>
      )}
    </div>
  );
};

export default CircularsView;
