import React, { useState } from 'react';
import {
  Circular,
  PublicEvent,
  extractEventsFromText,
  Newsletter,
  Article,
} from '@cc-saas/shared';
// 統合AIサービスを使用（Anthropic/OpenRouterを自動選択）
import { extractArticlesFromPDF, convertPDFToBase64, extractPDFMetadata } from '@cc-saas/shared/services/aiService';
import { MOCK_CIRCULARS, MOCK_CATEGORIES, MOCK_ARTICLES } from '@/constants';
import { Sparkles, Send, Eye, Loader2, Calendar, FileText, Upload, Trash2 } from 'lucide-react';
import { ArticleList } from './ArticleList';
import { PDFMetadataDialog } from './PDFMetadataDialog';

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
  const [newsletterTitle, setNewsletterTitle] = useState('');
  
  // 複数PDF対応の新しい状態管理
  const [currentNewsletter, setCurrentNewsletter] = useState<Newsletter | null>(null);
  const [uploadedPDFs, setUploadedPDFs] = useState<{
    file: File;
    articleCount: number;
    uploadedAt: string;
    title: string;       // PDFのタイトル（例: 関ヶ谷だより）
    issueNumber: string; // 号数（例: 第123号）
    pdfId: string;       // 一意識別子
  }[]>([]);
  const [accumulatedArticles, setAccumulatedArticles] = useState<Article[]>([]);
  const [selectedPDF, setSelectedPDF] = useState<File | null>(null);
  const [isProcessingPDF, setIsProcessingPDF] = useState(false);
  
  // メタデータ入力ダイアログの状態
  const [showMetadataDialog, setShowMetadataDialog] = useState(false);
  const [suggestedMetadata, setSuggestedMetadata] = useState({
    suggestedTitle: '',
    suggestedIssueNumber: '',
  });
  const [pendingPDFBase64, setPendingPDFBase64] = useState<string | null>(null);
  const [isMetadataLoading, setIsMetadataLoading] = useState(false);

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
    } else {
      alert('PDFファイルを選択してください');
    }
  };

  /**
   * Newsletter作成（タイトルのみ）
   */
  const handleCreateNewsletter = () => {
    if (!newsletterTitle) {
      alert('タイトルを入力してください');
      return;
    }

    const newNewsletter: Newsletter = {
      id: `n-${Date.now()}`,
      organization_id: 'org1',
      title: newsletterTitle,
      issue_date: new Date().toISOString().split('T')[0],
      source_pdf_url: null,
      status: 'draft',
      created_by: 'admin1',
      created_at: new Date().toISOString(),
      published_at: null,
    };

    setCurrentNewsletter(newNewsletter);
    setAccumulatedArticles([]); // 記事をリセット
    setUploadedPDFs([]); // PDFリストをリセット
    setNewsletters([newNewsletter, ...newsletters]);
    alert(`Newsletter「${newsletterTitle}」を作成しました。PDFを追加してください。`);
  };

  /**
   * ステップ1: PDFを選択してメタデータを抽出
   */
  const handlePDFSelectAndExtractMetadata = async () => {
    if (!currentNewsletter) {
      alert('先にNewsletterを作成してください');
      return;
    }

    if (!selectedPDF) {
      alert('PDFファイルを選択してください');
      return;
    }

    setIsProcessingPDF(true);
    setIsMetadataLoading(true);

    try {
      // PDFをBase64に変換
      const pdfBase64 = await convertPDFToBase64(selectedPDF);
      setPendingPDFBase64(pdfBase64);

      // AIでメタデータ提案
      const metadata = await extractPDFMetadata(pdfBase64);
      console.log('🔍 CircularBoard: AIから取得したメタデータ:', metadata);
      
      setSuggestedMetadata(metadata);
      console.log('🔍 CircularBoard: setSuggestedMetadata実行後');

      // ダイアログを表示
      console.log('🔍 CircularBoard: ダイアログを表示します。現在のsuggestedMetadata:', metadata);
      setShowMetadataDialog(true);
    } catch (error) {
      console.error('メタデータ抽出エラー:', error);
      alert('PDFの読み込みに失敗しました');
    } finally {
      setIsProcessingPDF(false);
      setIsMetadataLoading(false);
    }
  };

  /**
   * ステップ2: メタデータ確定後、記事を抽出
   */
  const handleConfirmMetadataAndExtractArticles = async (
    title: string,
    issueNumber: string
  ) => {
    if (!currentNewsletter || !selectedPDF || !pendingPDFBase64) {
      return;
    }

    setShowMetadataDialog(false);
    setIsProcessingPDF(true);

    try {
      // Claude APIで記事抽出
      const result = await extractArticlesFromPDF(pendingPDFBase64, MOCK_CATEGORIES);
      const processingTime = result.processingTime;

      const pdfId = `pdf-${Date.now()}`;

      // 記事にIDとsourceを付与
      const newArticles: Article[] = result.articles.map((article, index) => ({
        id: `a-${Date.now()}-${index}`,
        newsletter_id: currentNewsletter.id,
        organization_id: 'org1',
        ...article,
        source: `${title}${issueNumber ? ` ${issueNumber}` : ''}`, // ソース情報を記録
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      // 既存の記事に追加
      setAccumulatedArticles(prev => [...prev, ...newArticles]);

      // PDFリストに追加（拡張されたメタデータ付き）
      setUploadedPDFs(prev => [
        ...prev,
        {
          file: selectedPDF,
          articleCount: newArticles.length,
          uploadedAt: new Date().toISOString(),
          title: title,
          issueNumber: issueNumber,
          pdfId: pdfId,
        },
      ]);

      // 選択をクリア
      setSelectedPDF(null);
      setPendingPDFBase64(null);

      alert(
        `${title}から${newArticles.length}件の記事を追加しました\n` +
        `処理時間: ${(processingTime / 1000).toFixed(1)}秒\n` +
        `合計: ${accumulatedArticles.length + newArticles.length}件の記事`
      );
    } catch (error) {
      console.error('記事抽出エラー:', error);
      alert('記事抽出に失敗しました');
    } finally {
      setIsProcessingPDF(false);
    }
  };

  /**
   * メタデータ入力をキャンセル
   */
  const handleCancelMetadata = () => {
    setShowMetadataDialog(false);
    setPendingPDFBase64(null);
    setIsProcessingPDF(false);
    setIsMetadataLoading(false);
  };

  /**
   * 記事の保存
   */
  const handleSaveArticles = (articles: Article[]) => {
    console.log('記事を保存:', articles);
    alert(`${articles.length}件の記事を保存しました（Stage 1: ローカルのみ）`);
    // 将来的にSupabaseに保存
  };

  /**
   * Newsletter編集のリセット
   */
  const handleResetNewsletter = () => {
    if (accumulatedArticles.length > 0) {
      if (!confirm('編集中のデータがリセットされます。よろしいですか？')) {
        return;
      }
    }
    setCurrentNewsletter(null);
    setAccumulatedArticles([]);
    setUploadedPDFs([]);
    setSelectedPDF(null);
    setNewsletterTitle('');
  };

  /**
   * 登録済みPDFを削除
   */
  const handleDeletePDF = (pdfId: string) => {
    const pdf = uploadedPDFs.find(p => p.pdfId === pdfId);
    if (!pdf) return;

    if (!confirm(`「${pdf.title}」を削除しますか？\nこのPDFから抽出された記事も削除されます。`)) {
      return;
    }

    // このPDFから抽出された記事を削除
    const pdfSource = `${pdf.title}${pdf.issueNumber ? ` ${pdf.issueNumber}` : ''}`;
    setAccumulatedArticles(prev => prev.filter(article => article.source !== pdfSource));

    // PDFリストから削除
    setUploadedPDFs(prev => prev.filter(p => p.pdfId !== pdfId));

    alert(`「${pdf.title}」とその記事を削除しました`);
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
          {/* Newsletter未作成時: 作成フォーム */}
          {!currentNewsletter && (
            <div className="bg-white p-6 rounded-2xl shadow border border-primary-100">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                <FileText size={20} className="text-primary-600" />
                新しい広報誌を作成
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">
                    タイトル（例: 2025年1月号）
                  </label>
                  <input
                    type="text"
                    value={newsletterTitle}
                    onChange={(e) => setNewsletterTitle(e.target.value)}
                    className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="2025年1月号"
                  />
                </div>
                
                <button
                  onClick={handleCreateNewsletter}
                  disabled={!newsletterTitle}
                  className="w-full px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Newsletterを作成
                </button>
              </div>
            </div>
          )}

          {/* Newsletter作成後: PDF追加セクション */}
          {currentNewsletter && (
            <div className="space-y-6">
              {/* Newsletter情報バナー */}
              <div className="bg-primary-50 p-4 rounded-xl border border-primary-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-primary-900">
                      編集中: {currentNewsletter.title}
                    </h3>
                    <p className="text-sm text-primary-700 mt-1">
                      合計 {accumulatedArticles.length} 件の記事
                      {uploadedPDFs.length > 0 && ` / ${uploadedPDFs.length} 個のPDF`}
                    </p>
                  </div>
                  <button
                    onClick={handleResetNewsletter}
                    className="text-sm text-primary-600 hover:text-primary-800 underline"
                  >
                    リセット
                  </button>
                </div>
              </div>

              {/* 登録済みPDF一覧 */}
              {uploadedPDFs.length > 0 && (
                <div className="bg-white p-4 rounded-xl border border-slate-200">
                  <h4 className="font-bold text-slate-800 mb-3">登録済みPDF ({uploadedPDFs.length}件)</h4>
                  <div className="space-y-2">
                    {uploadedPDFs.map((pdf) => (
                      <div
                        key={pdf.pdfId}
                        className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <FileText size={18} className="text-primary-600" />
                          <div>
                            <p className="font-medium text-slate-700">
                              {pdf.title}
                              {pdf.issueNumber && (
                                <span className="text-slate-500 ml-2 text-sm">{pdf.issueNumber}</span>
                              )}
                            </p>
                            <p className="text-xs text-slate-500">
                              {pdf.articleCount}件の記事 • {pdf.file.name}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-slate-400">
                            {new Date(pdf.uploadedAt).toLocaleTimeString('ja-JP')}
                          </span>
                          <button
                            onClick={() => handleDeletePDF(pdf.pdfId)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-lg transition-colors"
                            title="削除"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* PDFアップロードセクション */}
              <div className="bg-white p-6 rounded-2xl shadow border border-slate-200">
                <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Upload size={20} className="text-primary-600" />
                  PDFを追加
                </h4>
                
                <div className="space-y-4">
                  <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-primary-400 transition-colors">
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={handlePDFSelect}
                      className="hidden"
                      id="pdf-add"
                    />
                    <label
                      htmlFor="pdf-add"
                      className="cursor-pointer inline-flex flex-col items-center gap-2"
                    >
                      {selectedPDF ? (
                        <>
                          <FileText size={32} className="text-primary-600" />
                          <span className="text-sm font-medium text-slate-700">
                            {selectedPDF.name}
                          </span>
                          <span className="text-xs text-slate-500">
                            {(selectedPDF.size / 1024 / 1024).toFixed(2)} MB
                          </span>
                        </>
                      ) : (
                        <>
                          <Upload size={32} className="text-slate-400" />
                          <span className="text-sm font-medium text-slate-600">
                            クリックしてPDFを選択
                          </span>
                          <span className="text-xs text-slate-400">最大10MBまで</span>
                        </>
                      )}
                    </label>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setSelectedPDF(null)}
                      className="flex-1 px-4 py-2 text-slate-500 hover:bg-slate-50 rounded-lg disabled:opacity-50"
                      disabled={!selectedPDF}
                    >
                      クリア
                    </button>
                    <button
                      onClick={handlePDFSelectAndExtractMetadata}
                      disabled={!selectedPDF || isProcessingPDF}
                      className="flex-1 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isProcessingPDF ? (
                        <>
                          <Loader2 size={18} className="animate-spin" />
                          処理中...
                        </>
                      ) : (
                        <>
                          <Sparkles size={18} />
                          記事を抽出して追加
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* 記事一覧表示 */}
              {accumulatedArticles.length > 0 && (
                <div className="bg-white p-6 rounded-2xl shadow border border-slate-200">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-slate-800">
                      抽出された記事 ({accumulatedArticles.length}件)
                    </h3>
                  </div>
                  
                  <ArticleList
                    articles={accumulatedArticles}
                    categories={MOCK_CATEGORIES}
                    onSave={handleSaveArticles}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
      
      {/* PDFメタデータ入力ダイアログ */}
      {console.log('🔍 CircularBoard: ダイアログに渡すprops:', {
        isOpen: showMetadataDialog,
        fileName: selectedPDF?.name || '',
        suggestedTitle: suggestedMetadata.suggestedTitle,
        suggestedIssueNumber: suggestedMetadata.suggestedIssueNumber,
      })}
      <PDFMetadataDialog
        isOpen={showMetadataDialog}
        fileName={selectedPDF?.name || ''}
        suggestedTitle={suggestedMetadata.suggestedTitle}
        suggestedIssueNumber={suggestedMetadata.suggestedIssueNumber}
        onConfirm={handleConfirmMetadataAndExtractArticles}
        onCancel={handleCancelMetadata}
      />

      {/* メタデータ解析中のローディング表示 */}
      {isMetadataLoading && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-40">
          <div className="bg-white rounded-xl px-6 py-4 shadow-xl flex items-center gap-3">
            <Loader2 size={20} className="animate-spin text-primary-600" />
            <span className="text-slate-700 font-medium">PDFを解析中...</span>
          </div>
        </div>
      )}
    </div>
  );
};
