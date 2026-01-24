/**
 * デジタル回覧板一覧コンポーネント
 *
 * 保存されたデジタル回覧板の一覧を表示し、選択すると記事を表示します。
 */

import React, { useEffect, useState } from 'react';
import { getNewsletters, getArticlesByNewsletterId, deleteNewsletter, deleteArticle, generateRadioProgram, getRadioProgramByNewsletterId } from '@cc-saas/shared';
import { Newsletter, Article, RadioGenerationProgress } from '@cc-saas/shared/types';
import { FileText, Calendar, ChevronRight, ArrowLeft, Loader2, AlertCircle, Edit, Trash2, Radio, Download, Play } from 'lucide-react';
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

  // ラジオ番組生成の状態
  const [isGeneratingRadio, setIsGeneratingRadio] = useState(false);
  const [radioProgress, setRadioProgress] = useState<RadioGenerationProgress | null>(null);
  const [generatedRadioUrl, setGeneratedRadioUrl] = useState<string | null>(null);
  const [existingRadioProgram, setExistingRadioProgram] = useState<any | null>(null);

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
    setGeneratedRadioUrl(null);
    setExistingRadioProgram(null);

    try {
      console.log('📄 記事を読み込み中... デジタル回覧板:', newsletter.title);
      const articleData = await getArticlesByNewsletterId(newsletter.id);
      setArticles(articleData);
      console.log('✅ 記事読み込み完了:', articleData.length, '件');

      // 既存のラジオ番組をチェック
      const radioProgram = await getRadioProgramByNewsletterId(newsletter.id);
      if (radioProgram) {
        setExistingRadioProgram(radioProgram);
        setGeneratedRadioUrl(radioProgram.audio_url);
        console.log('📻 既存のラジオ番組を発見:', radioProgram.title);
      }
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
    setGeneratedRadioUrl(null);
    setRadioProgress(null);
    setExistingRadioProgram(null);
  };

  /**
   * ラジオ番組を生成
   */
  const handleGenerateRadio = async () => {
    if (!selectedNewsletter) return;

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'NewsletterList.tsx:112',message:'handleGenerateRadio entry',data:{newsletterId:selectedNewsletter.id,newsletterTitle:selectedNewsletter.title,articlesCount:articles.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'ALL'})}).catch(()=>{});
    // #endregion

    const confirmed = confirm(
      `「${selectedNewsletter.title}」のラジオ番組を生成しますか？\n\n` +
      `記事数: ${articles.length}件\n` +
      `生成時間: 約1-2分\n\n` +
      (existingRadioProgram ? '既存のラジオ番組は上書きされます。' : '')
    );

    if (!confirmed) return;

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'NewsletterList.tsx:128',message:'User confirmed, starting generation',data:{confirmed:true},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'ALL'})}).catch(()=>{});
    // #endregion

    setIsGeneratingRadio(true);
    setRadioProgress({
      status: 'generating',
      currentStep: '準備中...',
      progress: 0,
    });

    try {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'NewsletterList.tsx:140',message:'About to call generateRadioProgram',data:{newsletterId:selectedNewsletter.id,organizationId:selectedNewsletter.organization_id},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'ALL'})}).catch(()=>{});
      // #endregion

      const radioProgram = await generateRadioProgram(
        {
          newsletterId: selectedNewsletter.id,
          organizationId: selectedNewsletter.organization_id,
          targetDurationMinutes: 4,
        },
        (progress) => {
          setRadioProgress(progress);
        }
      );

      setGeneratedRadioUrl(radioProgram.audio_url);
      setExistingRadioProgram(radioProgram);

      alert(
        `✅ ラジオ番組の生成が完了しました！\n\n` +
        `タイトル: ${radioProgram.title}\n` +
        `長さ: ${Math.floor(radioProgram.duration_seconds / 60)}分${radioProgram.duration_seconds % 60}秒\n` +
        `記事数: ${radioProgram.article_count}件`
      );
    } catch (error: any) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'NewsletterList.tsx:158',message:'Error in handleGenerateRadio',data:{errorMessage:error.message,errorStack:error.stack,errorType:error.constructor.name},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'ALL'})}).catch(()=>{});
      // #endregion

      console.error('❌ ラジオ番組生成エラー:', error);
      alert(`ラジオ番組の生成に失敗しました\n\nエラー: ${error.message}`);
      setRadioProgress(null);
    } finally {
      setIsGeneratingRadio(false);
    }
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

      alert('記事を削除しました');
      console.log('✅ handleArticleDelete完了');
    } catch (error: any) {
      console.error('❌ 記事削除エラー:', error);
      alert(`記事の削除に失敗しました\n\nエラー: ${error.message}`);
      throw error; // エラーを再スロー
    }
  };

  /**
   * デジタル回覧板を削除
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
      console.log('🗑️ デジタル回覧板を削除中...', newsletter.id);
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
            {/* ラジオ番組生成ボタン */}
            <button
              onClick={handleGenerateRadio}
              disabled={isGeneratingRadio || articles.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
              title="ラジオ番組を生成"
            >
              {isGeneratingRadio ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Radio size={18} />
                  {existingRadioProgram ? 'ラジオを再生成' : 'ラジオ番組を生成'}
                </>
              )}
            </button>

            {/* 編集ボタン（下書きのみ） */}
            {onEditNewsletter && selectedNewsletter.status === 'draft' && (
              <button
                onClick={() => onEditNewsletter(selectedNewsletter as Newsletter & { article_count: number })}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium transition-colors"
              >
                <Edit size={18} />
                PDFを追加
              </button>
            )}

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
            {existingRadioProgram && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-pink-100 text-pink-700">
                <Radio size={12} />
                ラジオ番組あり
              </span>
            )}
          </div>
        </div>

        {/* ラジオ番組生成進捗表示 */}
        {isGeneratingRadio && radioProgress && (
          <div className="bg-gradient-to-r from-pink-50 to-purple-50 p-6 rounded-xl shadow border border-pink-200 animate-in fade-in slide-in-from-top-4">
            <div className="flex items-center gap-3 mb-3">
              <Loader2 size={24} className="animate-spin text-pink-600" />
              <div>
                <h3 className="font-bold text-slate-800">ラジオ番組を生成中</h3>
                <p className="text-sm text-slate-600">{radioProgress.currentStep}</p>
              </div>
            </div>
            <div className="w-full bg-white rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-pink-500 to-purple-500 h-2.5 transition-all duration-500 ease-out"
                style={{ width: `${radioProgress.progress}%` }}
              ></div>
            </div>
            <p className="text-xs text-slate-500 mt-2 text-right">{radioProgress.progress}%</p>
          </div>
        )}

        {/* 生成されたラジオ番組プレイヤー */}
        {generatedRadioUrl && existingRadioProgram && (
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6 rounded-2xl shadow-lg text-white animate-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-pink-500 rounded-full flex items-center justify-center animate-pulse">
                  <Radio size={20} />
                </div>
                <div>
                  <h3 className="font-bold">{existingRadioProgram.title}</h3>
                  <p className="text-xs text-slate-400">
                    {Math.floor(existingRadioProgram.duration_seconds / 60)}分{existingRadioProgram.duration_seconds % 60}秒 •
                    {existingRadioProgram.article_count}件の記事
                  </p>
                </div>
              </div>
              <a
                href={generatedRadioUrl}
                download={existingRadioProgram.audio_filename}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                title="ダウンロード"
              >
                <Download size={20} />
              </a>
            </div>
            <audio controls src={generatedRadioUrl} className="w-full" />
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => window.open(generatedRadioUrl, '_blank')}
                className="flex-1 py-2 bg-pink-500 hover:bg-pink-600 text-white font-bold text-sm rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                <Play size={16} />
                新しいタブで開く
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

        {/* 記事一覧 */}
        {isLoadingArticles ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={32} className="animate-spin text-primary-600" />
            <span className="ml-3 text-slate-600">記事を読み込み中...</span>
          </div>
        ) : articles.length > 0 ? (
          <ArticleList
            articles={articles}
            categories={MOCK_CATEGORIES}
            onArticleUpdate={handleArticleUpdate}
            onArticleDelete={handleArticleDelete}
          />
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
    </div>
  );
};
