/**
 * 電子回覧板一覧コンポーネント
 *
 * 保存された電子回覧板の一覧を表示し、選択すると記事を表示します。
 */

import React, { useEffect, useState } from 'react';
import { getNewsletters, getArticlesByNewsletterId, deleteNewsletter, deleteArticle, addArticlesToNewsletter, publishNewsletter, unpublishNewsletter, duplicateNewsletterAsDraft, removePdfUrlFromNewsletter, updatePdfLabel, getPublisherNames, getEventCards, addEventCard, deleteEventCard, type EventCard } from '@cc-saas/shared';
import { Newsletter, Article } from '@cc-saas/shared/types';
import { FileText, Calendar, ChevronRight, ArrowLeft, Loader2, AlertCircle, Edit, Trash2, Scissors, Globe, EyeOff, Copy, Eye, X, Smartphone, Plus } from 'lucide-react';
import { ArticleList } from './ArticleList';
import { ImageCropPage } from './ImageCropPage';
import { ArticleCropPage } from './ArticleCropPage';
import CircularsView from '../public/CircularsView';
import { MOCK_CATEGORIES } from '@cc-saas/shared/constants';

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
  const [publishedArticles, setPublishedArticles] = useState<Article[]>([]);

  // プレビュー
  const [showPreview, setShowPreview] = useState(false);
  const [eventCards, setEventCards] = useState<EventCard[]>([]);
  const [showArticleCrop, setShowArticleCrop] = useState(false);

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
        const freshList = await getNewsletters();
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
      console.log('📋 電子回覧板一覧を読み込み中...');
      const data = await getNewsletters();
      setNewsletters(data);
      console.log('✅ 電子回覧板読み込み完了:', data.length, '件');
    } catch (error: any) {
      console.error('❌ 電子回覧板読み込みエラー:', error);
      const msg = error?.message ?? '';
      const isFailedFetch = typeof msg === 'string' && msg.includes('Failed to fetch');
      const userMessage = isFailedFetch
        ? '電子回覧板の読み込みに失敗しました（接続エラー）。Supabaseプロジェクトが一時停止していないか、ネットワークとブラウザの開発者ツール（ネットワークタブ）を確認してください。'
        : '電子回覧板の読み込みに失敗しました: ' + msg;
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
    setIsLoadingArticles(true);
    setError(null);
    setViewingPublished(false);
    setPublishedArticles([]);
    try {
      console.log('📄 記事を読み込み中... 電子回覧板:', newsletter.title);
      const articleData = await getArticlesByNewsletterId(newsletter.id);
      setArticles(articleData);
      console.log('✅ 記事読み込み完了:', articleData.length, '件');

      // イベントカードも取得
      try { const cards = await getEventCards(newsletter.id); setEventCards(cards); } catch { setEventCards([]); }

    } catch (error: any) {
      console.error('❌ 記事読み込みエラー:', error);
      setError('記事の読み込みに失敗しました: ' + error.message);
    } finally {
      setIsLoadingArticles(false);
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
  };

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
      console.log('🗑️ Supabaseから記事を削除中...', articleId);
      await deleteArticle(articleId);
      console.log('✅ Supabaseから記事を削除しました');

      // ローカル状態から削除
      console.log('🗑️ ローカル状態から削除中...');
      setArticles(prev => {
        const filtered = prev.filter(article => article.id !== articleId);
        console.log('✅ ローカル状態から削除完了:', {
          削除前: prev.length,
          削除後: filtered.length
        });
        return filtered;
      });

      // Newsletterデータも再取得（PDF一覧の表示を維持するため）
      const freshList = await getNewsletters();
      setNewsletters(freshList);
      const updated = freshList.find((n) => n.id === selectedNewsletter?.id);
      if (updated) setSelectedNewsletter(updated as any);

      alert('記事を削除しました');
      console.log('✅ handleArticleDelete完了');
    } catch (error: any) {
      console.error('❌ 記事削除エラー:', error);
      alert(`記事の削除に失敗しました\n\nエラー: ${error.message}`);
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
    const confirmed = confirm(
      `「${newsletter.title}」を削除しますか？\n\n` +
      `記事数: ${newsletter.article_count}件\n\n` +
      `この操作は取り消せません。`
    );

    if (!confirmed) return;

    try {
      console.log('🗑️ 電子回覧板を削除中...', newsletter.id);
      await deleteNewsletter(newsletter.id);
      console.log('✅ 削除完了');

      // 一覧を再読み込み
      await loadNewsletters();

      // 削除したNewsletterが選択中だった場合、一覧に戻る
      if (selectedNewsletter && selectedNewsletter.id === newsletter.id) {
        handleBackToList();
      }

      alert(`「${newsletter.title}」を削除しました。`);
    } catch (error: any) {
      console.error('❌ 削除エラー:', error);
      alert(`削除に失敗しました\n\nエラー: ${error.message}`);
    }
  };

  // 記事表示モード
  if (selectedNewsletter) {
    return (
      <div className="space-y-4">
        {/* ヘッダーボタン */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleBackToList}
            className="flex items-center gap-2 text-primary-600 hover:text-primary-800 font-medium transition-colors"
          >
            <ArrowLeft size={18} />
            一覧に戻る
          </button>

          <div className="flex items-center gap-3">
            {/* PDFクロップ（記事抽出 + 画像追加 統合） */}
            {(selectedNewsletter?.source_pdf_urls?.length || selectedNewsletter?.source_pdf_url) && selectedNewsletter.status === 'draft' && (
              <button
                onClick={() => setShowArticleCrop(true)}
                className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 font-medium transition-colors"
                title="PDFから記事抽出・画像追加"
              >
                <Scissors size={18} />
                PDFクロップ
              </button>
            )}

            {/* 記事を手動追加（下書きのみ） */}
            {selectedNewsletter.status === 'draft' && (
              <button
                onClick={async () => {
                  const title = prompt('記事のタイトルを入力してください');
                  if (!title?.trim()) return;
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
                    await addArticlesToNewsletter(selectedNewsletter.id, [newArticle]);
                    const articleData = await getArticlesByNewsletterId(selectedNewsletter.id);
                    setArticles(articleData);
                  } catch (err: any) { alert(`記事の追加に失敗しました\n\n${err?.message || err}`); console.error('記事追加エラー:', err); }
                }}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors"
              >
                <Plus size={18} />
                記事を追加
              </button>
            )}

            {/* PDFを追加（下書きのみ） */}
            {onEditNewsletter && selectedNewsletter.status === 'draft' && (
              <button
                onClick={() => onEditNewsletter(selectedNewsletter as Newsletter & { article_count: number })}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium transition-colors"
              >
                <Edit size={18} />
                PDFを追加
              </button>
            )}

            {/* 編集する（公開済み → 下書きコピー作成） */}
            {selectedNewsletter.status === 'published' && (
              <button
                onClick={async () => {
                  if (!confirm('公開版のコピーを下書きとして作成します。\n公開中の内容はそのまま表示され続けます。')) return;
                  try {
                    const { newsletter: copy } = await duplicateNewsletterAsDraft(selectedNewsletter.id);
                    // 一覧を再読み込みしてコピーを表示
                    const updatedList = await getNewsletters();
                    setNewsletters(updatedList);
                    // コピーの詳細画面に遷移
                    const copyWithCount = updatedList.find((n) => n.id === copy.id);
                    if (copyWithCount) {
                      handleSelectNewsletter(copyWithCount);
                    }
                    alert(`「${copy.title}」の編集用コピーを作成しました`);
                  } catch (error) {
                    console.error('コピー作成エラー:', error);
                    alert('コピーの作成に失敗しました');
                  }
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
              >
                <Copy size={18} />
                編集する
              </button>
            )}

            {/* プレビューボタン */}
            <button
              onClick={() => setShowPreview(true)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 font-medium transition-colors"
              title="住民側の表示をプレビュー"
            >
              <Smartphone size={18} />
              プレビュー
            </button>

            {/* 公開 / 非公開ボタン */}
            {selectedNewsletter.status === 'draft' ? (
              <button
                onClick={async () => {
                  if (!confirm('この回覧板を公開しますか？\n公開すると住民に表示されます。')) return;
                  try {
                    const updated = await publishNewsletter(selectedNewsletter.id);
                    setSelectedNewsletter({ ...selectedNewsletter, ...updated } as any);
                    setNewsletters((prev) => prev.map((n) => n.id === updated.id ? { ...n, ...updated } : n));
                    alert('公開しました');
                  } catch (error) {
                    console.error('公開エラー:', error);
                    alert('公開に失敗しました');
                  }
                }}
                disabled={articles.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium transition-colors"
                title="公開する"
              >
                <Globe size={18} />
                公開する
              </button>
            ) : selectedNewsletter.status === 'published' ? (
              <button
                onClick={async () => {
                  if (!confirm('この回覧板を非公開にしますか？\n住民に表示されなくなります。')) return;
                  try {
                    const updated = await unpublishNewsletter(selectedNewsletter.id);
                    setSelectedNewsletter({ ...selectedNewsletter, ...updated } as any);
                    setNewsletters((prev) => prev.map((n) => n.id === updated.id ? { ...n, ...updated } : n));
                    alert('非公開にしました');
                  } catch (error) {
                    console.error('非公開エラー:', error);
                    alert('非公開への変更に失敗しました');
                  }
                }}
                className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 font-medium transition-colors"
                title="非公開にする"
              >
                <EyeOff size={18} />
                非公開にする
              </button>
            ) : null}

            {/* 削除ボタン */}
            <button
              onClick={() => handleDeleteNewsletter(selectedNewsletter as Newsletter & { article_count: number })}
              className="flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 font-medium transition-colors"
              title="削除"
            >
              <Trash2 size={18} />
              削除
            </button>
          </div>
        </div>

        {/* Newsletter情報 */}
        <div className="bg-white p-6 rounded-xl shadow border border-slate-200">
          <h2 className="text-2xl font-bold text-slate-800 mb-2">{selectedNewsletter.title}</h2>
          <div className="flex items-center gap-4 text-sm text-slate-600">
            <span className="flex items-center gap-1">
              <Calendar size={14} />
              {new Date(selectedNewsletter.created_at).toLocaleDateString('ja-JP', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </span>
            <span className="flex items-center gap-1">
              <FileText size={14} />
              {articles.length}件の記事
            </span>
            <span className="flex items-center gap-1">
              <FileText size={14} />
              {selectedNewsletter.source_pdf_urls?.length || 0}件のPDF
            </span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              selectedNewsletter.status === 'published'
                ? 'bg-green-100 text-green-700'
                : selectedNewsletter.status === 'draft'
                ? 'bg-yellow-100 text-yellow-700'
                : 'bg-gray-100 text-gray-700'
            }`}>
              {selectedNewsletter.status === 'published' ? '公開済み' :
               selectedNewsletter.status === 'draft' ? '下書き' : 'アーカイブ'}
            </span>
          </div>
        </div>

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
              🗓️ 今後のイベント ({eventCards.length}件)
            </h3>
            {selectedNewsletter.status === 'draft' && (
              <button
                onClick={async () => {
                  const title = prompt('イベント名を入力');
                  if (!title?.trim()) return;
                  const date = prompt('日付（例: 2026-05-09）');
                  const time = prompt('時間（例: 10:00-12:00、なければ空欄）');
                  const location = prompt('場所（例: 自治会館、なければ空欄）');
                  try {
                    await addEventCard({
                      newsletter_id: selectedNewsletter.id,
                      title: title.trim(),
                      event_date: date?.trim() || null,
                      event_time: time?.trim() || null,
                      event_location: location?.trim() || null,
                      linked_article_id: null,
                      display_order: eventCards.length,
                    });
                    const cards = await getEventCards(selectedNewsletter.id);
                    setEventCards(cards);
                  } catch { alert('追加に失敗しました'); }
                }}
                className="text-sm text-primary-600 hover:text-primary-800 font-medium flex items-center gap-1"
              >
                <Plus size={16} /> 追加
              </button>
            )}
          </div>
          {eventCards.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">イベントカードがありません</p>
          ) : (
            <div className="space-y-2">
              {eventCards.map((card) => {
                const linkedArticle = articles.find(a => a.id === card.linked_article_id);
                return (
                  <div key={card.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg group">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-blue-600">{card.event_date || '日付未定'}</span>
                        {card.event_time && <span className="text-xs text-slate-500">{card.event_time}</span>}
                      </div>
                      <p className="text-sm font-medium text-slate-800 truncate">{card.title}</p>
                      {card.event_location && <p className="text-xs text-slate-400">📍 {card.event_location}</p>}
                      {linkedArticle ? (
                        <p className="text-xs text-primary-600 mt-0.5">🔗 {linkedArticle.title}</p>
                      ) : selectedNewsletter.status === 'draft' ? (
                        <button
                          onClick={async () => {
                            const articleTitles = articles.map((a, i) => `${i + 1}. ${a.title}`).join('\n');
                            const input = prompt(`リンクする記事の番号を入力\n\n${articleTitles}\n\n（リンクしない場合は空欄）`);
                            if (input === null) return;
                            const num = parseInt(input);
                            if (num >= 1 && num <= articles.length) {
                              const { updateEventCard } = await import('@cc-saas/shared');
                              await updateEventCard(card.id, { linked_article_id: articles[num - 1].id });
                              const cards = await getEventCards(selectedNewsletter.id);
                              setEventCards(cards);
                            }
                          }}
                          className="text-xs text-amber-600 hover:text-amber-800 mt-0.5"
                        >
                          ＋ 記事をリンク
                        </button>
                      ) : null}
                    </div>
                    {selectedNewsletter.status === 'draft' && (
                      <button
                        onClick={async () => {
                          if (!confirm(`「${card.title}」を削除しますか？`)) return;
                          await deleteEventCard(card.id);
                          const cards = await getEventCards(selectedNewsletter.id);
                          setEventCards(cards);
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition shrink-0"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
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

        {/* 記事一覧 */}
        {isLoadingArticles ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={32} className="animate-spin text-primary-600" />
            <span className="ml-3 text-slate-600">記事を読み込み中...</span>
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
            onArticleUpdate={selectedNewsletter.status === 'draft' ? handleArticleUpdate : undefined}
            onArticleDelete={selectedNewsletter.status === 'draft' ? handleArticleDelete : undefined}
            enableDragAndDrop={selectedNewsletter.status === 'draft'}
            onArticlesReorder={selectedNewsletter.status === 'draft' ? (reordered) => setArticles(reordered) : undefined}
            availablePdfs={selectedNewsletter.source_pdf_urls?.map((p: any) => ({ url: p.url, label: p.label || 'PDF' }))}
          />
        ) : !selectedNewsletter.source_pdf_urls?.length && !selectedNewsletter.source_pdf_url ? (
          <div className="bg-slate-50 rounded-lg p-8 text-center">
            <FileText size={48} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-600">記事が見つかりませんでした</p>
          </div>
        ) : null}

        {/* 登録済みPDF一覧 */}
        {(() => {
          const pdfEntries: { url: string; label: string; publisher: string; filename: string; thumbnail: string; type: string }[] = (selectedNewsletter.source_pdf_urls || []).map((e: any) => {
            const url = typeof e === 'string' ? e : e.url;
            const label = typeof e === 'string' ? '' : (e.label || '');
            const publisher = typeof e === 'string' ? '' : (e.publisher || '');
            const thumbnail = typeof e === 'string' ? '' : (e.thumbnail || '');
            const type = typeof e === 'string' ? 'source' : (e.type || 'source');
            const filename = url.split('/').pop() || 'file.pdf';
            return { url, label, publisher, thumbnail, filename, type };
          });
          // source→attachmentの順にソート
          pdfEntries.sort((a, b) => (a.type === 'source' ? 0 : 1) - (b.type === 'source' ? 0 : 1));
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
                      const pdfjsLib = await import('pdfjs-dist');
                      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
                      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
                      const { uploadImage } = await import('@cc-saas/shared/services/data/storageService');
                      const { getSupabaseClient } = await import('@cc-saas/shared/services/supabaseClient');

                      let count = 0;
                      const entries: any[] = [...(selectedNewsletter.source_pdf_urls || [])];
                      for (let i = 0; i < entries.length; i++) {
                        const entry = entries[i];
                        const url = typeof entry === 'string' ? entry : entry.url;
                        // 全件再生成（既存サムネイルも上書き）
                        try {
                          const res = await fetch(url);
                          const buf = await res.arrayBuffer();
                          const doc = await pdfjsLib.getDocument({
                            data: buf,
                            cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.7.284/cmaps/',
                            cMapPacked: true,
                            useSystemFonts: true,
                          }).promise;
                          const page = await doc.getPage(1);
                          const vp = page.getViewport({ scale: 2.0 });
                          const canvas = document.createElement('canvas');
                          canvas.width = vp.width; canvas.height = vp.height;
                          const ctx = canvas.getContext('2d')!;
                          await page.render({ canvasContext: ctx, viewport: vp, canvas } as any).promise;
                          const blob = await new Promise<Blob>(r => canvas.toBlob(b => r(b!), 'image/png', 0.9));
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
                      const freshList = await getNewsletters();
                      setNewsletters(freshList);
                      const updated = freshList.find(n => n.id === selectedNewsletter.id);
                      if (updated) setSelectedNewsletter(updated as any);
                      const failed = entries.filter((e: any) => e.thumbnail === 'failed').length;
                      alert(`${count}件のサムネイルを生成しました` + (failed > 0 ? `\n${failed}件は自動生成できませんでした（手動アップロードしてください）` : ''));
                    }}
                    className="text-xs text-blue-500 hover:text-blue-700 hover:bg-blue-50 px-2 py-1 rounded transition"
                  >
                    サムネイル生成
                  </button>
                )}
                {selectedNewsletter.status === 'draft' && pdfEntries.length > 1 && (
                  <button
                    onClick={async () => {
                      if (!confirm(`${pdfEntries.length}件のPDFを全て削除しますか？`)) return;
                      try {
                        for (const pdf of pdfEntries) {
                          await removePdfUrlFromNewsletter(selectedNewsletter.id, pdf.url);
                        }
                        const freshList = await getNewsletters();
                        setNewsletters(freshList);
                        const updated = freshList.find((n) => n.id === selectedNewsletter.id);
                        if (updated) setSelectedNewsletter(updated as any);
                      } catch { alert('削除に失敗しました'); }
                    }}
                    className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition"
                  >
                    全て削除
                  </button>
                )}
                </div>
              </div>
              {sourcePdfs.length > 0 && <p className="text-xs font-medium text-blue-600 mb-2">📄 記事をPDF版で読む ({sourcePdfs.length}件)</p>}
              <div className="space-y-2">
                {pdfEntries.map((pdf, i) => (
                  <React.Fragment key={`pdf-${i}`}>
                  {/* 回覧板PDFセクションヘッダー */}
                  {pdf.type !== 'source' && (i === 0 || pdfEntries[i - 1]?.type === 'source') && (
                    <p className="text-xs font-medium text-green-600 pt-3 mt-2 border-t border-slate-100">📋 回覧板PDF ({attachPdfs.length}件)</p>
                  )}
                  <div
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg group"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
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
                            selectedNewsletter.status === 'draft' ? 'text-slate-700 cursor-pointer hover:text-blue-600' : 'text-slate-700'
                          }`}
                          onClick={() => {
                            if (selectedNewsletter.status !== 'draft') return;
                            const newLabel = prompt('ラベルを編集', pdf.label || pdf.filename);
                            if (newLabel === null || newLabel === pdf.label) return;
                            updatePdfLabel(selectedNewsletter.id, pdf.url, newLabel).then((updated) => {
                              setSelectedNewsletter({ ...selectedNewsletter, ...updated } as any);
                              setNewsletters((prev) => prev.map((n) => n.id === updated.id ? { ...n, ...updated } : n));
                            }).catch(() => alert('更新に失敗しました'));
                          }}
                          title={selectedNewsletter.status === 'draft' ? 'クリックして編集' : ''}
                        >
                          {pdf.label || pdf.filename}
                        </p>
                        <p
                          className={`text-xs truncate ${
                            selectedNewsletter.status === 'draft' ? 'text-slate-400 cursor-pointer hover:text-blue-500' : 'text-slate-400'
                          }`}
                          onClick={() => {
                            if (selectedNewsletter.status !== 'draft') return;
                            const presetList = publisherPresets.map((p, i) => `${i + 1}. ${p}`).join('\n');
                            const input = prompt(`発行元を選択または入力\n\n${presetList}\n\n番号を入力するか、自由に入力してください`, pdf.publisher);
                            if (input === null) return;
                            const num = parseInt(input);
                            const newPublisher = (num >= 1 && num <= publisherPresets.length) ? publisherPresets[num - 1] : input;
                            updatePdfLabel(selectedNewsletter.id, pdf.url, pdf.label, newPublisher).then((updated) => {
                              setSelectedNewsletter({ ...selectedNewsletter, ...updated } as any);
                              setNewsletters((prev) => prev.map((n) => n.id === updated.id ? { ...n, ...updated } : n));
                            }).catch(() => alert('更新に失敗しました'));
                          }}
                          title={selectedNewsletter.status === 'draft' ? 'クリックして発行元を編集' : ''}
                        >
                          {pdf.publisher ? `📍 ${pdf.publisher}` : (selectedNewsletter.status === 'draft' ? '＋ 発行元を設定' : '')}
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
                                try {
                                  const { uploadImage } = await import('@cc-saas/shared/services/data/storageService');
                                  const { getSupabaseClient } = await import('@cc-saas/shared/services/supabaseClient');
                                  const result = await uploadImage(file);
                                  const entries: any[] = [...(selectedNewsletter.source_pdf_urls || [])];
                                  const idx = entries.findIndex((en: any) => (typeof en === 'string' ? en : en.url) === pdf.url);
                                  if (idx >= 0) entries[idx] = { ...entries[idx], thumbnail: result.url };
                                  const supabase = getSupabaseClient();
                                  if (supabase) await supabase.from('newsletters').update({ source_pdf_urls: entries }).eq('id', selectedNewsletter.id);
                                  const freshList = await getNewsletters();
                                  setNewsletters(freshList);
                                  const updated = freshList.find(n => n.id === selectedNewsletter.id);
                                  if (updated) setSelectedNewsletter(updated as any);
                                } catch { alert('アップロードに失敗しました'); }
                                e.target.value = '';
                              }}
                            />
                            {pdf.thumbnail === 'pending' ? '⚠️ サムネイル未作成' : pdf.thumbnail && pdf.thumbnail !== 'failed' ? '📷 サムネイル差替え' : '📷 サムネイル追加'}
                          </label>
                        )}
                        {selectedNewsletter.status === 'draft' && (
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
                                  const freshList = await getNewsletters();
                                  setNewsletters(freshList);
                                  const updated = freshList.find(n => n.id === selectedNewsletter.id);
                                  if (updated) setSelectedNewsletter(updated as any);
                                }
                              } catch { alert('変更に失敗しました'); }
                            }}
                            className={`text-xs px-1.5 py-0.5 rounded transition ${
                              (typeof (selectedNewsletter.source_pdf_urls || [])[i] === 'object' && ((selectedNewsletter.source_pdf_urls || [])[i] as any)?.type === 'source')
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-green-100 text-green-700'
                            }`}
                          >
                            {(typeof (selectedNewsletter.source_pdf_urls || [])[i] === 'object' && ((selectedNewsletter.source_pdf_urls || [])[i] as any)?.type === 'source')
                              ? 'PDF版で読む'
                              : '回覧板PDF'}
                          </button>
                        )}
                      </div>
                    </div>
                    {selectedNewsletter.status === 'draft' && (
                      <div className="flex items-center gap-1 ml-2 shrink-0">
                        {/* 上下入替 */}
                        <div className="flex flex-col">
                          <button
                            onClick={async () => {
                              if (i === 0) return;
                              try {
                                const { getSupabaseClient } = await import('@cc-saas/shared/services/supabaseClient');
                                const entries: any[] = [...(selectedNewsletter.source_pdf_urls || [])];
                                [entries[i - 1], entries[i]] = [entries[i], entries[i - 1]];
                                const supabase = getSupabaseClient();
                                if (supabase) await supabase.from('newsletters').update({ source_pdf_urls: entries }).eq('id', selectedNewsletter.id);
                                const freshList = await getNewsletters();
                                setNewsletters(freshList);
                                const updated = freshList.find(n => n.id === selectedNewsletter.id);
                                if (updated) setSelectedNewsletter(updated as any);
                              } catch { }
                            }}
                            disabled={i === 0}
                            className="p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-20 transition"
                          >
                            <ChevronRight size={14} className="rotate-[-90deg]" />
                          </button>
                          <button
                            onClick={async () => {
                              if (i >= pdfEntries.length - 1) return;
                              try {
                                const { getSupabaseClient } = await import('@cc-saas/shared/services/supabaseClient');
                                const entries: any[] = [...(selectedNewsletter.source_pdf_urls || [])];
                                [entries[i], entries[i + 1]] = [entries[i + 1], entries[i]];
                                const supabase = getSupabaseClient();
                                if (supabase) await supabase.from('newsletters').update({ source_pdf_urls: entries }).eq('id', selectedNewsletter.id);
                                const freshList = await getNewsletters();
                                setNewsletters(freshList);
                                const updated = freshList.find(n => n.id === selectedNewsletter.id);
                                if (updated) setSelectedNewsletter(updated as any);
                              } catch { }
                            }}
                            disabled={i >= pdfEntries.length - 1}
                            className="p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-20 transition"
                          >
                            <ChevronRight size={14} className="rotate-90" />
                          </button>
                        </div>
                        {/* 削除 */}
                        <button
                          onClick={async () => {
                            if (!confirm(`「${pdf.label || pdf.filename}」を削除しますか？`)) return;
                            try {
                              const updated = await removePdfUrlFromNewsletter(selectedNewsletter.id, pdf.url);
                              setSelectedNewsletter({ ...selectedNewsletter, ...updated } as any);
                              setNewsletters((prev) => prev.map((n) => n.id === updated.id ? { ...n, ...updated } : n));
                            } catch (err) {
                              alert('削除に失敗しました');
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

            {/* ラベル */}
            <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow text-sm font-medium text-slate-700 flex items-center gap-2">
              <Smartphone size={16} />
              プレビュー（{selectedNewsletter.status === 'draft' ? '下書き' : '公開済み'}）
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
      <h2 className="text-2xl font-bold text-slate-800">保存済み電子回覧板</h2>

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
          <span className="ml-3 text-slate-600">読み込み中...</span>
        </div>
      ) : newsletters.length === 0 ? (
        /* 空状態 */
        <div className="bg-slate-50 rounded-lg p-12 text-center">
          <FileText size={64} className="mx-auto text-slate-300 mb-4" />
          <p className="text-lg font-medium text-slate-700 mb-2">
            保存された電子回覧板はありません
          </p>
          <p className="text-sm text-slate-500">
            電子回覧板タブで記事を抽出し、「保存する」ボタンをクリックしてください
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
                      {newsletter.status === 'published' ? '公開済み' :
                       newsletter.status === 'draft' ? '下書き' : 'アーカイブ'}
                    </span>
                    {newsletter.parent_id && newsletter.status === 'draft' && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                        編集版
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
