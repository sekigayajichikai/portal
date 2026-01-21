import React, { useState } from 'react';
import {
  Circular,
  PublicEvent,
  extractEventsFromText,
  Newsletter,
  Article,
  saveNewsletter,
  addArticlesToNewsletter,
  getArticlesByNewsletterId,
} from '@cc-saas/shared';
// 統合AIサービスを使用（Anthropic/OpenRouterを自動選択）
import { extractArticlesFromPDF, convertPDFToBase64, extractPDFMetadata } from '@cc-saas/shared/services/aiService';
import { MOCK_CIRCULARS, MOCK_CATEGORIES, MOCK_ARTICLES } from '@/constants';
import { Sparkles, Send, Eye, Loader2, Calendar, FileText, Upload, Trash2, Save } from 'lucide-react';
import { ArticleList } from './ArticleList';
import { PDFMetadataDialog } from './PDFMetadataDialog';
import { NewsletterList } from './NewsletterList';

interface CircularBoardProps {
  onEventsExtracted: (events: PublicEvent[]) => void;
}

export const CircularBoard: React.FC<CircularBoardProps> = ({ onEventsExtracted }) => {
  // タブ管理
  const [activeTab, setActiveTab] = useState<'text' | 'pdf' | 'saved'>('text');
  
  // テキスト回覧板の状態
  const [circulars, setCirculars] = useState<Circular[]>(MOCK_CIRCULARS);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  
  // デジタル回覧板の状態
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
  
  // Supabase保存の状態
  const [isSaving, setIsSaving] = useState(false);

  // 編集モードの状態
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingNewsletterId, setEditingNewsletterId] = useState<string | null>(null);

  // 月号形式の状態
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);

  // 年と月の選択肢を生成
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);

  /**
   * 月号形式のタイトルを生成
   */
  const generateMonthlyTitle = () => {
    return `${selectedYear}年${selectedMonth}月号`;
  };

  /**
   * デジタル回覧板と記事をSupabaseに保存
   */
  const handleSaveNewsletter = async () => {
    if (accumulatedArticles.length === 0) {
      alert('保存する記事がありません');
      return;
    }

    // タイトルの確認
    let title = newsletterTitle.trim();
    if (!title && !isEditMode) {
      title = prompt('デジタル回覧板のタイトルを入力してください', '無題のデジタル回覧板');
      if (!title) return; // キャンセルされた場合
      setNewsletterTitle(title);
    }

    setIsSaving(true);
    try {
      if (isEditMode && editingNewsletterId) {
        // 編集モード：新規記事のみを追加
        console.log('📝 編集モード：新規記事を追加中...');

        // 新規記事のみをフィルタ（idがa-で始まるのは新規作成した記事）
        const newArticles = accumulatedArticles.filter(
          (article) => !article.id || article.id.startsWith('a-')
        );

        if (newArticles.length === 0) {
          alert('追加する新規記事がありません');
          setIsSaving(false);
          return;
        }

        // 記事データを準備
        const articlesToAdd = newArticles.map((article) => ({
          organization_id: import.meta.env.VITE_DEFAULT_ORGANIZATION_ID || null,
          title: article.title,
          category: article.category,
          priority: article.priority,
          deadline: article.deadline,
          headline: article.headline,
          brief: article.brief,
          summary: article.summary,
          content: article.content,
          tags: article.tags,
          visibility: article.visibility,
          source: article.source,
          attachments: article.attachments,
          display_order: null,
          is_pinned: article.is_pinned,
        }));

        console.log('💾 記事追加開始:', {
          newsletterId: editingNewsletterId,
          newArticleCount: articlesToAdd.length,
        });

        // 新規記事を追加
        const addedArticles = await addArticlesToNewsletter(editingNewsletterId, articlesToAdd);

        alert(
          `✅ 追加しました！\n\n新規記事: ${addedArticles.length}件\n\n「保存済み一覧」タブで確認できます。`
        );

        // 状態をリセット
        setAccumulatedArticles([]);
        setUploadedPDFs([]);
        setNewsletterTitle('');
        setIsEditMode(false);
        setEditingNewsletterId(null);
        setCurrentNewsletter(null);

        // 保存済みタブに切り替え
        setActiveTab('saved');

        console.log('✅ 記事追加完了:', addedArticles.length, '件');
      } else {
        // 新規作成モード：従来通り
        console.log('📝 新規作成モード：Newsletterを保存中...');

        // Newsletter情報を構築
        const newsletter = {
          organization_id: import.meta.env.VITE_DEFAULT_ORGANIZATION_ID || null,
          title: title,
          issue_date: new Date().toISOString().split('T')[0],
          source_pdf_url: null,
          status: 'draft' as const,
          created_by: import.meta.env.VITE_DEFAULT_USER_ID || null,
          published_at: null,
        };

        // 記事データを準備（不要なフィールドを除外）
        const articlesToSave = accumulatedArticles.map((article) => ({
          organization_id: import.meta.env.VITE_DEFAULT_ORGANIZATION_ID || null,
          title: article.title,
          category: article.category,
          priority: article.priority,
          deadline: article.deadline,
          headline: article.headline,
          brief: article.brief,
          summary: article.summary,
          content: article.content,
          tags: article.tags,
          visibility: article.visibility,
          source: article.source,
          attachments: article.attachments,
          display_order: null,
          is_pinned: article.is_pinned,
        }));

        console.log('💾 保存開始:', {
          newsletter: newsletter.title,
          articleCount: articlesToSave.length,
        });

        // Supabaseに保存
        const result = await saveNewsletter(newsletter, articlesToSave);

        alert(
          `✅ 保存しました！\n\nデジタル回覧板: ${result.newsletter.title}\n記事数: ${result.articles.length}件\n\n「保存済み一覧」タブで確認できます。`
        );

        // 状態をリセット
        setAccumulatedArticles([]);
        setUploadedPDFs([]);
        setNewsletterTitle('');
        setCurrentNewsletter(null);

        console.log('✅ 保存完了:', result);
      }
    } catch (error: any) {
      console.error('❌ 保存エラー:', error);
      alert(`保存に失敗しました\n\nエラー: ${error.message}\n\nSupabaseの接続設定を確認してください。`);
    } finally {
      setIsSaving(false);
    }
  };

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
   * 共通のデジタル回覧板作成処理
   */
  const createNewsletter = (title: string) => {
    const newNewsletter: Newsletter = {
      id: `n-${Date.now()}`,
      organization_id: 'org1',
      title: title,
      issue_date: new Date().toISOString().split('T')[0],
      source_pdf_url: null,
      status: 'draft',
      created_by: 'admin1',
      created_at: new Date().toISOString(),
      published_at: null,
    };

    setCurrentNewsletter(newNewsletter);
    setAccumulatedArticles([]);
    setUploadedPDFs([]);
    setNewsletters([newNewsletter, ...newsletters]);

    // カスタムの場合は入力欄をクリア
    if (title !== generateMonthlyTitle()) {
      setNewsletterTitle('');
    }

    alert(`デジタル回覧板「${title}」を作成しました。PDFを追加してください。`);
  };

  /**
   * 月号形式でデジタル回覧板を作成
   */
  const handleCreateMonthlyNewsletter = () => {
    const title = generateMonthlyTitle();
    createNewsletter(title);
  };

  /**
   * カスタムタイトルでデジタル回覧板を作成
   */
  const handleCreateCustomNewsletter = () => {
    const title = newsletterTitle.trim();
    if (!title) {
      alert('タイトルを入力してください');
      return;
    }
    createNewsletter(title);
  };

  /**
   * ステップ1: PDFを選択してメタデータを抽出
   */
  const handlePDFSelectAndExtractMetadata = async () => {
    if (!currentNewsletter) {
      alert('先にデジタル回覧板を作成してください');
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
   * デジタル回覧板編集のリセット
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
    setIsEditMode(false);
    setEditingNewsletterId(null);
  };

  /**
   * 既存のデジタル回覧板を編集モードで開く
   */
  const handleStartEdit = async (newsletter: Newsletter & { article_count: number }) => {
    try {
      // 編集中のデータがある場合は確認
      if (currentNewsletter && accumulatedArticles.length > 0) {
        if (!confirm('編集中のデータが失われます。よろしいですか？')) {
          return;
        }
      }

      console.log('📝 編集モードを開始:', newsletter.title);

      // タブをPDFタブに切り替え
      setActiveTab('pdf');

      // 編集モードを有効化
      setIsEditMode(true);
      setEditingNewsletterId(newsletter.id);
      setCurrentNewsletter(newsletter);
      setNewsletterTitle(newsletter.title);

      // 既存記事を読み込み
      console.log('📄 既存記事を読み込み中...');
      const articles = await getArticlesByNewsletterId(newsletter.id);
      setAccumulatedArticles(articles);
      console.log(`✅ ${articles.length}件の記事を読み込みました`);

      // PDFリストをリセット（新規追加のみ）
      setUploadedPDFs([]);

      alert(`「${newsletter.title}」を編集モードで開きました。\n追加のPDFをアップロードできます。`);
    } catch (error: any) {
      console.error('❌ 編集モード開始エラー:', error);
      alert(`編集モードの開始に失敗しました\n\nエラー: ${error.message}`);
    }
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
            <span>新規作成</span>
          </div>
        </button>
        <button
          onClick={() => setActiveTab('saved')}
          className={`px-6 py-2 rounded-lg font-medium transition-all ${
            activeTab === 'saved'
              ? 'bg-primary-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-2">
            <Save size={18} />
            <span>保存済み一覧</span>
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
                新しいデジタル回覧板を作成
              </h3>
              
              <div className="space-y-6">
                {/* 月号形式セクション */}
                <div className="space-y-3">
                  <h4 className="font-medium text-slate-700 flex items-center gap-2">
                    <Calendar size={16} className="text-primary-600" />
                    月号形式
                  </h4>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-2">
                      年月を選択
                    </label>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <select
                          value={selectedYear}
                          onChange={(e) => setSelectedYear(Number(e.target.value))}
                          className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        >
                          {yearOptions.map(year => (
                            <option key={year} value={year}>{year}年</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex-1">
                        <select
                          value={selectedMonth}
                          onChange={(e) => setSelectedMonth(Number(e.target.value))}
                          className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        >
                          {monthOptions.map(month => (
                            <option key={month} value={month}>{month}月</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                  
                  {/* プレビュー */}
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-700">
                      タイトル: <span className="font-bold">{generateMonthlyTitle()}</span>
                    </p>
                  </div>
                  
                  <button
                    onClick={handleCreateMonthlyNewsletter}
                    className="w-full px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium transition-colors"
                  >
                    月号形式で作成
                  </button>
                </div>

                {/* 区切り線 */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-3 bg-white text-slate-500">または</span>
                  </div>
                </div>

                {/* カスタムタイトルセクション */}
                <div className="space-y-3">
                  <h4 className="font-medium text-slate-700 flex items-center gap-2">
                    <FileText size={16} className="text-primary-600" />
                    カスタムタイトル
                  </h4>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-2">
                      タイトル（自由入力）
                    </label>
                    <input
                      type="text"
                      value={newsletterTitle}
                      onChange={(e) => setNewsletterTitle(e.target.value)}
                      className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="例: 特別号、臨時号、新年号など"
                    />
                  </div>
                  
                  <button
                    onClick={handleCreateCustomNewsletter}
                    disabled={!newsletterTitle}
                    className="w-full px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    カスタムで作成
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Newsletter作成後: PDF追加セクション */}
          {currentNewsletter && (
            <div className="space-y-6">
              {/* Newsletter情報バナー */}
              <div className={`p-4 rounded-xl border ${
                isEditMode 
                  ? 'bg-orange-50 border-orange-200' 
                  : 'bg-primary-50 border-primary-200'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className={`font-bold ${
                      isEditMode ? 'text-orange-900' : 'text-primary-900'
                    }`}>
                      {isEditMode ? '編集中' : '作成中'}: {currentNewsletter.title}
                    </h3>
                    <p className={`text-sm mt-1 ${
                      isEditMode ? 'text-orange-700' : 'text-primary-700'
                    }`}>
                      {isEditMode ? (
                        <>
                          既存の記事: {accumulatedArticles.filter(a => a.id && !a.id.startsWith('a-')).length}件 / 
                          新規追加: {accumulatedArticles.filter(a => !a.id || a.id.startsWith('a-')).length}件
                          {uploadedPDFs.length > 0 && ` / 追加PDF: ${uploadedPDFs.length}個`}
                        </>
                      ) : (
                        <>
                          合計 {accumulatedArticles.length} 件の記事
                          {uploadedPDFs.length > 0 && ` / ${uploadedPDFs.length} 個のPDF`}
                        </>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={handleResetNewsletter}
                    className={`text-sm underline ${
                      isEditMode 
                        ? 'text-orange-600 hover:text-orange-800' 
                        : 'text-primary-600 hover:text-primary-800'
                    }`}
                  >
                    {isEditMode ? 'キャンセル' : 'リセット'}
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
                      {isEditMode ? (
                        <>
                          記事一覧 ({accumulatedArticles.length}件)
                          <span className="text-sm font-normal text-slate-500 ml-2">
                            既存: {accumulatedArticles.filter(a => a.id && !a.id.startsWith('a-')).length}件 / 
                            新規: {accumulatedArticles.filter(a => !a.id || a.id.startsWith('a-')).length}件
                          </span>
                        </>
                      ) : (
                        `抽出された記事 (${accumulatedArticles.length}件)`
                      )}
                    </h3>
                    <button
                      onClick={handleSaveNewsletter}
                      disabled={isSaving}
                      className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          {isEditMode ? '追加中...' : '保存中...'}
                        </>
                      ) : (
                        <>
                          <Save size={16} />
                          {isEditMode ? '追加の記事を保存' : '保存する'}
                        </>
                      )}
                    </button>
                  </div>
                  
                  <ArticleList
                    articles={accumulatedArticles}
                    categories={MOCK_CATEGORIES}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 保存済み一覧セクション */}
      {activeTab === 'saved' && (
        <div className="bg-white p-6 rounded-2xl shadow border border-slate-200">
          <NewsletterList onEditNewsletter={handleStartEdit} />
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
