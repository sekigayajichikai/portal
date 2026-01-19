import React, { useState } from 'react';
import {
  Circular,
  PublicEvent,
  extractEventsFromText,
  Newsletter,
  Article,
} from '@cc-saas/shared';
// 統合AIサービスを使用（Anthropic/OpenRouterを自動選択）
import { extractArticlesFromPDF, convertPDFToBase64 } from '@cc-saas/shared/services/aiService';
import { MOCK_CIRCULARS, MOCK_CATEGORIES, MOCK_ARTICLES } from '@/constants';
import { Sparkles, Send, Eye, Loader2, Calendar, FileText, Upload } from 'lucide-react';
import { ArticleList } from './ArticleList';

interface CircularBoardProps {
  onEventsExtracted: (events: PublicEvent[]) => void;
}

export const CircularBoard: React.FC<CircularBoardProps> = ({ onEventsExtracted }) => {
  // タブ管理
  const [activeTab, setActiveTab] = useState<'text' | 'pdf'>('text');
  
  // テキスト回覧板の状態
  const [circulars, setCirculars] = useState<Circular[]>(MOCK_CIRCULARS);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  
  // PDF広報誌の状態
  const [newsletters, setNewsletters] = useState<Newsletter[]>([]);
  const [extractedArticles, setExtractedArticles] = useState<Article[]>(MOCK_ARTICLES);
  const [isProcessingPDF, setIsProcessingPDF] = useState(false);
  const [selectedPDF, setSelectedPDF] = useState<File | null>(null);
  const [newsletterTitle, setNewsletterTitle] = useState('');

  const handleCreate = async () => {
    if (!newTitle || !newContent) return;

    const newCircular: Circular = {
      id: Date.now().toString(),
      title: newTitle,
      content: newContent,
      date: new Date().toISOString().split('T')[0],
      category: 'notice',
      author: '管理者',
      readCount: 0,
      totalTarget: 124,
    };

    setCirculars([newCircular, ...circulars]);
    setIsCreating(false);
    setNewTitle('');
    setNewContent('');
  };

  const handleExtractEvents = async (circular: Circular) => {
    if (circular.extractedEvents) return; // Already extracted

    setIsExtracting(true);
    try {
      const events = await extractEventsFromText(circular.content);
      const updatedCirculars = circulars.map((c) =>
        c.id === circular.id ? { ...c, extractedEvents: events } : c
      );
      setCirculars(updatedCirculars);

      if (events.length > 0) {
        onEventsExtracted(events);
      }
    } catch (error) {
      console.error('イベント抽出エラー:', error);
      alert('イベント抽出に失敗しました。');
    } finally {
      setIsExtracting(false);
    }
  };

  /**
   * PDFファイル選択時の処理
   */
  const handlePDFSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setSelectedPDF(file);
      // ファイル名から月号を推測
      const filename = file.name.replace('.pdf', '');
      setNewsletterTitle(filename || `${new Date().getFullYear()}年${new Date().getMonth() + 1}月号`);
    } else {
      alert('PDFファイルを選択してください');
    }
  };

  /**
   * PDF広報誌の作成と記事の抽出
   * Claude APIを使用してPDFから記事を抽出します
   */
  const handleCreateNewsletter = async () => {
    if (!newsletterTitle) {
      alert('タイトルを入力してください');
      return;
    }

    setIsProcessingPDF(true);

    try {
      let extractedArticleData: Omit<
        Article,
        'id' | 'newsletter_id' | 'organization_id' | 'created_at' | 'updated_at'
      >[] = [];
      let processingTime = 0;

      // PDFファイルがある場合は、Claude APIで抽出
      if (selectedPDF) {
        try {
          // PDFをBase64に変換
          const pdfBase64 = await convertPDFToBase64(selectedPDF);

          // Claude APIで記事抽出
          const result = await extractArticlesFromPDF(pdfBase64, MOCK_CATEGORIES);
          extractedArticleData = result.articles;
          processingTime = result.processingTime;

          console.log(`Claude API処理時間: ${processingTime}ms`);
        } catch (error) {
          console.error('Claude API エラー:', error);
          alert(
            'Claude APIでの抽出に失敗しました。APIキーを確認してください。\nモックデータを表示します。'
          );
          // フォールバックとしてモックデータを使用
          extractedArticleData = MOCK_ARTICLES.map((a) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { id, newsletter_id, organization_id, created_at, updated_at, ...rest } = a;
            return rest;
          });
        }
      } else {
        // PDFがない場合はモックデータを使用
        extractedArticleData = MOCK_ARTICLES.map((a) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { id, newsletter_id, organization_id, created_at, updated_at, ...rest } = a;
          return rest;
        });
      }

      // 広報誌を作成
      const newNewsletter: Newsletter = {
        id: `n-${Date.now()}`,
        organization_id: 'org1',
        title: newsletterTitle,
        issue_date: new Date().toISOString().split('T')[0],
        source_pdf_url: selectedPDF ? URL.createObjectURL(selectedPDF) : null,
        status: 'draft',
        created_by: 'admin1',
        created_at: new Date().toISOString(),
        published_at: null,
      };

      setNewsletters([newNewsletter, ...newsletters]);

      // 記事データにID等を追加して表示
      const articlesWithIds: Article[] = extractedArticleData.map((article, index) => ({
        id: `a-${Date.now()}-${index}`,
        newsletter_id: newNewsletter.id,
        organization_id: 'org1',
        ...article,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      setExtractedArticles(articlesWithIds);

      const message = selectedPDF
        ? `${articlesWithIds.length}件の記事を抽出しました（処理時間: ${(processingTime / 1000).toFixed(1)}秒）`
        : `${articlesWithIds.length}件の記事を表示しました（モックデータ）`;
      alert(message);
    } catch (error) {
      console.error('広報誌作成エラー:', error);
      alert('広報誌の作成に失敗しました');
    } finally {
      setIsProcessingPDF(false);
    }
  };

  /**
   * 記事の保存
   */
  const handleSaveArticles = (articles: Article[]) => {
    console.log('記事を保存:', articles);
    alert(`${articles.length}件の記事を保存しました（Stage 1: ローカルのみ）`);
  };

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-700">デジタル回覧板</h2>
        {activeTab === 'text' && (
          <button
            onClick={() => setIsCreating(!isCreating)}
            className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-xl shadow-sm transition-colors flex items-center gap-2 font-medium"
          >
            <Send size={18} />
            新規作成・配信
          </button>
        )}
      </div>

      {/* タブ切り替え */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-1 inline-flex gap-1">
        <button
          onClick={() => setActiveTab('text')}
          className={`px-6 py-2 rounded-lg font-medium transition-all ${
            activeTab === 'text'
              ? 'bg-primary-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-2">
            <Send size={18} />
            <span>テキスト回覧板</span>
          </div>
        </button>
        <button
          onClick={() => setActiveTab('pdf')}
          className={`px-6 py-2 rounded-lg font-medium transition-all ${
            activeTab === 'pdf'
              ? 'bg-primary-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-2">
            <FileText size={18} />
            <span>PDF広報誌</span>
          </div>
        </button>
      </div>

      {/* テキスト回覧板セクション */}
      {activeTab === 'text' && isCreating && (
        <div className="bg-white p-6 rounded-2xl shadow border border-primary-100 animate-in fade-in slide-in-from-top-4">
          <h3 className="font-bold text-slate-800 mb-4">新しい回覧板を作成</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">タイトル</label>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="例: 防災訓練のお知らせ"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">内容</label>
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                className="w-full p-2 border border-slate-200 rounded-lg h-32 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="詳細を入力してください..."
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsCreating(false)}
                className="px-4 py-2 text-slate-500 hover:bg-slate-50 rounded-lg"
              >
                キャンセル
              </button>
              <button
                onClick={handleCreate}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium"
              >
                配信する
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'text' && (
        <div className="grid grid-cols-1 gap-4">
          {circulars.map((circular) => (
          <div
            key={circular.id}
            className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-primary-200 transition-colors"
          >
            <div className="flex justify-between items-start mb-3">
              <div className="flex gap-2 items-center">
                <span
                  className={`text-xs px-2 py-1 rounded-md font-bold ${
                    circular.category === 'event'
                      ? 'bg-blue-100 text-blue-700'
                      : circular.category === 'notice'
                        ? 'bg-slate-100 text-slate-700'
                        : 'bg-orange-100 text-orange-700'
                  }`}
                >
                  {circular.category.toUpperCase()}
                </span>
                <span className="text-sm text-slate-400">{circular.date}</span>
              </div>
              <div className="flex items-center text-xs text-slate-500 gap-1 bg-slate-50 px-2 py-1 rounded-full">
                <Eye size={14} />
                <span>
                  既読: {circular.readCount} / {circular.totalTarget}
                </span>
              </div>
            </div>

            <h3 className="text-lg font-bold text-slate-800 mb-2">{circular.title}</h3>
            <p className="text-slate-600 text-sm whitespace-pre-wrap mb-4 leading-relaxed">
              {circular.content}
            </p>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <div className="text-xs text-slate-400">作成者: {circular.author}</div>

              {!circular.extractedEvents ? (
                <button
                  onClick={() => handleExtractEvents(circular)}
                  disabled={isExtracting}
                  className="flex items-center gap-2 text-sm text-purple-600 hover:bg-purple-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isExtracting ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Sparkles size={16} />
                  )}
                  <span>AIでイベント情報を抽出・公開</span>
                </button>
              ) : (
                <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg">
                  <Calendar size={16} />
                  <span>公開カレンダーに反映済み ({circular.extractedEvents.length}件)</span>
                </div>
              )}
            </div>
          </div>
          ))}
        </div>
      )}

      {/* PDF広報誌セクション */}
      {activeTab === 'pdf' && (
        <div className="space-y-6">
          {/* Newsletter作成フォーム */}
          <div className="bg-white p-6 rounded-2xl shadow border border-primary-100">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              <FileText size={20} className="text-primary-600" />
              新しい広報誌を作成
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">
                  タイトル
                </label>
                <input
                  type="text"
                  value={newsletterTitle}
                  onChange={(e) => setNewsletterTitle(e.target.value)}
                  className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="例: 2025年1月号"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">
                  PDFファイル
                </label>
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-primary-400 transition-colors">
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={handlePDFSelect}
                    className="hidden"
                    id="pdf-upload"
                  />
                  <label
                    htmlFor="pdf-upload"
                    className="cursor-pointer inline-flex flex-col items-center gap-2"
                  >
                    <Upload size={32} className="text-slate-400" />
                    <span className="text-sm font-medium text-slate-600">
                      {selectedPDF ? selectedPDF.name : 'クリックしてPDFを選択'}
                    </span>
                    <span className="text-xs text-slate-400">
                      {selectedPDF
                        ? `${(selectedPDF.size / 1024 / 1024).toFixed(2)} MB`
                        : '最大10MBまで'}
                    </span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setSelectedPDF(null);
                    setNewsletterTitle('');
                  }}
                  className="px-4 py-2 text-slate-500 hover:bg-slate-50 rounded-lg"
                  disabled={isProcessingPDF}
                >
                  クリア
                </button>
                <button
                  onClick={handleCreateNewsletter}
                  disabled={!newsletterTitle || isProcessingPDF}
                  className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isProcessingPDF ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      処理中...
                    </>
                  ) : (
                    <>
                      <Sparkles size={18} />
                      記事を抽出
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* 記事プレビュー */}
          {extractedArticles.length > 0 && (
            <div className="bg-white p-6 rounded-2xl shadow border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-800">
                  抽出された記事 ({extractedArticles.length}件)
                </h3>
                <span className="text-sm text-slate-500">
                  Stage 1: モックデータ表示中
                </span>
              </div>
              
              <ArticleList
                articles={extractedArticles}
                categories={MOCK_CATEGORIES}
                onSave={handleSaveArticles}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
