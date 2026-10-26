/**
 * 電子回覧板一覧コンポーネント
 *
 * 保存された電子回覧板の一覧を表示し、選択すると記事を表示します。
 */

import { PDFJS_DOC_OPTIONS } from '@/lib/pdfConfig';
import React, { useEffect, useState } from 'react';
import { getNewsletters, getArticlesByNewsletterId, deleteNewsletter, deleteArticle, addArticlesToNewsletter, publishNewsletter, unpublishNewsletter, duplicateNewsletterAsDraft, removePdfUrlFromNewsletter, updatePdfLabel, getPublisherNames, getAdminEventCards, addEventCard, updateEventCard, deleteEventCard, requestReview, cancelReview, type AdminEventCard } from '@cc-saas/shared';
import { Newsletter, Article } from '@cc-saas/shared/types';
import { FileText, Calendar, ChevronRight, ChevronUp, ChevronDown, GripVertical, ArrowLeft, Loader2, AlertCircle, Edit, Trash2, Scissors, Globe, EyeOff, Copy, Eye, X, Smartphone, Plus, Sparkles, ClipboardCheck, CheckCircle2, MessageSquareWarning, Pencil, Send } from 'lucide-react';
import { ArticleList } from './ArticleList';
import { EventCandidateDialog } from './EventCandidateDialog';
import { EventCardEditDialog } from './EventCardEditDialog';
import { ImageCropPage } from './ImageCropPage';
import { ArticleCropPage } from './ArticleCropPage';
import CircularsView from '../public/CircularsView';
import { MOCK_CATEGORIES } from '@cc-saas/shared/constants';
import { showToast, showError, appConfirm, appPrompt, ProcessingIndicator } from '@/components/ui/feedback';
import { publicSiteUrl } from '@/lib/siteUrl';

/**
 * 回覧板一覧から除外する号のタイトル。
 * 「関ヶ谷レポート」は記事の器（常設枠）で、管理は ReportBoard が担当する。
 * ここに出すと号ごと削除できてしまい、レポート記事が巻き添えで消えるため除外する。
 */
const EXCLUDED_NEWSLETTER_TITLES = ['関ヶ谷レポート'];

/** 回覧板として扱う号だけを取得する（レポート枠を除外） */
async function loadCircularNewsletters() {
  const all = await getNewsletters();
  return all.filter((n) => !EXCLUDED_NEWSLETTER_TITLES.includes(n.title));
}

/**
 * NewsletterListコンポーネントのProps
 */
interface NewsletterListProps {
  onEditNewsletter?: (newsletter: Newsletter & { article_count: number }) => void;
  /** PDF追加キャンセル時に戻る先のNewsletter ID */
  returnToNewsletterId?: string | null;
}

/**
 * NewsletterListコンポーネント
 *
 * 保存された電子回覧板一覧と、選択した電子回覧板の記事を表示します。
 */
/** 登録済みPDFの1件（画面表示用） */
interface PdfEntry {
  url: string;
  label: string;
  publisher: string;
  filename: string;
  thumbnail: string;
  /** 'source'=記事のPDF版（PDF版で読む） / 'attachment'=回覧板PDF（PDFのまま載せる） */
  type: string;
}

/**
 * newsletters.source_pdf_urls（文字列 or オブジェクトの配列）を画面に出す順に並べる。
 * 「PDF版で読む」→「回覧板PDF」の順（同じ種類の中は元の順のまま）。
 * 画面の一覧・「上へ/下へ」・ドラッグはすべてこの順の番号で扱う。
 */
function toPdfEntries(raw: any[]): PdfEntry[] {
  const entries: PdfEntry[] = raw.map((e: any) => {
    const url = typeof e === 'string' ? e : e.url;
    const label = typeof e === 'string' ? '' : (e.label || '');
    const publisher = typeof e === 'string' ? '' : (e.publisher || '');
    const thumbnail = typeof e === 'string' ? '' : (e.thumbnail || '');
    const type = typeof e === 'string' ? 'source' : (e.type || 'source');
    const filename = url.split('/').pop() || 'file.pdf';
    return { url, label, publisher, thumbnail, filename, type };
  });
  entries.sort((a, b) => (a.type === 'source' ? 0 : 1) - (b.type === 'source' ? 0 : 1));
  return entries;
}

export const NewsletterList: React.FC<NewsletterListProps> = ({ onEditNewsletter, returnToNewsletterId }) => {
  const [newsletters, setNewsletters] = useState<(Newsletter & { article_count: number })[]>([]);
  const [selectedNewsletter, setSelectedNewsletter] = useState<Newsletter | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingArticles, setIsLoadingArticles] = useState(false);
  const [error, setError] = useState<string | null>(null);


  // 画像切り抜きの状態
  const [showImageCrop, setShowImageCrop] = useState(false);

  // 公開版比較タブ
  const [viewingPublished, setViewingPublished] = useState(false);
  // 公開中の回覧板を、その場で直しているときの回覧板ID（「その場で直す」で確かめたもの）
  const [liveEditId, setLiveEditId] = useState<string | null>(null);
  const [publishedArticles, setPublishedArticles] = useState<Article[]>([]);

  // プレビュー
  const [showPreview, setShowPreview] = useState(false);

  // 担当者確認リンクのダイアログ（nullなら非表示）
  const [reviewLinkUrl, setReviewLinkUrl] = useState<string | null>(null);
  /** 号の予定カード（リンク記事の題名・号名付き。別の号の記事へのリンクも表示するため） */
  const [eventCards, setEventCards] = useState<AdminEventCard[]>([]);
  const reloadEventCards = async (newsletterId: string) => setEventCards(await getAdminEventCards({ newsletterId }));
  const [showEventExtract, setShowEventExtract] = useState(false);
  /** 編集ダイアログで開いている予定カード（予定タブ・週次配信と同じダイアログ） */
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [showArticleCrop, setShowArticleCrop] = useState(false);
  /** 記事の手動追加中（二重送信防止＋ボタン内スピナー表示） */
  const [isAddingArticle, setIsAddingArticle] = useState(false);
  /** 公開版から編集用コピーを作成中 */
  const [isDuplicating, setIsDuplicating] = useState(false);
  /** PDF関連の時間のかかる作業（サムネイル生成・削除・画像保存）の進行メッセージ（nullなら非表示） */
  const [pdfTaskMessage, setPdfTaskMessage] = useState<string | null>(null);
  /** 公開・非公開・確認依頼の送信中（二重押しを防ぎ、ボタンのアイコンを回す） */
  const [isPublishing, setIsPublishing] = useState(false);
  const [isUnpublishing, setIsUnpublishing] = useState(false);
  const [isRequestingReview, setIsRequestingReview] = useState(false);

  // 発行元リスト
  const [publisherPresets, setPublisherPresets] = useState<string[]>([]);

  /**
   * コンポーネントマウント時に電子回覧板一覧と発行元を読み込み
   */
  useEffect(() => {
    loadNewsletters();
    getPublisherNames().then(setPublisherPresets).catch(() => {});
  }, []);

  // リロード時にURLハッシュからNewsletterを復元
  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash && newsletters.length > 0 && !selectedNewsletter) {
      const target = newsletters.find(n => n.id === hash);
      if (target) handleSelectNewsletter(target);
    }
  }, [newsletters]);

  // PDF追加・バルクインポート後に戻ってきた場合、一覧を再取得して自動選択
  useEffect(() => {
    if (returnToNewsletterId && !selectedNewsletter) {
      const refresh = async () => {
        const freshList = await loadCircularNewsletters();
        setNewsletters(freshList);
        const target = freshList.find((n) => n.id === returnToNewsletterId);
        if (target) {
          handleSelectNewsletter(target);
        }
      };
      refresh();
    }
  }, [returnToNewsletterId]);

  /**
   * 電子回覧板一覧を取得
   */
  const loadNewsletters = async () => {
    setIsLoading(true);
    setError(null);
    try {
      console.log('📋 電子回覧板一覧を読み込み中…');
      const data = await loadCircularNewsletters();
      setNewsletters(data);
      console.log('✅ 電子回覧板読み込み完了:', data.length, '件');
    } catch (error: any) {
      console.error('❌ 電子回覧板読み込みエラー:', error);
      const msg = error?.message ?? '';
      const isFailedFetch = typeof msg === 'string' && msg.includes('Failed to fetch');
      const userMessage = isFailedFetch
        ? '回覧板を読み込めませんでした（接続エラー）。インターネット接続を確認して、もう一度お試しください。'
        : '回覧板を読み込めませんでした。時間をおいてもう一度お試しください。';
      setError(userMessage);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 電子回覧板選択時に記事を読み込み
   */
  const handleSelectNewsletter = async (newsletter: Newsletter & { article_count: number }) => {
    setSelectedNewsletter(newsletter);
    window.history.replaceState(null, '', `/admin#${newsletter.id}`);
    // 今月の流れガイドを開いた号に追従させる（replaceStateはhashchangeを発火しないため手動発火）
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    setIsLoadingArticles(true);
    setError(null);
    setViewingPublished(false);
    setPublishedArticles([]);
    try {
      console.log('📄 記事を読み込み中… 電子回覧板:', newsletter.title);
      const articleData = await getArticlesByNewsletterId(newsletter.id);
      setArticles(articleData);
      console.log('✅ 記事読み込み完了:', articleData.length, '件');

      // イベントカードも取得
      try { await reloadEventCards(newsletter.id); } catch { setEventCards([]); }

    } catch (error: any) {
      console.error('❌ 記事読み込みエラー:', error);
      setError('記事を読み込めませんでした。時間をおいてもう一度お試しください。');
    } finally {
      setIsLoadingArticles(false);
    }
  };

  /** ドラッグ中のPDFの位置（nullなら非ドラッグ） */
  const [dragPdfIndex, setDragPdfIndex] = useState<number | null>(null);
  /**
   * 記事一覧を畳むか。号の全体を見渡すとき、記事が多いと下の「登録済みPDF」まで遠いため（2026-10-26）。
   * ブラウザごとに覚える（localStorage。読めなくても動く）
   */
  const [articlesCollapsed, setArticlesCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('newsletter-articles-collapsed') === '1';
    } catch {
      return false;
    }
  });
  const toggleArticlesCollapsed = () =>
    setArticlesCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem('newsletter-articles-collapsed', next ? '1' : '0');
      } catch {
        /* 保存できなくても画面は動く */
      }
      return next;
    });

  /**
   * PDFの表示順を移動して保存
   *
   * 先にローカル状態へ反映してから裏でDBに保存する
   * （1回ごとに全再取得すると遅くて「効いていない」ように見えるため）
   */
  /**
   * PDFを並べ替える。from / to は **画面に出ている順**（toPdfEntries の順。PDF版で読む → 回覧板PDF）の番号。
   * 保存する source_pdf_urls も画面の順に揃える。以前は元の配列の番号で動かしていたため、
   * 2種類が混在する号では「上へ」で別のPDFが動いて見えた（2026-10-26 修正）。
   */
  const movePdfEntry = async (from: number, to: number) => {
    if (!selectedNewsletter || from === to) return;
    const raw: any[] = [...(selectedNewsletter.source_pdf_urls || [])];
    const shown = toPdfEntries(raw);
    if (from < 0 || from >= shown.length || to < 0 || to >= shown.length) return;
    const [moved] = shown.splice(from, 1);
    shown.splice(to, 0, moved);
    const rawByUrl = new Map(raw.map((e) => [typeof e === 'string' ? e : e.url, e]));
    const entries: any[] = shown.map((p) => rawByUrl.get(p.url)).filter((e) => e !== undefined);

    setSelectedNewsletter({ ...selectedNewsletter, source_pdf_urls: entries } as any);
    setNewsletters((prev) =>
      prev.map((n) => (n.id === selectedNewsletter.id ? { ...n, source_pdf_urls: entries } : n))
    );

    try {
      const { getSupabaseClient } = await import('@cc-saas/shared/services/supabaseClient');
      const supabase = getSupabaseClient();
      if (supabase) {
        await supabase.from('newsletters').update({ source_pdf_urls: entries }).eq('id', selectedNewsletter.id);
      }
    } catch (error) {
      console.error('PDF並べ替え保存エラー:', error);
      showError('並べ替えを保存できませんでした。時間をおいてもう一度お試しください。');
    }
  };

  /**
   * 一覧に戻る
   */
  const handleBackToList = () => {
    setSelectedNewsletter(null);
    setArticles([]);
    setError(null);
    window.history.replaceState(null, '', '/admin');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };

  // 記事・PDFを直せるか。下書きはいつでも。公開中は「その場で直す」を押したあとだけ
  // （以前は下書きだけで、少し足すにも非公開→確認依頼→承認→公開をやり直す必要があった）
  const canEdit = !!selectedNewsletter &&
    (selectedNewsletter.status === 'draft' || (selectedNewsletter.status === 'published' && liveEditId === selectedNewsletter.id));

  /**
   * 記事が更新された時の処理
   */
  const handleArticleUpdate = (articleId: string, updates: Partial<Article>) => {
    setArticles(prev =>
      prev.map(article =>
        article.id === articleId
          ? { ...article, ...updates, updated_at: new Date().toISOString() }
          : article
      )
    );
  };

  /**
   * 記事を削除する処理
   */
  const handleArticleDelete = async (articleId: string) => {
    console.log('📍 NewsletterList: handleArticleDelete開始:', articleId);

    try {
      // Supabaseから削除
      console.log('🗑️ Supabaseから記事を削除中…', articleId);
      await deleteArticle(articleId);
      console.log('✅ Supabaseから記事を削除しました');

      // ローカル状態から削除
      console.log('🗑️ ローカル状態から削除中…');
      setArticles(prev => {
        const filtered = prev.filter(article => article.id !== articleId);
        console.log('✅ ローカル状態から削除完了:', {
          削除前: prev.length,
          削除後: filtered.length
        });
        return filtered;
      });

      // Newsletterデータも再取得（PDF一覧の表示を維持するため）
      const freshList = await loadCircularNewsletters();
      setNewsletters(freshList);
      const updated = freshList.find((n) => n.id === selectedNewsletter?.id);
      if (updated) setSelectedNewsletter(updated as any);

      showToast('記事を削除しました');
      console.log('✅ handleArticleDelete完了');
    } catch (error: any) {
      console.error('❌ 記事削除エラー:', error);
      showError('記事を削除できませんでした。時間をおいてもう一度お試しください。');
      throw error; // エラーを再スロー
    }
  };

  /**
   * 電子回覧板を削除
   */
  const handleDeleteNewsletter = async (
    newsletter: Newsletter & { article_count: number },
    event?: React.MouseEvent
  ) => {
    // イベントのバブリングを停止（カードのクリックイベントが発火しないように）
    if (event) {
      event.stopPropagation();
    }

    // 確認ダイアログ
    const confirmed = await appConfirm({
      title: `「${newsletter.title}」を削除しますか？`,
      message: `記事数: ${newsletter.article_count}件\n記事と予定も一緒に削除します。間違えたときは「ゴミ箱」から元に戻せます。`,
      confirmLabel: '削除する',
      danger: true,
    });

    if (!confirmed) return;

    try {
      console.log('🗑️ 電子回覧板を削除中…', newsletter.id);
      await deleteNewsletter(newsletter.id);
      console.log('✅ 削除完了');

      // 一覧を再読み込み
      await loadNewsletters();

      // 削除したNewsletterが選択中だった場合、一覧に戻る
      if (selectedNewsletter && selectedNewsletter.id === newsletter.id) {
        handleBackToList();
      }

      showToast(`「${newsletter.title}」を削除しました`);
    } catch (error: any) {
      console.error('❌ 削除エラー:', error);
      showError('削除できませんでした。時間をおいてもう一度お試しください。');
    }
  };

  // 記事表示モード
  if (selectedNewsletter) {
    const nl = selectedNewsletter;
    const hasPdf = !!(nl.source_pdf_urls?.length || nl.source_pdf_url);
    const isDraft = nl.status === 'draft';
    const isPublished = nl.status === 'published';
    /**
     * ボタンの見た目は 2 種類だけにする。
     * 主ボタン: 「そのときの次の一手」1 つだけに色を付ける（確認を依頼 → 公開する）。
     * 副ボタン: 白地に枠線。幅が足りなければ折り返す（1 行に 7 個並んで潰れていた）。
     * 文言は押しても変えない（「…しています…」で幅が動くのを防ぐ）。アイコンだけ回す。
     */
    const btnSecondary = 'inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium text-sm whitespace-nowrap shrink-0 disabled:opacity-50 disabled:cursor-not-allowed transition-colors';
    const btnPrimary = 'inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-white whitespace-nowrap shrink-0 disabled:opacity-50 disabled:cursor-not-allowed transition-colors';

    /** 記事を手で 1 つ足す（下書き・その場で直すとき） */
    const handleAddArticle = async () => {
      const title = await appPrompt({
        title: '記事のタイトルを入力',
        placeholder: '例: 秋祭りのお知らせ',
        confirmLabel: '追加する',
      });
      if (!title?.trim()) return;
      setIsAddingArticle(true);
      try {
        const newArticle = {
          organization_id: import.meta.env.VITE_DEFAULT_ORGANIZATION_ID || null,
          title: title.trim(),
          category: 'info',
          article_type: 'official' as const,
          priority: 'medium' as const,
          control_date: null,
          headline: title.trim(),
          brief: '',
          summary: '',
          content: '',
          tags: [],
          visibility: 'public' as const,
          source: '',
          attachments: [],
          display_order: articles.length,
          is_pinned: false,
          thumbnail_url: null,
        };
        await addArticlesToNewsletter(nl.id, [newArticle]);
        const articleData = await getArticlesByNewsletterId(nl.id);
        setArticles(articleData);
      } catch (err: any) { console.error('記事追加エラー:', err); showError('記事を追加できませんでした。時間をおいてもう一度お試しください。'); }
      finally { setIsAddingArticle(false); }
    };

    /** 公開中のまま、その場で直す（すぐ住民に見える） */
    const handleStartLiveEdit = async () => {
      if (!(await appConfirm({
        title: '公開中の回覧板を、その場で直しますか？',
        message: '記事やPDFの追加・手直しが、すぐ住民向けページに出ます。担当者の確認は通りません。大きく作り直すときは「編集用の下書きを作る」を使ってください。',
        confirmLabel: 'その場で直す',
      }))) return;
      setLiveEditId(nl.id);
    };

    /** 公開版のコピーを下書きとして作る */
    const handleDuplicate = async () => {
      if (!(await appConfirm({
        title: '公開版のコピーを下書きとして作成しますか？',
        message: '公開中の内容はそのまま表示され続けます。',
        confirmLabel: 'コピーを作成する',
      }))) return;
      setIsDuplicating(true);
      try {
        const { newsletter: copy } = await duplicateNewsletterAsDraft(nl.id);
        const updatedList = await loadCircularNewsletters();
        setNewsletters(updatedList);
        const copyWithCount = updatedList.find((n) => n.id === copy.id);
        if (copyWithCount) {
          handleSelectNewsletter(copyWithCount);
        }
        showToast(`「${copy.title}」の編集用コピーを作成しました`);
      } catch (error) {
        console.error('コピー作成エラー:', error);
        showError('コピーを作成できませんでした。時間をおいてもう一度お試しください。');
      } finally {
        setIsDuplicating(false);
      }
    };

    /** 担当者に確認を依頼する（確認待ち中はリンクの再表示だけ。トークンは変えない） */
    const handleRequestReview = async () => {
      if (nl.review_status === 'pending' && nl.review_token) {
        setReviewLinkUrl(`${publicSiteUrl()}/review/${nl.review_token}`);
        return;
      }
      if (!(await appConfirm({
        title: '担当者に確認を依頼しますか？',
        message: '確認リンクが発行されるので、LINEやメールで担当者に送ってください。',
        confirmLabel: '依頼する',
      }))) return;
      setIsRequestingReview(true);
      try {
        const updated = await requestReview(nl.id);
        setSelectedNewsletter({ ...nl, ...updated } as any);
        setNewsletters((prev) => prev.map((n) => n.id === updated.id ? { ...n, ...updated } : n));
        setReviewLinkUrl(`${publicSiteUrl()}/review/${updated.review_token}`);
      } catch (error) {
        console.error('確認依頼エラー:', error);
        showError('確認依頼を作成できませんでした。時間をおいてもう一度お試しください。');
      } finally {
        setIsRequestingReview(false);
      }
    };

    /** 公開する（承認済みの下書きだけ） */
    const handlePublish = async () => {
      // 開発環境は本番と同じDBに繋がっているため、公開前に本番反映の警告を出す
      const isDev = import.meta.env.DEV;
      if (!(await appConfirm({
        title: isDev ? '⚠️ 開発環境から本番に公開されます' : `「${nl.title}」を公開しますか？`,
        message: isDev
          ? '今は開発環境ですが、本番と同じデータベースに接続しています。公開すると本番サイトにも即反映されます。本当に公開しますか？'
          : '公開すると住民に表示されます。',
        confirmLabel: isDev ? '本番に公開する' : '公開する',
        danger: isDev,
      }))) return;
      setIsPublishing(true);
      try {
        const updated = await publishNewsletter(nl.id);
        setSelectedNewsletter({ ...nl, ...updated } as any);
        setNewsletters((prev) => prev.map((n) => n.id === updated.id ? { ...n, ...updated } : n));
        showToast('公開しました。住民向けページに表示されています。');
      } catch (error) {
        console.error('公開エラー:', error);
        showError('公開できませんでした。時間をおいてもう一度お試しください。');
      } finally {
        setIsPublishing(false);
      }
    };

    /** 非公開にする */
    const handleUnpublish = async () => {
      if (!(await appConfirm({
        title: `「${nl.title}」を非公開にしますか？`,
        message: '住民に表示されなくなります。',
        confirmLabel: '非公開にする',
      }))) return;
      setIsUnpublishing(true);
      try {
        const updated = await unpublishNewsletter(nl.id);
        setSelectedNewsletter({ ...nl, ...updated } as any);
        setNewsletters((prev) => prev.map((n) => n.id === updated.id ? { ...n, ...updated } : n));
        showToast('非公開にしました。住民向けページには表示されません。');
      } catch (error) {
        console.error('非公開エラー:', error);
        showError('非公開にできませんでした。時間をおいてもう一度お試しください。');
      } finally {
        setIsUnpublishing(false);
      }
    };

    /** 上段右に出す「次の一手」。下書き: 確認を依頼 → 承認後: 公開する。公開中: 非公開にする（控えめ） */
    const primaryAction = (() => {
      if (isDraft && nl.review_status === 'approved') {
        return (
          <button
            onClick={handlePublish}
            disabled={articles.length === 0 || isPublishing}
            className={`${btnPrimary} bg-green-600 hover:bg-green-700`}
            title={articles.length === 0 ? '記事が1つもないため公開できません' : '住民向けページに公開する'}
          >
            {isPublishing ? <Loader2 size={18} className="animate-spin" /> : <Globe size={18} />}
            公開する
          </button>
        );
      }
      if (isDraft) {
        const label = nl.review_status === 'pending' ? '確認リンクを表示'
          : nl.review_status === 'changes_requested' ? '再度確認を依頼'
          : '確認を依頼';
        return (
          <button
            onClick={handleRequestReview}
            disabled={articles.length === 0 || isRequestingReview}
            className={`${btnPrimary} bg-primary-600 hover:bg-primary-700`}
            title={articles.length === 0 ? '記事が1つもないため依頼できません' : '担当者に公開前の確認を依頼'}
          >
            {isRequestingReview ? <Loader2 size={18} className="animate-spin" /> : <ClipboardCheck size={18} />}
            {label}
          </button>
        );
      }
      if (isPublished) {
        return (
          <button
            onClick={handleUnpublish}
            disabled={isUnpublishing}
            className={`${btnSecondary} border-orange-300 text-orange-700 hover:bg-orange-50`}
            title="住民向けページから下げる"
          >
            {isUnpublishing ? <Loader2 size={16} className="animate-spin" /> : <EyeOff size={16} />}
            非公開にする
          </button>
        );
      }
      return null;
    })();
    return (
      <div className="space-y-4">
        {/* 一覧へ戻る */}
        <button
          onClick={handleBackToList}
          className="flex items-center gap-2 text-primary-600 hover:text-primary-800 font-medium transition-colors"
        >
          <ArrowLeft size={18} />
          一覧に戻る
        </button>

        {/* 回覧板の名前・状態と操作。上段右は「そのときの次の一手」1つだけ。下段は副ボタン（折り返し可） */}
        <div className="bg-white p-6 rounded-xl shadow border border-slate-200">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-2xl font-bold text-slate-800">{nl.title}</h2>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  isPublished ? 'bg-green-100 text-green-700' : isDraft ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700'
                }`}>
                  {isPublished ? '公開中' : isDraft ? '下書き' : 'アーカイブ'}
                </span>
                {nl.parent_id && isDraft && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">編集版</span>
                )}
                {isDraft && nl.review_status && (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    nl.review_status === 'approved' ? 'bg-green-100 text-green-700'
                      : nl.review_status === 'pending' ? 'bg-amber-100 text-amber-700'
                      : 'bg-orange-100 text-orange-700'
                  }`}>
                    {nl.review_status === 'approved' ? '承認済み' : nl.review_status === 'pending' ? '確認待ち' : '修正依頼あり'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm text-slate-600 mt-2 flex-wrap">
                <span className="flex items-center gap-1">
                  <Calendar size={14} />
                  {new Date(nl.created_at).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
                </span>
                <span className="flex items-center gap-1">
                  <FileText size={14} />
                  {articles.length}件の記事
                </span>
                <span className="flex items-center gap-1">
                  <FileText size={14} />
                  {nl.source_pdf_urls?.length || 0}件のPDF
                </span>
              </div>
            </div>
            {primaryAction}
          </div>

          <div className="flex items-center gap-2 flex-wrap mt-4 pt-4 border-t border-slate-100">
            {onEditNewsletter && canEdit && (
              <button
                onClick={() => onEditNewsletter(nl as Newsletter & { article_count: number })}
                className={btnSecondary}
                title="回覧板のPDFを読み取って記事にする"
              >
                <Edit size={16} />
                PDFを追加
              </button>
            )}
            {canEdit && (
              <button onClick={handleAddArticle} disabled={isAddingArticle} className={btnSecondary} title="PDFを使わずに記事を1つ足す">
                {isAddingArticle ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                記事を追加
              </button>
            )}
            {hasPdf && canEdit && (
              <button onClick={() => setShowArticleCrop(true)} className={btnSecondary} title="PDFから記事抽出・画像追加">
                <Scissors size={16} />
                PDFの切り抜き
              </button>
            )}
            {isPublished && liveEditId !== nl.id && (
              <button onClick={handleStartLiveEdit} className={btnSecondary} title="公開中のまま、記事やPDFを追加・手直しする">
                <Pencil size={16} />
                その場で直す
              </button>
            )}
            {isPublished && (
              <button onClick={handleDuplicate} disabled={isDuplicating} className={btnSecondary} title="公開中のものはそのままに、直すための下書きを1つ作ります">
                {isDuplicating ? <Loader2 size={16} className="animate-spin" /> : <Copy size={16} />}
                編集用の下書きを作る
              </button>
            )}
            <button onClick={() => setShowPreview(true)} className={btnSecondary} title="住民に見える形で確かめる（公開はされません）">
              <Smartphone size={16} />
              住民の画面で見る
            </button>
            <button
              onClick={() => handleDeleteNewsletter(nl as Newsletter & { article_count: number })}
              className="ml-auto inline-flex items-center gap-1 px-2 py-2 text-sm text-slate-400 hover:text-red-600 whitespace-nowrap shrink-0 transition-colors"
              title="この回覧板を削除（ゴミ箱から戻せます）"
            >
              <Trash2 size={16} />
              削除
            </button>
          </div>
        </div>

        {/* まだ確認を依頼していないとき（ここが抜けていて、公開ボタンが押せない理由が分からなかった） */}
        {selectedNewsletter.status === 'draft' && !selectedNewsletter.review_status && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-start gap-3">
            <ClipboardCheck size={20} className="text-slate-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-slate-700">
              <p className="font-bold">
                {articles.length === 0 ? 'まだ記事がありません' : '公開するには、担当者の確認が必要です'}
              </p>
              <p className="mt-1">
                {articles.length === 0 ? (
                  <>
                    上の「PDFを追加」から回覧板のPDFを読み取るか、「記事を追加」で手で足してください。
                    記事が1つもないと、確認の依頼も公開もできません。
                  </>
                ) : (
                  <>
                    右上の「確認を依頼」を押すと確認リンクが出ます。それを担当の方に送り、
                    承認されると右上のボタンが「公開する」に変わります。
                  </>
                )}
              </p>
            </div>
          </div>
        )}

        {/* 担当者確認の状況バナー（下書きのみ） */}
        {selectedNewsletter.status === 'draft' && selectedNewsletter.review_status === 'pending' && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <ClipboardCheck size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-bold">担当者の確認待ちです</p>
              <p className="mt-1">
                まだ送っていなければ、右上の「確認リンクを表示」から LINE で担当者に送ってください。
                承認されると右上のボタンが「公開する」に変わります。
              </p>
              <button
                onClick={async () => {
                  if (!(await appConfirm({
                    title: '確認依頼を取り下げますか？',
                    message: '送ったリンクは無効になります。',
                    confirmLabel: '取り下げる',
                  }))) return;
                  try {
                    const updated = await cancelReview(selectedNewsletter.id);
                    setSelectedNewsletter({ ...selectedNewsletter, ...updated } as any);
                    setNewsletters((prev) => prev.map((n) => n.id === updated.id ? { ...n, ...updated } : n));
                  } catch (error) {
                    console.error('取り下げエラー:', error);
                    showError('確認依頼を取り下げられませんでした。時間をおいてもう一度お試しください。');
                  }
                }}
                className="mt-2 text-amber-700 underline hover:text-amber-900"
              >
                確認依頼を取り下げる
              </button>
            </div>
          </div>
        )}
        {selectedNewsletter.status === 'draft' && selectedNewsletter.review_status === 'approved' && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
            <CheckCircle2 size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-green-800">
              <p className="font-bold">
                承認済みです
                {selectedNewsletter.reviewer_name ? `（${selectedNewsletter.reviewer_name}さん）` : ''}
                {selectedNewsletter.reviewed_at ? ` ・ ${new Date(selectedNewsletter.reviewed_at).toLocaleString('ja-JP')}` : ''}
              </p>
              <p className="mt-1">右上の「公開する」から公開できます。</p>
              {selectedNewsletter.review_comment && (
                <p className="mt-2 p-2 bg-white rounded-lg whitespace-pre-wrap text-slate-700">{selectedNewsletter.review_comment}</p>
              )}
            </div>
          </div>
        )}
        {selectedNewsletter.status === 'draft' && selectedNewsletter.review_status === 'changes_requested' && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-start gap-3">
            <MessageSquareWarning size={20} className="text-orange-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-orange-800">
              <p className="font-bold">
                修正依頼が届いています
                {selectedNewsletter.reviewer_name ? `（${selectedNewsletter.reviewer_name}さん）` : ''}
                {selectedNewsletter.reviewed_at ? ` ・ ${new Date(selectedNewsletter.reviewed_at).toLocaleString('ja-JP')}` : ''}
              </p>
              {selectedNewsletter.review_comment && (
                <p className="mt-2 p-2 bg-white rounded-lg whitespace-pre-wrap text-slate-700">{selectedNewsletter.review_comment}</p>
              )}
              <p className="mt-2">修正が終わったら「再度確認を依頼」で新しいリンクを送ってください。</p>
            </div>
          </div>
        )}

        {/* その場で直しているときの知らせ */}
        {selectedNewsletter.status === 'published' && liveEditId === selectedNewsletter.id && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start justify-between gap-3">
            <div className="text-sm text-amber-800">
              <p className="font-bold flex items-center gap-2"><Pencil size={16} />公開中の回覧板を、その場で直しています</p>
              <p className="mt-1">記事やPDFの追加・手直しは、保存したときにすぐ住民向けページに出ます。</p>
            </div>
            <button
              onClick={() => setLiveEditId(null)}
              className="shrink-0 px-3 py-1.5 text-sm bg-white border border-amber-300 text-amber-800 rounded-lg hover:bg-amber-100 font-medium"
            >
              直し終わる
            </button>
          </div>
        )}

        {/* 編集コピーバナー */}
        {selectedNewsletter.parent_id && selectedNewsletter.status === 'draft' && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-bold text-blue-900 flex items-center gap-2">
                  <Edit size={16} />
                  公開版の編集コピーです
                </p>
                <p className="text-sm text-blue-700 mt-1">
                  公開中の内容は変更されません。編集が完了したら「公開する」で差し替えてください。
                </p>
              </div>
            </div>

            {/* 編集中 / 公開版 タブ */}
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setViewingPublished(false)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  !viewingPublished
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-blue-700 border border-blue-300 hover:bg-blue-100'
                }`}
              >
                編集中の内容
              </button>
              <button
                onClick={async () => {
                  if (publishedArticles.length === 0 && selectedNewsletter.parent_id) {
                    try {
                      const pubArticles = await getArticlesByNewsletterId(selectedNewsletter.parent_id);
                      setPublishedArticles(pubArticles);
                    } catch (err) {
                      console.error('公開版記事の取得エラー:', err);
                    }
                  }
                  setViewingPublished(true);
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  viewingPublished
                    ? 'bg-green-600 text-white'
                    : 'bg-white text-green-700 border border-green-300 hover:bg-green-100'
                }`}
              >
                現在の公開版
              </button>
            </div>
          </div>
        )}

        {/* エラー表示 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-800">エラー</p>
              <p className="text-sm text-red-600 mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* イベントカード管理 */}
        <div className="bg-white p-6 rounded-xl shadow border border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              🗓️ 今後の予定 ({eventCards.length}件)
            </h3>
            {/* イベントカードは予定情報のメンテナンスなので公開後も編集可能 */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowEventExtract(true)}
                disabled={
                  articles.length === 0 &&
                  !((selectedNewsletter.source_pdf_urls?.length || 0) > 0 || selectedNewsletter.source_pdf_url)
                }
                className="text-sm text-primary-600 hover:text-primary-800 font-medium flex items-center gap-1 disabled:opacity-40"
                title="記事と添付PDFから予定の候補をAIで抽出します"
              >
                <Sparkles size={16} /> AIで抽出
              </button>
              <button
                onClick={async () => {
                  // 名前だけ聞いて作り、日付・時間・場所などは予定タブと同じ編集ダイアログで入れる（B4）
                  const title = await appPrompt({
                    title: '予定の名前を入力',
                    message: '次の画面で、日付（カレンダーから選べます）・時間・場所・主催などを入れます。',
                    placeholder: '例: 秋祭り',
                    confirmLabel: '次へ',
                  });
                  if (!title?.trim()) return;
                  try {
                    const card = await addEventCard({
                      newsletter_id: selectedNewsletter.id,
                      title: title.trim(),
                      event_date: null,
                      event_time: null,
                      event_location: null,
                      linked_article_id: null,
                      display_order: eventCards.length,
                    });
                    await reloadEventCards(selectedNewsletter.id);
                    setEditingCardId(card.id);
                  } catch (error) { console.error('イベント追加エラー:', error); showError('予定を追加できませんでした。時間をおいてもう一度お試しください。'); }
                }}
                className="text-sm text-primary-600 hover:text-primary-800 font-medium flex items-center gap-1"
              >
                <Plus size={16} /> 追加
              </button>
            </div>
          </div>
          {showEventExtract && selectedNewsletter && (
            <EventCandidateDialog
              newsletter={selectedNewsletter}
              articles={articles}
              existingCards={eventCards}
              onRegistered={async () => {
                try {
                  await reloadEventCards(selectedNewsletter.id);
                } catch { /* 再取得失敗時は既存表示を維持 */ }
              }}
              onClose={() => setShowEventExtract(false)}
            />
          )}
          {editingCardId && (
            <EventCardEditDialog
              cardId={editingCardId}
              onClose={() => setEditingCardId(null)}
              onChanged={() => reloadEventCards(selectedNewsletter.id).catch(() => {})}
            />
          )}
          {eventCards.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">予定がありません</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {eventCards.map((card) => {
                const linkedArticle = card.linked_article;
                /** リンク記事が別の号の記事なら、その号名を添える */
                const linkedFrom = linkedArticle && linkedArticle.newsletter_id !== card.newsletter_id ? card.linked_article_newsletter_title : null;
                return (
                  <div key={card.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg group">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-sm font-bold text-blue-600 shrink-0">{card.event_date || '日付未定'}</span>
                        {card.event_time && <span className="text-xs text-slate-500 shrink-0">{card.event_time}</span>}
                        <span className="text-sm font-medium text-slate-800 truncate">{card.title}</span>
                      </div>
                      {(card.event_location || card.organizer) && (
                        <p className="text-xs text-slate-400 truncate">
                          {card.event_location && `📍 ${card.event_location}`}
                          {card.event_location && card.organizer && '　'}
                          {card.organizer && `🏛 ${card.organizer}`}
                        </p>
                      )}
                      {card.description && (
                        <p className="text-xs text-slate-500 truncate" title={card.description}>
                          {card.weekly_topic ? '⭐ ' : ''}{card.description}
                        </p>
                      )}
                      {card.digest_exclude && (
                        <p className="text-[11px] text-slate-400" title="週次LINE配信には載りません（カレンダーには載ります）">🚫 週次配信に載せない</p>
                      )}
                      {linkedArticle ? (
                        <p className="text-xs text-primary-600 mt-0.5 flex items-center gap-2">
                          <span className="truncate">🔗 {linkedArticle.title}</span>
                          {linkedFrom && <span className="shrink-0 text-[11px] text-slate-400">（{linkedFrom}）</span>}
                          <button
                            onClick={async () => {
                              if (!(await appConfirm({
                                title: `「${card.title}」の記事リンクを解除しますか？`,
                                message: '読者側の「詳しく読む」表示が消えます。',
                                confirmLabel: '解除する',
                              }))) return;
                              await updateEventCard(card.id, { linked_article_id: null });
                              await reloadEventCards(selectedNewsletter.id);
                            }}
                            className="text-slate-400 hover:text-red-500 shrink-0"
                            title="記事リンクを解除"
                          >
                            解除
                          </button>
                        </p>
                      ) : (
                        <button
                          onClick={() => setEditingCardId(card.id)}
                          className="text-xs text-amber-600 hover:text-amber-800 mt-0.5"
                          title="編集ダイアログで、公開中のすべての回覧板の記事から選べます"
                        >
                          ＋ 記事をリンク
                        </button>
                      )}
                    </div>
                    <div className="flex items-center shrink-0">
                      <button
                        onClick={() => setEditingCardId(card.id)}
                        className="p-1.5 text-slate-400 hover:text-primary-600 opacity-0 group-hover:opacity-100 transition"
                        title="編集"
                      >
                        <Edit size={14} />
                      </button>
                      <button
                        onClick={async () => {
                          if (!(await appConfirm({
                            title: `「${card.title}」を削除しますか？`,
                            confirmLabel: '削除する',
                            danger: true,
                          }))) return;
                          await deleteEventCard(card.id);
                          await reloadEventCards(selectedNewsletter.id);
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
                        title="削除"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 公開版プレビュー表示中 */}
        {viewingPublished && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
            <Globe size={16} className="text-green-700" />
            <span className="text-sm font-medium text-green-800">現在公開中の記事を表示しています（読み取り専用）</span>
          </div>
        )}

        {/* 記事一覧の見出し（「畳む」で一覧を隠し、下の「登録済みPDF」にすぐ行けるようにする） */}
        {(() => {
          const count = viewingPublished ? publishedArticles.length : articles.length;
          return (
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <FileText size={20} />
                記事一覧（{count}件）
                {articlesCollapsed && count > 0 && <span className="text-sm font-normal text-slate-600">（畳んでいます）</span>}
              </h3>
              {count > 0 && (
                <button
                  onClick={toggleArticlesCollapsed}
                  className={`flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-lg border-2 transition ${
                    articlesCollapsed
                      ? 'text-white bg-primary-600 border-primary-600 hover:bg-primary-700'
                      : 'text-slate-800 bg-white border-slate-400 hover:bg-slate-100'
                  }`}
                  title={articlesCollapsed ? '記事一覧を開く' : '記事一覧を畳んで、下の「登録済みPDF」をすぐ見られるようにする'}
                >
                  {articlesCollapsed ? <><ChevronDown size={18} /> 記事一覧を開く</> : <><ChevronUp size={18} /> 記事一覧を畳む</>}
                </button>
              )}
            </div>
          );
        })()}
        {/* 記事一覧 */}
        {articlesCollapsed && (viewingPublished ? publishedArticles.length : articles.length) > 0 ? null : isLoadingArticles ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={32} className="animate-spin text-primary-600" />
            <span className="ml-3 text-slate-600">記事を読み込み中…</span>
          </div>
        ) : viewingPublished ? (
          publishedArticles.length > 0 ? (
            <ArticleList
              articles={publishedArticles}
              categories={MOCK_CATEGORIES}
            />
          ) : (
            <div className="bg-slate-50 rounded-lg p-8 text-center">
              <p className="text-slate-600">公開版の記事を読み込めませんでした</p>
            </div>
          )
        ) : articles.length > 0 ? (
          <ArticleList
            articles={articles}
            categories={MOCK_CATEGORIES}
            onArticleUpdate={canEdit ? handleArticleUpdate : undefined}
            onArticleDelete={canEdit ? handleArticleDelete : undefined}
            enableDragAndDrop={canEdit}
            onArticlesReorder={canEdit ? (reordered) => setArticles(reordered) : undefined}
            availablePdfs={selectedNewsletter.source_pdf_urls?.map((p: any) => ({ url: p.url, label: p.label || 'PDF' }))}
          />
        ) : !selectedNewsletter.source_pdf_urls?.length && !selectedNewsletter.source_pdf_url ? (
          <div className="bg-slate-50 rounded-lg p-8 text-center">
            <FileText size={48} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-600">記事が見つかりませんでした</p>
          </div>
        ) : null}

        {/* 登録済みPDF一覧（画面の順は toPdfEntries。並べ替え・タグもこの順の番号で扱う） */}
        {(() => {
          const pdfEntries = toPdfEntries(selectedNewsletter.source_pdf_urls || []);
          const sourcePdfs = pdfEntries.filter(p => p.type === 'source');
          const attachPdfs = pdfEntries.filter(p => p.type !== 'source');
          if (pdfEntries.length === 0) return null;

          return (
            <div className="bg-white p-6 rounded-xl shadow border border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <FileText size={18} />
                  登録済みPDF ({pdfEntries.length}件)
                </h3>
                <div className="flex items-center gap-2">
                {pdfEntries.length > 0 && (
                  <button
                    onClick={async () => {
                      setPdfTaskMessage('サムネイル画像の作成準備をしています…');
                      try {
                      const pdfjsLib = await import('pdfjs-dist');
                      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
                      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
                      const { uploadImage } = await import('@cc-saas/shared/services/data/storageService');
                      const { getSupabaseClient } = await import('@cc-saas/shared/services/supabaseClient');

                      let count = 0;
                      const entries: any[] = [...(selectedNewsletter.source_pdf_urls || [])];
                      for (let i = 0; i < entries.length; i++) {
                        setPdfTaskMessage(`PDFの表紙からサムネイル画像を作っています…（${i + 1}件目 / 全${entries.length}件）`);
                        const entry = entries[i];
                        const url = typeof entry === 'string' ? entry : entry.url;
                        // 全件再生成（既存サムネイルも上書き）
                        try {
                          const res = await fetch(url);
                          const buf = await res.arrayBuffer();
                          const doc = await pdfjsLib.getDocument({
                            data: buf,
                            ...PDFJS_DOC_OPTIONS,
                          }).promise;
                          const page = await doc.getPage(1);
                          const vp = page.getViewport({ scale: 2.0 });
                          const canvas = document.createElement('canvas');
                          canvas.width = vp.width; canvas.height = vp.height;
                          const ctx = canvas.getContext('2d')!;
                          // JPEG保存のため下地を白で塗る（透過部分が黒くなるのを防ぐ）
                          ctx.fillStyle = '#ffffff';
                          ctx.fillRect(0, 0, canvas.width, canvas.height);
                          await page.render({ canvasContext: ctx, viewport: vp, canvas } as any).promise;
                          const blob = await new Promise<Blob>(r => canvas.toBlob(b => r(b!), 'image/jpeg', 0.9));
                          doc.destroy();
                          const thumbFile = new File([blob], `thumb-${Date.now()}.jpg`, { type: 'image/jpeg' });
                          const result = await uploadImage(thumbFile);
                          entries[i] = { ...(typeof entry === 'string' ? { url: entry, label: '' } : entry), thumbnail: result.url };
                          count++;
                        } catch (e) {
                          console.warn('サムネイル生成スキップ:', url, e);
                          entries[i] = { ...(typeof entry === 'string' ? { url: entry, label: '' } : entry), thumbnail: 'failed' };
                        }
                      }
                      // DB更新
                      const supabase = getSupabaseClient();
                      if (supabase) {
                        await supabase.from('newsletters').update({ source_pdf_urls: entries }).eq('id', selectedNewsletter.id);
                      }
                      const freshList = await loadCircularNewsletters();
                      setNewsletters(freshList);
                      const updated = freshList.find(n => n.id === selectedNewsletter.id);
                      if (updated) setSelectedNewsletter(updated as any);
                      const failed = entries.filter((e: any) => e.thumbnail === 'failed').length;
                      showToast(`${count}件のサムネイルを生成しました` + (failed > 0 ? `\n${failed}件は自動生成できませんでした。「サムネイル追加」から画像を登録してください。` : ''));
                      } finally {
                        setPdfTaskMessage(null);
                      }
                    }}
                    disabled={pdfTaskMessage !== null}
                    className="text-xs text-blue-500 hover:text-blue-700 hover:bg-blue-50 px-2 py-1 rounded transition disabled:opacity-40"
                  >
                    サムネイル生成
                  </button>
                )}
                {canEdit && pdfEntries.length > 1 && (
                  <button
                    onClick={async () => {
                      if (!(await appConfirm({
                        title: `${pdfEntries.length}件のPDFを全て削除しますか？`,
                        confirmLabel: '削除する',
                        danger: true,
                      }))) return;
                      setPdfTaskMessage(`${pdfEntries.length}件のPDFを削除しています…`);
                      try {
                        for (const pdf of pdfEntries) {
                          await removePdfUrlFromNewsletter(selectedNewsletter.id, pdf.url);
                        }
                        const freshList = await loadCircularNewsletters();
                        setNewsletters(freshList);
                        const updated = freshList.find((n) => n.id === selectedNewsletter.id);
                        if (updated) setSelectedNewsletter(updated as any);
                      } catch (error) { console.error('PDF一括削除エラー:', error); showError('削除できませんでした。時間をおいてもう一度お試しください。'); }
                      finally { setPdfTaskMessage(null); }
                    }}
                    disabled={pdfTaskMessage !== null}
                    className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition disabled:opacity-40"
                  >
                    全て削除
                  </button>
                )}
                </div>
              </div>
              {/* サムネイル生成・削除など時間のかかる作業の進行表示 */}
              {pdfTaskMessage && (
                <div className="mb-3">
                  <ProcessingIndicator
                    label={pdfTaskMessage}
                    sublabel="このままお待ちください。画面を閉じたり移動したりしないでください。"
                  />
                </div>
              )}
              {sourcePdfs.length > 0 && <p className="text-xs font-medium text-blue-600 mb-2">📄 記事をPDF版で読む ({sourcePdfs.length}件)</p>}
              <div className="space-y-2">
                {pdfEntries.map((pdf, i) => (
                  <React.Fragment key={`pdf-${i}`}>
                  {/* 回覧板PDFセクションヘッダー */}
                  {pdf.type !== 'source' && (i === 0 || pdfEntries[i - 1]?.type === 'source') && (
                    <p className="text-xs font-medium text-green-600 pt-3 mt-2 border-t border-slate-100">📋 回覧板PDF ({attachPdfs.length}件)</p>
                  )}
                  <div
                    draggable={canEdit}
                    onDragStart={() => setDragPdfIndex(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragPdfIndex !== null) movePdfEntry(dragPdfIndex, i);
                      setDragPdfIndex(null);
                    }}
                    onDragEnd={() => setDragPdfIndex(null)}
                    className={`flex items-center justify-between p-3 bg-slate-50 rounded-lg group transition ${
                      dragPdfIndex === i ? 'opacity-50 ring-2 ring-primary-300' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {canEdit && (
                        <GripVertical
                          size={16}
                          className="text-slate-300 cursor-grab shrink-0"
                          aria-label="ドラッグで並べ替え"
                        />
                      )}
                      <a href={pdf.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                        {pdf.thumbnail && pdf.thumbnail !== 'failed' ? (
                          <img src={pdf.thumbnail} alt="" className="w-10 h-14 object-cover rounded border border-slate-200" />
                        ) : (
                          <FileText size={18} className="text-blue-600" />
                        )}
                      </a>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm font-medium truncate ${
                            canEdit ? 'text-slate-700 cursor-pointer hover:text-blue-600' : 'text-slate-700'
                          }`}
                          onClick={async () => {
                            if (!canEdit) return;
                            const newLabel = await appPrompt({
                              title: 'PDFの表示名を編集',
                              defaultValue: pdf.label || pdf.filename,
                              confirmLabel: '保存する',
                            });
                            if (newLabel === null || newLabel === pdf.label) return;
                            updatePdfLabel(selectedNewsletter.id, pdf.url, newLabel).then((updated) => {
                              setSelectedNewsletter({ ...selectedNewsletter, ...updated } as any);
                              setNewsletters((prev) => prev.map((n) => n.id === updated.id ? { ...n, ...updated } : n));
                            }).catch((error) => { console.error('ラベル更新エラー:', error); showError('ラベルを更新できませんでした。時間をおいてもう一度お試しください。'); });
                          }}
                          title={canEdit ? 'クリックして編集' : ''}
                        >
                          {pdf.label || pdf.filename}
                        </p>
                        <p
                          className={`text-xs truncate ${
                            canEdit ? 'text-slate-400 cursor-pointer hover:text-blue-500' : 'text-slate-400'
                          }`}
                          onClick={async () => {
                            if (!canEdit) return;
                            const newPublisher = await appPrompt({
                              title: '発行元を選択',
                              message: 'タップして選ぶか、下の欄に入力してください',
                              choices: publisherPresets,
                              defaultValue: pdf.publisher,
                              confirmLabel: '保存する',
                            });
                            if (newPublisher === null) return;
                            updatePdfLabel(selectedNewsletter.id, pdf.url, pdf.label, newPublisher).then((updated) => {
                              setSelectedNewsletter({ ...selectedNewsletter, ...updated } as any);
                              setNewsletters((prev) => prev.map((n) => n.id === updated.id ? { ...n, ...updated } : n));
                            }).catch((error) => { console.error('発行元更新エラー:', error); showError('発行元を更新できませんでした。時間をおいてもう一度お試しください。'); });
                          }}
                          title={canEdit ? 'クリックして発行元を編集' : ''}
                        >
                          {pdf.publisher ? `📍 ${pdf.publisher}` : (canEdit ? '＋ 発行元を設定' : '')}
                        </p>
                        {(
                          <label className="inline-flex items-center gap-1 mt-1 text-xs text-amber-600 cursor-pointer hover:text-amber-800">
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                setPdfTaskMessage('サムネイル画像を保存しています…');
                                try {
                                  const { uploadImage } = await import('@cc-saas/shared/services/data/storageService');
                                  const { getSupabaseClient } = await import('@cc-saas/shared/services/supabaseClient');
                                  const result = await uploadImage(file);
                                  const entries: any[] = [...(selectedNewsletter.source_pdf_urls || [])];
                                  const idx = entries.findIndex((en: any) => (typeof en === 'string' ? en : en.url) === pdf.url);
                                  if (idx >= 0) entries[idx] = { ...entries[idx], thumbnail: result.url };
                                  const supabase = getSupabaseClient();
                                  if (supabase) await supabase.from('newsletters').update({ source_pdf_urls: entries }).eq('id', selectedNewsletter.id);
                                  const freshList = await loadCircularNewsletters();
                                  setNewsletters(freshList);
                                  const updated = freshList.find(n => n.id === selectedNewsletter.id);
                                  if (updated) setSelectedNewsletter(updated as any);
                                } catch (error) { console.error('サムネイルアップロードエラー:', error); showError('画像を保存できませんでした。時間をおいてもう一度お試しください。'); }
                                finally { setPdfTaskMessage(null); }
                                e.target.value = '';
                              }}
                            />
                            {pdf.thumbnail === 'pending' ? '⚠️ サムネイル未作成' : pdf.thumbnail && pdf.thumbnail !== 'failed' ? '📷 サムネイル差替え' : '📷 サムネイル追加'}
                          </label>
                        )}
                        {canEdit && (
                          <button
                            onClick={async () => {
                              try {
                                const { getSupabaseClient } = await import('@cc-saas/shared/services/supabaseClient');
                                const entries: any[] = [...(selectedNewsletter.source_pdf_urls || [])];
                                const idx = entries.findIndex((en: any) => (typeof en === 'string' ? en : en.url) === pdf.url);
                                if (idx >= 0) {
                                  const current = typeof entries[idx] === 'string' ? { url: entries[idx], label: '' } : entries[idx];
                                  const newType = current.type === 'source' ? 'attachment' : 'source';
                                  entries[idx] = { ...current, type: newType };
                                  const supabase = getSupabaseClient();
                                  if (supabase) await supabase.from('newsletters').update({ source_pdf_urls: entries }).eq('id', selectedNewsletter.id);
                                  const freshList = await loadCircularNewsletters();
                                  setNewsletters(freshList);
                                  const updated = freshList.find(n => n.id === selectedNewsletter.id);
                                  if (updated) setSelectedNewsletter(updated as any);
                                }
                              } catch (error) { console.error('PDF種別変更エラー:', error); showError('変更できませんでした。時間をおいてもう一度お試しください。'); }
                            }}
                            className={`text-xs px-1.5 py-0.5 rounded transition ${
                              pdf.type === 'source' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                            }`}
                            title={pdf.type === 'source' ? '押すと「回覧板PDF」（PDFのまま載せる）に変えます' : '押すと「PDF版で読む」（記事のPDF版）に変えます'}
                          >
                            {pdf.type === 'source' ? 'PDF版で読む' : '回覧板PDF'}
                          </button>
                        )}
                      </div>
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-1 ml-2 shrink-0">
                        {/* 上下入替（ドラッグでも移動可能） */}
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => movePdfEntry(i, i - 1)}
                            disabled={i === 0 || pdfEntries[i - 1].type !== pdf.type}
                            className="flex items-center gap-0.5 px-2 py-1 text-xs border border-slate-300 bg-white rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-30 transition"
                            title="1つ上へ移動"
                          >
                            <ChevronUp size={14} />
                            上へ
                          </button>
                          <button
                            onClick={() => movePdfEntry(i, i + 1)}
                            disabled={i >= pdfEntries.length - 1 || pdfEntries[i + 1].type !== pdf.type}
                            className="flex items-center gap-0.5 px-2 py-1 text-xs border border-slate-300 bg-white rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-30 transition"
                            title="1つ下へ移動"
                          >
                            <ChevronDown size={14} />
                            下へ
                          </button>
                        </div>
                        {/* 削除 */}
                        <button
                          onClick={async () => {
                            if (!(await appConfirm({
                              title: `「${pdf.label || pdf.filename}」を削除しますか？`,
                              confirmLabel: '削除する',
                              danger: true,
                            }))) return;
                            try {
                              const updated = await removePdfUrlFromNewsletter(selectedNewsletter.id, pdf.url);
                              setSelectedNewsletter({ ...selectedNewsletter, ...updated } as any);
                              setNewsletters((prev) => prev.map((n) => n.id === updated.id ? { ...n, ...updated } : n));
                            } catch (err) {
                              console.error('PDF削除エラー:', err);
                              showError('削除できませんでした。時間をおいてもう一度お試しください。');
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition"
                          title="削除"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          );
        })()}

        {/* 画像切り抜きページ（フルスクリーン） */}
        {showImageCrop && (selectedNewsletter?.source_pdf_urls?.length || selectedNewsletter?.source_pdf_url) && (
          <ImageCropPage
            pdfUrls={selectedNewsletter.source_pdf_urls?.length
              ? selectedNewsletter.source_pdf_urls.map((e: any) => typeof e === 'string' ? e : e.url)
              : [selectedNewsletter.source_pdf_url!]}
            newsletterId={selectedNewsletter.id}
            articles={articles}
            onClose={async () => {
              setShowImageCrop(false);
              // 閉じた時も記事を再読み込み（新規記事が作成されている可能性）
              const articleData = await getArticlesByNewsletterId(selectedNewsletter.id);
              setArticles(articleData);
            }}
            onSaved={async () => {
              const articleData = await getArticlesByNewsletterId(selectedNewsletter.id);
              setArticles(articleData);
            }}
          />
        )}

        {/* 記事クロップページ（フルスクリーン） */}
        {showArticleCrop && (selectedNewsletter?.source_pdf_urls?.length || selectedNewsletter?.source_pdf_url) && (
          <ArticleCropPage
            pdfUrls={selectedNewsletter.source_pdf_urls?.length
              ? selectedNewsletter.source_pdf_urls.map((e: any) => typeof e === 'string' ? e : e.url)
              : [selectedNewsletter.source_pdf_url!]}
            pdfLabels={selectedNewsletter.source_pdf_urls?.length
              ? selectedNewsletter.source_pdf_urls.map((e: any) => typeof e === 'string' ? '' : (e.label || ''))
              : []}
            newsletterId={selectedNewsletter.id}
            articles={articles}
            onClose={async () => {
              setShowArticleCrop(false);
              const articleData = await getArticlesByNewsletterId(selectedNewsletter.id);
              setArticles(articleData);
            }}
            onSaved={async () => {
              const articleData = await getArticlesByNewsletterId(selectedNewsletter.id);
              setArticles(articleData);
            }}
          />
        )}

        {/* 確認リンクダイアログ */}
        {reviewLinkUrl && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
              <div className="flex items-center gap-2">
                <ClipboardCheck size={22} className="text-amber-600" />
                <h3 className="text-lg font-bold text-slate-800">確認リンクを担当者に送ってください</h3>
              </div>
              <p className="text-sm text-slate-600">
                このリンクを開くと、ログインなしで回覧板のプレビューを確認して「承認」「修正依頼」を回答できます。
              </p>
              <input
                type="text"
                readOnly
                value={reviewLinkUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-700"
              />
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-600 space-y-1">
                <p className="font-bold text-slate-700">このあとの流れ</p>
                <p>1. 「LINEで送る」を押して、担当の方のトークを選びます（LINE が使えないときは「リンクをコピー」してメールなどで送ります）。</p>
                <p>2. 担当の方が回答すると、この回覧板に「承認済み」または「修正依頼」が付きます。</p>
                <p className="text-slate-500">
                  回答があってもお知らせは届きません。しばらくしてから、この画面を開いて確かめてください（回覧板タブに「承認済み」の印が付きます）。
                </p>
              </div>
              <div className="flex gap-2 justify-end flex-wrap">
                <button
                  onClick={() => setReviewLinkUrl(null)}
                  className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg font-medium hover:bg-slate-200 transition whitespace-nowrap"
                >
                  閉じる
                </button>
                <a
                  href={`https://line.me/R/share?text=${encodeURIComponent(`「${selectedNewsletter.title}」の公開前の確認をお願いします。下のリンクを開いて「承認」か「修正依頼」を押してください。\n${reviewLinkUrl}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-[#06C755] text-white rounded-lg font-medium hover:brightness-95 transition whitespace-nowrap"
                  title="LINE を開いて、送る相手を選びます"
                >
                  <Send size={16} />
                  LINEで送る
                </a>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(reviewLinkUrl);
                      showToast('リンクをコピーしました');
                    } catch (error) {
                      console.error('リンクコピーエラー:', error);
                      showError('コピーできませんでした。リンクを長押し（または選択）してコピーしてください。');
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition whitespace-nowrap"
                >
                  <Copy size={16} />
                  リンクをコピー
                </button>
              </div>
            </div>
          </div>
        )}

        {/* スマホプレビュー */}
        {showPreview && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            {/* 閉じるボタン */}
            <button
              onClick={() => setShowPreview(false)}
              className="absolute top-4 right-4 p-2 bg-white rounded-full shadow-lg hover:bg-slate-100 transition z-10"
            >
              <X size={24} className="text-slate-700" />
            </button>

            {/* ラベルと、住民ページ全体を見る導線（以前は「公開プレビュー」という別ボタンだった） */}
            <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2">
              <div className="bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow text-sm font-medium text-slate-700 flex items-center gap-2">
                <Smartphone size={16} />
                {selectedNewsletter.status === 'draft' ? 'この下書きを住民の画面で見ています' : '公開中のものを住民の画面で見ています'}
              </div>
              <button
                onClick={() => window.open(`/?preview=${selectedNewsletter.id}`, '_blank', 'noopener')}
                className="bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow text-sm font-medium text-slate-700 flex items-center gap-2 hover:bg-white transition"
                title="レポートやカレンダーも含めた住民ページ全体を、別のタブで開きます（公開はされません）"
              >
                <Eye size={16} />
                ページ全体を別タブで見る
              </button>
            </div>

            {/* スマホフレーム */}
            <div className="bg-slate-900 rounded-[3rem] p-3 shadow-2xl" style={{ width: 390, height: 750 }}>
              {/* ノッチ */}
              <div className="bg-slate-900 h-7 rounded-t-[2.5rem] flex items-center justify-center">
                <div className="w-24 h-5 bg-black rounded-full" />
              </div>
              {/* 画面 */}
              <div className="bg-white rounded-[2rem] overflow-hidden" style={{ height: 'calc(100% - 28px)' }}>
                <div className="h-full overflow-y-auto p-4">
                  <CircularsView
                    isSimpleMode={false}
                    previewNewsletterId={selectedNewsletter.id}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Newsletter一覧モード
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">保存済みの回覧板</h2>

      {/* エラー表示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-800">エラー</p>
            <p className="text-sm text-red-600 mt-1">{error}</p>
            <button
              onClick={loadNewsletters}
              className="mt-2 text-sm text-red-700 underline hover:text-red-900"
            >
              再試行
            </button>
          </div>
        </div>
      )}

      {/* ローディング */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={32} className="animate-spin text-primary-600" />
          <span className="ml-3 text-slate-600">読み込み中…</span>
        </div>
      ) : newsletters.length === 0 ? (
        /* 空状態 */
        <div className="bg-slate-50 rounded-lg p-12 text-center">
          <FileText size={64} className="mx-auto text-slate-300 mb-4" />
          <p className="text-lg font-medium text-slate-700 mb-2">
            保存された回覧板はありません
          </p>
          <p className="text-sm text-slate-500">
            上の「新規作成」で今月の回覧板を作り、「PDFを追加」からPDFを入れると、ここに並びます
          </p>
        </div>
      ) : (
        /* Newsletter一覧 */
        <div className="space-y-3">
          {newsletters.filter((n) => n.status !== 'archived').map((newsletter) => (
            <div
              key={newsletter.id}
              onClick={() => handleSelectNewsletter(newsletter)}
              className="p-5 bg-white rounded-lg border border-slate-200 hover:border-primary-400 hover:shadow-md cursor-pointer transition-all duration-200"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-bold text-slate-800 text-lg">{newsletter.title}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      newsletter.status === 'published'
                        ? 'bg-green-100 text-green-700'
                        : newsletter.status === 'draft'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {newsletter.status === 'published' ? '公開中' :
                       newsletter.status === 'draft' ? '下書き' : 'アーカイブ'}
                    </span>
                    {newsletter.parent_id && newsletter.status === 'draft' && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                        編集版
                      </span>
                    )}
                    {newsletter.status === 'draft' && newsletter.review_status && (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        newsletter.review_status === 'approved'
                          ? 'bg-green-100 text-green-700'
                          : newsletter.review_status === 'pending'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-orange-100 text-orange-700'
                      }`}>
                        {newsletter.review_status === 'approved' ? '承認済み' :
                         newsletter.review_status === 'pending' ? '確認待ち' : '修正依頼あり'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-slate-500">
                    <span className="flex items-center gap-1">
                      <Calendar size={14} />
                      {new Date(newsletter.created_at).toLocaleDateString('ja-JP')}
                    </span>
                    <span className="flex items-center gap-1">
                      <FileText size={14} />
                      {newsletter.article_count}件の記事
                    </span>
                    <span className="flex items-center gap-1">
                      <FileText size={14} />
                      {newsletter.source_pdf_urls?.length || 0}件のPDF
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {/* 削除ボタン */}
                  <button
                    onClick={(e) => handleDeleteNewsletter(newsletter, e)}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    title="削除"
                  >
                    <Trash2 size={18} />
                  </button>
                  <ChevronRight className="text-slate-400" size={20} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* アーカイブ一覧 */}
      {newsletters.filter((n) => n.status === 'archived').length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-medium text-slate-500 mb-2">アーカイブ（旧版）</h3>
          <div className="space-y-2">
            {newsletters.filter((n) => n.status === 'archived').map((newsletter) => (
              <div
                key={newsletter.id}
                className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between"
              >
                <div className="flex items-center gap-3 text-sm text-slate-500">
                  <FileText size={16} />
                  <span>{newsletter.title}</span>
                  <span className="text-xs">({newsletter.article_count}件)</span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteNewsletter(newsletter, e); }}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition"
                  title="削除"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
