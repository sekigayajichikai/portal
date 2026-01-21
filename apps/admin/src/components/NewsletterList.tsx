/**
 * デジタル回覧板一覧コンポーネント
 * 
 * 保存されたデジタル回覧板の一覧を表示し、選択すると記事を表示します。
 */

import React, { useEffect, useState } from 'react';
import { getNewsletters, getArticlesByNewsletterId } from '@cc-saas/shared';
import { Newsletter, Article } from '@cc-saas/shared/types';
import { FileText, Calendar, ChevronRight, ArrowLeft, Loader2, AlertCircle, Edit } from 'lucide-react';
import { ArticleList } from './ArticleList';
import { MOCK_CATEGORIES } from '@/constants';

/**
 * NewsletterListコンポーネントのProps
 */
interface NewsletterListProps {
  onEditNewsletter?: (newsletter: Newsletter & { article_count: number }) => void;
}

/**
 * NewsletterListコンポーネント
 * 
 * 保存されたデジタル回覧板一覧と、選択したデジタル回覧板の記事を表示します。
 */
export const NewsletterList: React.FC<NewsletterListProps> = ({ onEditNewsletter }) => {
  const [newsletters, setNewsletters] = useState<(Newsletter & { article_count: number })[]>([]);
  const [selectedNewsletter, setSelectedNewsletter] = useState<Newsletter | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingArticles, setIsLoadingArticles] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * コンポーネントマウント時にデジタル回覧板一覧を読み込み
   */
  useEffect(() => {
    loadNewsletters();
  }, []);

  /**
   * デジタル回覧板一覧を取得
   */
  const loadNewsletters = async () => {
    setIsLoading(true);
    setError(null);
    try {
      console.log('📋 デジタル回覧板一覧を読み込み中...');
      const data = await getNewsletters();
      setNewsletters(data);
      console.log('✅ デジタル回覧板読み込み完了:', data.length, '件');
    } catch (error: any) {
      console.error('❌ デジタル回覧板読み込みエラー:', error);
      setError('デジタル回覧板の読み込みに失敗しました: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * デジタル回覧板選択時に記事を読み込み
   */
  const handleSelectNewsletter = async (newsletter: Newsletter & { article_count: number }) => {
    setSelectedNewsletter(newsletter);
    setIsLoadingArticles(true);
    setError(null);
    try {
      console.log('📄 記事を読み込み中... デジタル回覧板:', newsletter.title);
      const articleData = await getArticlesByNewsletterId(newsletter.id);
      setArticles(articleData);
      console.log('✅ 記事読み込み完了:', articleData.length, '件');
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
          
          {/* 編集ボタン（下書きのみ） */}
          {onEditNewsletter && selectedNewsletter.status === 'draft' && (
            <button
              onClick={() => onEditNewsletter(selectedNewsletter as Newsletter & { article_count: number })}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium transition-colors"
            >
              <Edit size={18} />
              編集する
            </button>
          )}
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

        {/* 記事一覧 */}
        {isLoadingArticles ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={32} className="animate-spin text-primary-600" />
            <span className="ml-3 text-slate-600">記事を読み込み中...</span>
          </div>
        ) : articles.length > 0 ? (
          <ArticleList articles={articles} categories={MOCK_CATEGORIES} />
        ) : (
          <div className="bg-slate-50 rounded-lg p-8 text-center">
            <FileText size={48} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-600">記事が見つかりませんでした</p>
          </div>
        )}
      </div>
    );
  }

  // Newsletter一覧モード
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">保存済みデジタル回覧板</h2>

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
            保存されたデジタル回覧板はありません
          </p>
          <p className="text-sm text-slate-500">
            デジタル回覧板タブで記事を抽出し、「保存する」ボタンをクリックしてください
          </p>
        </div>
      ) : (
        /* Newsletter一覧 */
        <div className="space-y-3">
          {newsletters.map((newsletter) => (
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
                  </div>
                </div>
                <ChevronRight className="text-slate-400 flex-shrink-0" size={20} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
