/**
 * 会員向けデジタル回覧板閲覧コンポーネント
 *
 * adminで作成されたデジタル回覧板（Newsletter/Article）を
 * 会員が閲覧できる機能を提供します。
 *
 * 主な機能:
 * - Newsletter一覧の取得と選択
 * - 選択したNewsletterの記事一覧表示
 * - 記事詳細モーダル表示
 * - コンパクトなUIデザイン（タグ小さめ、重要情報を目立たせる）
 */

import React, { useState, useEffect } from 'react';
import { Newsletter, Article, getNewsletters, getArticlesByNewsletterId } from '@cc-saas/shared';
import { FileText, Calendar, Tag, AlertCircle, Paperclip, X, ChevronDown, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

interface CircularsViewProps {
  isSimpleMode: boolean;
}

/**
 * カテゴリーアイコンマップ
 */
const CATEGORY_ICONS: Record<string, string> = {
  event: '🎉',
  notice: '📢',
  meeting: '📋',
  culture: '📚',
  report: '📊',
  fee: '💰',
};

/**
 * カテゴリー色マップ
 */
const CATEGORY_COLORS: Record<string, string> = {
  event: 'bg-blue-100 text-blue-700',
  notice: 'bg-yellow-100 text-yellow-700',
  meeting: 'bg-gray-100 text-gray-700',
  culture: 'bg-purple-100 text-purple-700',
  report: 'bg-green-100 text-green-700',
  fee: 'bg-orange-100 text-orange-700',
};

/**
 * カテゴリの英日マッピング
 */
const CATEGORY_LABELS: Record<string, string> = {
  'event': 'イベント',
  'notice': 'お知らせ',
  'meeting': '会議',
  'culture': '文化',
  'report': '報告',
  'fee': '会費',
  'local-info': '地域情報',
};

/**
 * タグの英日マッピング
 */
const TAG_LABELS: Record<string, string> = {
  // カテゴリ系
  'event': 'イベント',
  'notice': 'お知らせ',
  'meeting': '会議',
  'culture': '文化',
  'report': '報告',
  'fee': '会費',
  'local-info': '地域情報',
  
  // 季節・行事
  '正月': '正月',
  '夏祭り': '夏祭り',
  'どんど焼き': 'どんど焼き',
  
  // 場所
  '奥座公園': '奥座公園',
  '会館': '会館',
  '公民館': '公民館',
  
  // 一般的なタグ
  'ごみ': 'ごみ',
  '資源': '資源',
  '俳句': '俳句',
  'イベント': 'イベント',
  'お知らせ': 'お知らせ',
  '会議': '会議',
  '文化': '文化',
  '報告': '報告',
  '地域': '地域',
};

/**
 * 優先度バッジのスタイル
 */
const PRIORITY_STYLES: Record<string, string> = {
  high: 'bg-red-500 text-white',
  medium: 'bg-yellow-500 text-white',
  low: 'bg-gray-300 text-gray-700',
};

/**
 * 優先度ラベル
 */
const PRIORITY_LABELS: Record<string, string> = {
  high: '重要',
  medium: '通常',
  low: '参考',
};

const CircularsView: React.FC<CircularsViewProps> = ({ isSimpleMode }) => {
  // State管理
  const [newsletters, setNewsletters] = useState<(Newsletter & { article_count: number })[]>([]);
  const [selectedNewsletterId, setSelectedNewsletterId] = useState<string | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingArticles, setIsLoadingArticles] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ダイジェスト音声プレイヤーの状態管理
  const [showDigestPlayer, setShowDigestPlayer] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = React.useRef<HTMLAudioElement>(null);

  /**
   * Newsletter一覧を取得
   */
  useEffect(() => {
    const fetchNewsletters = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await getNewsletters();

        setNewsletters(data);

        // 最新のNewsletterを自動選択
        if (data.length > 0 && !selectedNewsletterId) {
          setSelectedNewsletterId(data[0].id);
        }
      } catch (err: any) {
        console.error('Newsletter取得エラー:', err);
        setError('デジタル回覧板の読み込みに失敗しました');
      } finally {
        setIsLoading(false);
      }
    };

    fetchNewsletters();
  }, []);

  /**
   * 選択されたNewsletterの記事を取得
   */
  useEffect(() => {
    const fetchArticles = async () => {
      if (!selectedNewsletterId) {
        setArticles([]);
        return;
      }

      setIsLoadingArticles(true);
      setError(null);
      try {
        const data = await getArticlesByNewsletterId(selectedNewsletterId);
        // 公開設定が'public'または'members-only'の記事のみ表示
        const visibleArticles = data.filter(
          (article) => article.visibility === 'public' || article.visibility === 'members-only'
        );

        // 優先度順にソート（高→中→低）
        // 優先度が同じ場合は、ピン留め → 表示順序 → 作成日時の順
        const sortedArticles = visibleArticles.sort((a, b) => {
          // 優先度のソート順を定義
          const priorityOrder = { high: 0, medium: 1, low: 2 };
          const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];

          if (priorityDiff !== 0) {
            return priorityDiff;
          }

          // 優先度が同じ場合はピン留めを優先
          if (a.is_pinned !== b.is_pinned) {
            return a.is_pinned ? -1 : 1;
          }

          // display_orderが設定されている場合はそれに従う
          if (a.display_order !== null && b.display_order !== null) {
            return a.display_order - b.display_order;
          }
          if (a.display_order !== null) return -1;
          if (b.display_order !== null) return 1;

          // 最後に作成日時の新しい順
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

        setArticles(sortedArticles);
      } catch (err: any) {
        console.error('記事取得エラー:', err);
        setError('記事の読み込みに失敗しました');
      } finally {
        setIsLoadingArticles(false);
      }
    };

    fetchArticles();
  }, [selectedNewsletterId]);

  /**
   * 日付フォーマット
   */
  const formatDate = (dateString: string | null): string => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  /**
   * 期限が近いかチェック（7日以内）
   */
  const isDeadlineNear = (deadline: string | null): boolean => {
    if (!deadline) return false;
    const deadlineDate = new Date(deadline);
    const today = new Date();
    const diffDays = Math.ceil((deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays <= 7 && diffDays >= 0;
  };

  /**
   * 記事詳細モーダルを開く
   */
  const openArticleDetail = (article: Article) => {
    setSelectedArticle(article);
  };

  /**
   * 記事詳細モーダルを閉じる
   */
  const closeArticleDetail = () => {
    setSelectedArticle(null);
  };

  /**
   * 選択されたNewsletterの情報を取得
   */
  const selectedNewsletter = newsletters.find((n) => n.id === selectedNewsletterId);

  return (
    <div className="space-y-4 pb-6">
      {/* ヘッダー */}
      <div className={`${isSimpleMode ? 'bg-white border-l-4 border-blue-600 rounded-r-lg shadow-sm' : 'bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl shadow-lg'} p-6`}>
        <div className="flex items-center gap-3 mb-2">
          <FileText size={28} className={isSimpleMode ? 'text-blue-600' : 'text-white'} />
          <h2 className={`text-2xl font-bold ${isSimpleMode ? 'text-slate-900' : 'text-white'}`}>
            デジタル回覧板
          </h2>
        </div>
        <p className={`text-sm ${isSimpleMode ? 'text-slate-600' : 'text-white/80'}`}>
          自治会からのお知らせや記事をご覧いただけます
        </p>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-start gap-3">
          <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">エラー</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Newsletter選択ドロップダウン */}
      {isLoading ? (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center justify-center">
          <Loader2 size={24} className="animate-spin text-blue-600" />
          <span className="ml-3 text-slate-600">読み込み中...</span>
        </div>
      ) : newsletters.length > 0 ? (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            回覧板を選択
          </label>
          <div className="relative">
            <select
              value={selectedNewsletterId || ''}
              onChange={(e) => setSelectedNewsletterId(e.target.value)}
              className={`w-full p-3 pr-10 border border-slate-300 rounded-lg appearance-none cursor-pointer transition-colors ${
                isSimpleMode
                  ? 'focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                  : 'focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500'
              }`}
            >
              {newsletters.map((newsletter) => (
                <option key={newsletter.id} value={newsletter.id}>
                  {newsletter.title} ({newsletter.article_count}件の記事)
                </option>
              ))}
            </select>
            <ChevronDown
              size={20}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
          </div>
          {selectedNewsletter && (
            <p className="mt-2 text-xs text-slate-500 flex items-center gap-2">
              <Calendar size={14} />
              {formatDate(selectedNewsletter.issue_date)}
            </p>
          )}
        </div>
      ) : (
        <div className="bg-slate-50 p-8 rounded-xl border border-slate-200 text-center">
          <FileText size={48} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-600">デジタル回覧板がまだ作成されていません</p>
        </div>
      )}

      {/* ダイジェスト音声ボタン */}
      {selectedNewsletter?.digest_audio_url && (
        <button
          onClick={() => setShowDigestPlayer(true)}
          className={`w-full p-6 rounded-xl border-2 transition-all hover:scale-[1.02] active:scale-[0.98] ${
            isSimpleMode
              ? 'border-blue-500 bg-gradient-to-br from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100'
              : 'border-indigo-500 bg-gradient-to-br from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100'
          }`}
        >
          <div className="flex flex-col items-center gap-4">
            {/* アニメーションアイコン */}
            <div className="relative w-24 h-24">
              <div className={`absolute inset-0 rounded-full animate-pulse opacity-20 ${
                isSimpleMode ? 'bg-blue-400' : 'bg-indigo-400'
              }`}></div>
              <div className={`absolute inset-4 rounded-full animate-pulse delay-75 opacity-20 ${
                isSimpleMode ? 'bg-indigo-400' : 'bg-purple-400'
              }`}></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-6xl animate-pulse">📻</span>
              </div>
            </div>
            {/* テキスト */}
            <div className="text-center">
              <h3 className={`text-2xl font-bold mb-1 ${
                isSimpleMode ? 'text-slate-900' : 'text-indigo-900'
              }`}>
                ラジオ回覧板
              </h3>
              <p className={`text-sm ${
                isSimpleMode ? 'text-slate-600' : 'text-indigo-700'
              }`}>
                （ダイジェスト版）
              </p>
            </div>
          </div>
        </button>
      )}

      {/* 記事一覧 */}
      {isLoadingArticles ? (
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 flex items-center justify-center">
          <Loader2 size={24} className="animate-spin text-blue-600" />
          <span className="ml-3 text-slate-600">記事を読み込み中...</span>
        </div>
      ) : articles.length > 0 ? (
        <div className="space-y-6">
          {/* 自治会公式の記事 */}
          {articles.filter(article => article.article_type === 'official').length > 0 && (
            <div className="space-y-3">
              {articles
                .filter(article => article.article_type === 'official')
                .map((article) => (
            <button
              key={article.id}
              onClick={() => openArticleDetail(article)}
              className={`w-full text-left p-4 rounded-xl border transition-all hover:scale-[1.02] active:scale-[0.98] ${
                isSimpleMode
                  ? 'bg-white border-slate-300 hover:border-blue-400 hover:shadow-md'
                  : 'bg-white border-slate-200 hover:border-indigo-400 hover:shadow-lg'
              }`}
            >
              <div className="flex gap-4">
                {/* サムネイル画像 */}
                {article.thumbnail_url ? (
                  <div className="flex-shrink-0 w-24 h-24 sm:w-32 sm:h-32 rounded-lg overflow-hidden bg-slate-100">
                    <img
                      src={article.thumbnail_url}
                      alt={article.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex-shrink-0 w-24 h-24 sm:w-32 sm:h-32 rounded-lg bg-slate-100 flex items-center justify-center">
                    <span className="text-4xl sm:text-5xl">{CATEGORY_ICONS[article.category] || '📄'}</span>
                  </div>
                )}

                {/* 記事内容 */}
                <div className="flex-1 min-w-0">
                  {/* ヘッダー行: カテゴリー + 優先度 */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          CATEGORY_COLORS[article.category] || 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {CATEGORY_LABELS[article.category] || article.category}
                      </span>
                    </div>
                    {article.priority === 'high' && (
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-bold ${
                          PRIORITY_STYLES[article.priority]
                        }`}
                      >
                        {PRIORITY_LABELS[article.priority]}
                      </span>
                    )}
                  </div>

                  {/* タイトル */}
                  <h3 className={`font-bold mb-1 ${isSimpleMode ? 'text-slate-900' : 'text-slate-800'}`}>
                    {article.title}
                  </h3>

                  {/* 要約 */}
                  <p className="text-sm text-slate-600 mb-2 line-clamp-2">{article.brief}</p>

                  {/* フッター: 期限 + タグ + 添付 */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* 期限 */}
                      {article.deadline && (
                        <span
                          className={`text-xs flex items-center gap-1 ${
                            isDeadlineNear(article.deadline)
                              ? 'text-red-600 font-bold'
                              : 'text-slate-500'
                          }`}
                        >
                          <Calendar size={12} />
                          期限: {formatDate(article.deadline)}
                        </span>
                      )}

                      {/* タグ（小さく表示） */}
                      {article.tags.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap">
                          {article.tags.slice(0, 2).map((tag, index) => (
                            <span
                              key={index}
                              className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded"
                            >
                              #{TAG_LABELS[tag] || tag}
                            </span>
                          ))}
                          {article.tags.length > 2 && (
                            <span className="text-[10px] text-slate-400">
                              +{article.tags.length - 2}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 添付ファイルアイコン */}
                    {article.attachments.length > 0 && (
                      <Paperclip size={14} className="text-slate-400" />
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}
            </div>
          )}

          {/* 地域のお知らせセクション */}
          {articles.filter(article => article.article_type === 'local-info').length > 0 && (
            <div>
              {/* セクションヘッダー */}
              <div className="mb-3">
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-slate-300"></div>
                  <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
                    地域のお知らせ
                  </h3>
                  <div className="h-px flex-1 bg-slate-300"></div>
                </div>
              </div>

              {/* 地域情報の記事一覧 */}
              <div className="space-y-3">
                {articles
                  .filter(article => article.article_type === 'local-info')
                  .map((article) => (
            <button
              key={article.id}
              onClick={() => openArticleDetail(article)}
              className={`w-full text-left p-4 rounded-xl border transition-all hover:scale-[1.02] active:scale-[0.98] ${
                isSimpleMode
                  ? 'bg-white border-slate-300 hover:border-blue-400 hover:shadow-md'
                  : 'bg-white border-slate-200 hover:border-indigo-400 hover:shadow-lg'
              }`}
            >
              <div className="flex gap-4">
                {/* サムネイル画像 */}
                {article.thumbnail_url ? (
                  <div className="flex-shrink-0 w-24 h-24 sm:w-32 sm:h-32 rounded-lg overflow-hidden bg-slate-100">
                    <img
                      src={article.thumbnail_url}
                      alt={article.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex-shrink-0 w-24 h-24 sm:w-32 sm:h-32 rounded-lg bg-slate-100 flex items-center justify-center">
                    <span className="text-4xl sm:text-5xl">{CATEGORY_ICONS[article.category] || '📄'}</span>
                  </div>
                )}

                {/* 記事内容 */}
                <div className="flex-1 min-w-0">
                  {/* ヘッダー行: カテゴリー + 優先度 */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          CATEGORY_COLORS[article.category] || 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {CATEGORY_LABELS[article.category] || article.category}
                      </span>
                    </div>
                    {article.priority === 'high' && (
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-bold ${
                          PRIORITY_STYLES[article.priority]
                        }`}
                      >
                        {PRIORITY_LABELS[article.priority]}
                      </span>
                    )}
                  </div>

                  {/* タイトル */}
                  <h3 className={`font-bold mb-1 ${isSimpleMode ? 'text-slate-900' : 'text-slate-800'}`}>
                    {article.title}
                  </h3>

                  {/* 要約 */}
                  <p className="text-sm text-slate-600 mb-2 line-clamp-2">{article.brief}</p>

                  {/* フッター: 期限 + タグ + 添付 */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* 期限 */}
                      {article.deadline && (
                        <span
                          className={`text-xs flex items-center gap-1 ${
                            isDeadlineNear(article.deadline)
                              ? 'text-red-600 font-bold'
                              : 'text-slate-500'
                          }`}
                        >
                          <Calendar size={12} />
                          期限: {formatDate(article.deadline)}
                        </span>
                      )}

                      {/* タグ（小さく表示） */}
                      {article.tags.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap">
                          {article.tags.slice(0, 2).map((tag, index) => (
                            <span
                              key={index}
                              className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded"
                            >
                              #{TAG_LABELS[tag] || tag}
                            </span>
                          ))}
                          {article.tags.length > 2 && (
                            <span className="text-[10px] text-slate-400">
                              +{article.tags.length - 2}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 添付ファイルアイコン */}
                    {article.attachments.length > 0 && (
                      <Paperclip size={14} className="text-slate-400" />
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}
              </div>
            </div>
          )}
        </div>
      ) : selectedNewsletterId ? (
        <div className="bg-slate-50 p-8 rounded-xl border border-slate-200 text-center">
          <FileText size={48} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-600">この回覧板にはまだ記事がありません</p>
        </div>
      ) : null}

      {/* 記事詳細モーダル */}
      {selectedArticle && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in"
          onClick={closeArticleDetail}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-in zoom-in-95 slide-in-from-bottom-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* モーダルヘッダー */}
            <div className={`sticky top-0 ${isSimpleMode ? 'bg-blue-50' : 'bg-gradient-to-br from-blue-600 to-indigo-600'} p-6 rounded-t-2xl`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-3xl">{CATEGORY_ICONS[selectedArticle.category] || '📄'}</span>
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        CATEGORY_COLORS[selectedArticle.category] || 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {CATEGORY_LABELS[selectedArticle.category] || selectedArticle.category}
                    </span>
                    {selectedArticle.priority === 'high' && (
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-bold ${
                          PRIORITY_STYLES[selectedArticle.priority]
                        }`}
                      >
                        {PRIORITY_LABELS[selectedArticle.priority]}
                      </span>
                    )}
                  </div>
                  <h2 className={`text-2xl font-bold ${isSimpleMode ? 'text-slate-900' : 'text-white'}`}>
                    {selectedArticle.title}
                  </h2>
                </div>
                <button
                  onClick={closeArticleDetail}
                  className={`p-2 rounded-full transition-colors ${
                    isSimpleMode
                      ? 'hover:bg-slate-200 text-slate-700'
                      : 'hover:bg-white/20 text-white'
                  }`}
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            {/* モーダル本文 */}
            <div className="p-6">
              {/* 要約セクション */}
              <div className="mb-6 p-4 bg-slate-50 rounded-xl">
                <p className="font-medium text-slate-700 mb-2">{selectedArticle.summary}</p>
                {selectedArticle.deadline && (
                  <p
                    className={`text-sm flex items-center gap-2 ${
                      isDeadlineNear(selectedArticle.deadline)
                        ? 'text-red-600 font-bold'
                        : 'text-slate-600'
                    }`}
                  >
                    <Calendar size={16} />
                    期限: {formatDate(selectedArticle.deadline)}
                  </p>
                )}
              </div>

              {/* 本文（マークダウン対応） */}
              <div className="prose-compact max-w-none mb-6 text-slate-700">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                  {selectedArticle.content}
                </ReactMarkdown>
              </div>

              {/* タグ */}
              {selectedArticle.tags.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                    <Tag size={16} />
                    タグ
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedArticle.tags.map((tag, index) => (
                      <span
                        key={index}
                        className="text-xs px-3 py-1 bg-slate-100 text-slate-600 rounded-full"
                      >
                        #{TAG_LABELS[tag] || tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 画像 */}
              {selectedArticle.attachments.filter(att => att.type === 'image').length > 0 && (
                <div className="mb-6">
                  <p className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
                    <FileText size={16} />
                    画像
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {selectedArticle.attachments
                      .filter(att => att.type === 'image')
                      .map((attachment, index) => (
                        <div key={index} className="group">
                          <a
                            href={attachment.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block rounded-lg overflow-hidden bg-slate-100 border border-slate-200 hover:border-blue-400 transition-all"
                          >
                            <img
                              src={attachment.url}
                              alt={attachment.label}
                              className="w-full h-auto object-cover"
                            />
                          </a>
                          <p className="mt-2 text-xs text-slate-600">{attachment.label}</p>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* PDFとその他の添付ファイル */}
              {selectedArticle.attachments.filter(att => att.type !== 'image').length > 0 && (
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                    <FileText size={16} />
                    元の回覧板を見る
                  </p>
                  <div className="space-y-2">
                    {selectedArticle.attachments
                      .filter(att => att.type !== 'image')
                      .map((attachment, index) => (
                        <a
                          key={index}
                          href={attachment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          <FileText size={20} className="text-blue-600" />
                          <span className="text-sm text-slate-700 flex-1">
                            {attachment.label || '回覧板PDF'}
                          </span>
                          <span className="text-xs text-slate-500 uppercase">{attachment.type}</span>
                        </a>
                      ))}
                  </div>
                </div>
              )}

              {/* ソース情報 */}
              <div className="mt-6 pt-4 border-t border-slate-200">
                <p className="text-xs text-slate-500">出典: {selectedArticle.source}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ダイジェスト音声プレイヤーモーダル */}
      {showDigestPlayer && selectedNewsletter?.digest_audio_url && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setShowDigestPlayer(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 animate-in zoom-in-95 slide-in-from-bottom-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ヘッダー */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-1">
                  ラジオ回覧板
                </h2>
                <p className="text-sm text-slate-600">
                  {selectedNewsletter.title}
                </p>
              </div>
              <button
                onClick={() => setShowDigestPlayer(false)}
                className="p-2 rounded-full hover:bg-slate-100 transition-colors"
              >
                <X size={24} className="text-slate-700" />
              </button>
            </div>

            {/* ラジオアイコン */}
            <div className="flex justify-center mb-6">
              <div className="relative w-32 h-32">
                <div className={`absolute inset-0 bg-blue-400 rounded-full opacity-20 ${
                  isPlaying ? 'animate-pulse' : ''
                }`}></div>
                <div className={`absolute inset-4 bg-indigo-400 rounded-full opacity-20 ${
                  isPlaying ? 'animate-pulse delay-75' : ''
                }`}></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`text-7xl ${isPlaying ? 'animate-pulse' : ''}`}>📻</span>
                </div>
              </div>
            </div>

            {/* 音声要素（非表示） */}
            <audio
              ref={audioRef}
              src={selectedNewsletter.digest_audio_url}
              onTimeUpdate={(e) => {
                const audio = e.currentTarget;
                setCurrentTime(audio.currentTime);
              }}
              onLoadedMetadata={(e) => {
                const audio = e.currentTarget;
                setDuration(audio.duration);
              }}
              onEnded={() => {
                setIsPlaying(false);
                setCurrentTime(0);
              }}
            />

            {/* プログレスバー */}
            <div className="mb-4">
              <div
                className="w-full h-2 bg-slate-200 rounded-full cursor-pointer overflow-hidden"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const percentage = x / rect.width;
                  const newTime = percentage * duration;
                  if (audioRef.current) {
                    audioRef.current.currentTime = newTime;
                  }
                }}
              >
                <div
                  className="h-full bg-indigo-600 transition-all"
                  style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* コントロールボタン */}
            <div className="flex items-center justify-center gap-6">
              {/* 再生/一時停止ボタン */}
              <button
                onClick={() => {
                  if (audioRef.current) {
                    if (isPlaying) {
                      audioRef.current.pause();
                      setIsPlaying(false);
                    } else {
                      audioRef.current.play();
                      setIsPlaying(true);
                    }
                  }
                }}
                className="w-16 h-16 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-lg"
              >
                <span className="text-3xl">{isPlaying ? '⏸️' : '▶️'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * 時間をフォーマット（秒 → mm:ss）
 */
const formatTime = (seconds: number): string => {
  if (isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export default CircularsView;
