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
  getNewsletters,
  findDuplicateArticles,
  DuplicatePair,
  filterDuplicateArticles,
  deleteArticle,
  addPdfUrlToNewsletter,
} from '@cc-saas/shared';
// 統合AIサービスを使用（Anthropic/OpenRouterを自動選択）
import { extractArticlesFromPDF, extractBriefArticleFromPDF, convertPDFToBase64, extractPDFMetadata } from '@cc-saas/shared/services/ai/aiService';
import { uploadPDF, uploadImage } from '@cc-saas/shared/services/data/storageService';
import { MOCK_CIRCULARS, MOCK_CATEGORIES, MOCK_ARTICLES } from '@cc-saas/shared/constants';
import { Sparkles, Loader2, Calendar, FileText, Upload, Trash2, Save, Check, ChevronRight, Edit3, ArrowLeft, X } from 'lucide-react';
import { ArticleList } from './ArticleList';
import { PDFMetadataDialog } from './PDFMetadataDialog';
import { NewsletterList } from './NewsletterList';
import { DuplicateDetectionDialog, DuplicateAction } from './DuplicateDetectionDialog';

/** PDFファイルからサムネイル画像を生成してStorageにアップロード */
async function generatePdfThumbnail(pdfFile: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

  const arrayBuffer = await pdfFile.arrayBuffer();
  const doc = await pdfjsLib.getDocument({
    data: arrayBuffer,
    cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.7.284/cmaps/',
    cMapPacked: true,
    useSystemFonts: true,
  }).promise;
  const page = await doc.getPage(1);
  const scale = 2.0;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;
  await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;

  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b!), 'image/png', 0.9);
  });
  doc.destroy();

  const thumbFile = new File([blob], `thumb-${Date.now()}.jpg`, { type: 'image/jpeg' });
  const result = await uploadImage(thumbFile);
  return result.url;
}

export const CircularBoard: React.FC = () => {
  // タブ管理
  const [activeTab, setActiveTab] = useState<'pdf' | 'saved'>('saved');

  // テキスト回覧板の状態
  const [circulars, setCirculars] = useState<Circular[]>(MOCK_CIRCULARS);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);

  // 電子回覧板の状態
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
  const [returnToNewsletterId, setReturnToNewsletterId] = useState<string | null>(null);

  // 重複検出の状態
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [detectedDuplicates, setDetectedDuplicates] = useState<DuplicatePair[]>([]);
  const [pendingNewArticles, setPendingNewArticles] = useState<Article[]>([]);

  // 月号形式の状態
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);

  // 抽出モードの状態（'detailed' = 詳細な4段階要約、'brief' = 簡易要約+PDF添付）
  const [extractionMode, setExtractionMode] = useState<'detailed' | 'brief'>('detailed');

  // バルクインポート
  const [isBulkImporting, setIsBulkImporting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });

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
   * 電子回覧板と記事をSupabaseに保存
   *
   * Newsletter作成時に即座に保存されるため、この関数は編集モードでのみ使用されます。
   */
  const handleSaveNewsletter = async () => {
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
          article_type: article.article_type,
          priority: article.priority,
          control_date: article.control_date,
          headline: article.headline,
          brief: article.brief,
          summary: article.summary,
          content: article.content,
          tags: article.tags,
          visibility: article.visibility,
          source: article.source,
          attachments: article.attachments,
          thumbnail_url: article.thumbnail_url,
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
        // 新規作成モードでは来ないはず（作成時に即保存されるため）
        console.warn('⚠️ 編集モードではありません。Newsletter作成時に既に保存されているはずです。');
        alert('このNewsletterは既に保存されています。\n\n「保存済み一覧」タブから編集モードで開いてください。');
        setIsSaving(false);
        return;
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
        console.log('抽出されたイベント:', events);
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
   * 共通の電子回覧板作成処理
   *
   * Newsletter作成時に即座にSupabaseに保存します（記事0件で保存）。
   * 保存後は編集モードとして扱い、後からPDFを追加できます。
   */
  const createNewsletter = async (title: string) => {
    try {
      console.log('📝 Newsletter作成開始:', title);

      // 既存のタイトルをチェック
      console.log('🔍 既存のタイトルをチェック中...');
      const existingNewsletters = await getNewsletters();
      const duplicateTitle = existingNewsletters.find(
        (n) => n.title.toLowerCase() === title.toLowerCase()
      );

      if (duplicateTitle) {
        alert(
          `エラー: 同じ名前の電子回覧板が既に存在します。\n\n` +
          `既存: 「${duplicateTitle.title}」\n` +
          `作成日: ${new Date(duplicateTitle.created_at).toLocaleDateString('ja-JP')}\n\n` +
          `別の名前を指定してください。`
        );
        return;
      }

      // Supabaseに空のNewsletterを保存
      const newsletter = {
        organization_id: import.meta.env.VITE_DEFAULT_ORGANIZATION_ID || null,
        title: title,
        issue_date: new Date().toISOString().split('T')[0],
        source_pdf_url: null,
        status: 'draft' as const,
        created_by: import.meta.env.VITE_DEFAULT_USER_ID || null,
        published_at: null,
        parent_id: null,
      };

      // 記事0件で保存
      console.log('💾 Supabaseに保存中...（記事0件）');
      const result = await saveNewsletter(newsletter, []);
      console.log('✅ Newsletter保存完了:', result.newsletter.id);

      // 保存されたNewsletterを編集モードとして扱う
      setCurrentNewsletter(result.newsletter);
      setEditingNewsletterId(result.newsletter.id);
      setIsEditMode(true);
      setNewsletterTitle(title);
      setAccumulatedArticles([]);
      setUploadedPDFs([]);

      // カスタムの場合は入力欄をクリア
      if (title !== generateMonthlyTitle()) {
        setNewsletterTitle('');
      }

      alert(`電子回覧板「${title}」を作成しました。\nSupabaseに保存済みです。PDFを追加してください。`);
    } catch (error: any) {
      console.error('❌ Newsletter作成エラー:', error);
      alert(`電子回覧板の作成に失敗しました\n\nエラー: ${error.message}\n\nSupabaseの接続設定を確認してください。`);
    }
  };

  /**
   * 月号形式で電子回覧板を作成
   */
  const handleCreateMonthlyNewsletter = async () => {
    const title = generateMonthlyTitle();
    await createNewsletter(title);
  };

  /**
   * カスタムタイトルで電子回覧板を作成
   */
  const handleCreateCustomNewsletter = async () => {
    const title = newsletterTitle.trim();
    if (!title) {
      alert('タイトルを入力してください');
      return;
    }
    await createNewsletter(title);
  };

  /**
   * ステップ1: PDFを選択してメタデータを抽出
   */
  const handlePDFSelectAndExtractMetadata = async () => {
    if (!currentNewsletter) {
      alert('先に電子回覧板を作成してください');
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
      let result;
      let newArticles: Article[];
      let uploadResult;
      const pdfId = `pdf-${Date.now()}`;

      // すべてのモードで元PDFをアップロード
      console.log('📄 PDFをアップロード中...');
      const pdfPrefix = `${title}${issueNumber ? `-${issueNumber}` : ''}`;
      uploadResult = await uploadPDF(selectedPDF, pdfPrefix);
      console.log('✅ PDFアップロード完了:', uploadResult.url);

      // NewsletterのPDF URLを更新（複数対応）
      try {
        const pdfLabel = `${title}${issueNumber ? ` ${issueNumber}` : ''}`;
        const pdfType = extractionMode === 'detailed' ? 'source' : 'attachment';
        let thumbUrl = '';
        try { thumbUrl = await generatePdfThumbnail(selectedPDF); } catch (e) { console.warn('⚠️ サムネイル生成スキップ:', e); }
        await addPdfUrlToNewsletter(currentNewsletter.id, uploadResult.url, pdfLabel, undefined, pdfType as any, thumbUrl);
        console.log('✅ Newsletter PDF URL 追加完了');
      } catch (pdfUrlError) {
        console.warn('⚠️ PDF URL追加をスキップ:', pdfUrlError);
      }

      if (extractionMode === 'brief') {
        // 簡易モード：タイトル + 1行要約のみ
        console.log('📝 地域のお知らせ：簡単登録モード...');
        result = await extractBriefArticleFromPDF(
          pendingPDFBase64,
          MOCK_CATEGORIES,
          uploadResult.url,
          uploadResult.filename
        );

        // 記事にIDとsourceを付与、カテゴリを「地域のお知らせ」に設定
        newArticles = result.articles.map((article, index) => ({
          id: `a-${Date.now()}-${index}`,
          newsletter_id: currentNewsletter.id,
          organization_id: 'org1',
          ...article,
          category: 'local-info', // 地域のお知らせに固定
          article_type: 'local-info', // 地域情報として設定
          priority: 'low', // 地域のお知らせは常に「参考情報」
          source: `${title}${issueNumber ? ` ${issueNumber}` : ''}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }));
      } else {
        // 詳細モード：4段階要約で記事を抽出
        console.log('📝 自治会のお知らせ：記事を詳しく作成中...');
        result = await extractArticlesFromPDF(pendingPDFBase64, MOCK_CATEGORIES);

        // 記事にIDとsourceを付与 + 元PDFを添付
        newArticles = result.articles.map((article, index) => ({
          id: `a-${Date.now()}-${index}`,
          newsletter_id: currentNewsletter.id,
          organization_id: 'org1',
          ...article,
          article_type: 'official', // 自治会公式として設定
          source: `${title}${issueNumber ? ` ${issueNumber}` : ''}`,
          thumbnail_url: null, // 初期状態ではnull（後から画像を追加可能）
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }));
      }

      const processingTime = result.processingTime;

      // 重複検出を実行
      const duplicates = findDuplicateArticles(newArticles, accumulatedArticles, 0.8);

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

      if (duplicates.length > 0) {
        // 重複が見つかった場合、ダイアログを表示
        console.log(`⚠️ ${duplicates.length}件の重複を検出しました`);
        setDetectedDuplicates(duplicates);
        setPendingNewArticles(newArticles);
        setShowDuplicateDialog(true);
      } else {
        // 重複なし — 編集モード(Newsletter既存)なら即座にDBに保存
        if (isEditMode && editingNewsletterId) {
          console.log('💾 抽出した記事をSupabaseに自動保存中...');
          const articlesToSave = newArticles.map((article) => ({
            organization_id: import.meta.env.VITE_DEFAULT_ORGANIZATION_ID || null,
            title: article.title,
            category: article.category,
            article_type: article.article_type,
            priority: article.priority,
            control_date: article.control_date,
            headline: article.headline,
            brief: article.brief,
            summary: article.summary,
            content: article.content,
            tags: article.tags,
            visibility: article.visibility,
            source: article.source,
            attachments: article.attachments,
            thumbnail_url: article.thumbnail_url,
            display_order: null,
            is_pinned: article.is_pinned,
          }));
          const savedArticles = await addArticlesToNewsletter(editingNewsletterId, articlesToSave);
          console.log(`✅ ${savedArticles.length}件の記事をSupabaseに保存しました`);

          // 保存済み記事（DB上のID付き）をローカル状態に追加
          setAccumulatedArticles(prev => [...prev, ...savedArticles]);
        } else {
          // 新規作成モード：ローカル状態にのみ追加
          setAccumulatedArticles(prev => [...prev, ...newArticles]);
        }

        // 選択をクリア
        setSelectedPDF(null);
        setPendingPDFBase64(null);

        // モードに応じたメッセージ
        const modeLabel = extractionMode === 'detailed' ? '自治会のお知らせ' : '地域のお知らせ';
        const message = extractionMode === 'detailed'
          ? `【${modeLabel}】\n${title}から${newArticles.length}件の記事を追加しました`
          : `【${modeLabel}】\n「${title}」を追加しました`;

        alert(
          `${message}\n` +
          `処理時間: ${(processingTime / 1000).toFixed(1)}秒` +
          (isEditMode ? '\n\nSupabaseに保存済みです。' : '')
        );
      }
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
   * 地域のお知らせバルクインポート
   */
  const handleBulkImport = async (files: FileList) => {
    // FileListをArrayにコピー（inputリセットで消えるため）
    const pdfFiles = Array.from(files).filter(
      f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );

    console.log('📦 バルクインポート開始:', pdfFiles.length, '件', 'newsletter:', currentNewsletter?.id);
    if (!currentNewsletter || pdfFiles.length === 0) {
      alert('PDFファイルが選択されていません');
      return;
    }

    setIsBulkImporting(true);
    setBulkProgress({ current: 0, total: pdfFiles.length });

    // 発行元リストを取得（AI判定用）
    let publisherNames: string[] = [];
    try {
      const { getPublisherNames } = await import('@cc-saas/shared');
      publisherNames = await getPublisherNames();
    } catch { /* 取得失敗時は空で続行 */ }

    let successCount = 0;

    for (let i = 0; i < pdfFiles.length; i++) {
      const file = pdfFiles[i];
      setBulkProgress({ current: i + 1, total: pdfFiles.length });
      console.log(`📄 処理中 ${i+1}/${pdfFiles.length}: ${file.name}`);
      try {
        // PDFアップロード
        const fallbackTitle = file.name.replace(/\.pdf$/i, '');
        const uploadResult = await uploadPDF(file, fallbackTitle);

        // AIでタイトル+号数+発行元を読み取り
        let label = fallbackTitle;
        let publisher = '';
        try {
          const pdfBase64 = await convertPDFToBase64(file);
          const metadata = await extractPDFMetadata(pdfBase64, publisherNames);
          if (metadata.suggestedTitle) {
            label = metadata.suggestedTitle;
            if (metadata.suggestedIssueNumber) {
              label += ` ${metadata.suggestedIssueNumber}`;
            }
          }
          publisher = metadata.suggestedPublisher || '';
          console.log(`📝 AI読み取り: ${label} / 発行元: ${publisher}`);
        } catch (aiError) {
          console.warn(`⚠️ AI読み取りスキップ（ファイル名を使用）:`, aiError);
        }

        let thumbUrl = '';
        try { thumbUrl = await generatePdfThumbnail(file); } catch (e) { console.warn('⚠️ サムネイル生成スキップ:', e); }
        await addPdfUrlToNewsletter(currentNewsletter.id, uploadResult.url, label, publisher, 'attachment', thumbUrl);
        successCount++;
        console.log(`✅ ${i + 1}/${pdfFiles.length}: ${label}`);
      } catch (error) {
        console.error(`❌ ${file.name} のインポート失敗:`, error);
      }
    }

    setIsBulkImporting(false);
    alert(`${successCount}/${pdfFiles.length}件のPDFをインポートしました`);

    // 一覧に戻る
    if (isEditMode) {
      setReturnToNewsletterId(editingNewsletterId);
      setIsEditMode(false);
      setEditingNewsletterId(null);
      setCurrentNewsletter(null);
      setAccumulatedArticles([]);
      setUploadedPDFs([]);
      setActiveTab('saved');
    }
  };

  /**
   * 電子回覧板編集のリセット
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
   * 既存の電子回覧板を編集モードで開く
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

      setReturnToNewsletterId(null);
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

  /**
   * 重複検出ダイアログで確定ボタンが押された時の処理
   */
  const handleDuplicateConfirm = (action: DuplicateAction, selectedPairs: DuplicatePair[]) => {
    setShowDuplicateDialog(false);

    let finalArticles: Article[];

    switch (action) {
      case 'keep-both':
        // 両方残す：そのまま全て追加
        finalArticles = [...accumulatedArticles, ...pendingNewArticles];
        break;

      case 'keep-new':
        // 新しいものを優先：既存の重複記事を除外
        finalArticles = filterDuplicateArticles(
          [...accumulatedArticles, ...pendingNewArticles],
          selectedPairs,
          true
        );
        break;

      case 'keep-existing':
        // 既存を優先：新しい重複記事を除外
        finalArticles = filterDuplicateArticles(
          [...accumulatedArticles, ...pendingNewArticles],
          selectedPairs,
          false
        );
        break;
    }

    setAccumulatedArticles(finalArticles);

    // 選択をクリア
    setSelectedPDF(null);
    setPendingPDFBase64(null);
    setPendingNewArticles([]);
    setDetectedDuplicates([]);

    const addedCount = finalArticles.length - accumulatedArticles.length;
    alert(
      `処理完了\n\n追加された記事: ${addedCount}件\n合計: ${finalArticles.length}件の記事`
    );
  };

  /**
   * 重複検出ダイアログをキャンセル
   */
  const handleDuplicateCancel = () => {
    setShowDuplicateDialog(false);

    // 新しい記事を全て追加（重複を無視）
    setAccumulatedArticles(prev => [...prev, ...pendingNewArticles]);

    // 選択をクリア
    setSelectedPDF(null);
    setPendingPDFBase64(null);
    setPendingNewArticles([]);
    setDetectedDuplicates([]);

    alert('重複チェックをスキップし、全ての記事を追加しました');
  };

  /**
   * 記事が更新された時の処理
   */
  const handleArticleUpdate = (articleId: string, updates: Partial<Article>) => {
    setAccumulatedArticles(prev =>
      prev.map(article =>
        article.id === articleId
          ? { ...article, ...updates, updated_at: new Date().toISOString() }
          : article
      )
    );
  };

  /**
   * 記事を削除する処理
   *
   * Supabaseに保存済みの記事はデータベースからも削除します。
   * 新規作成中の記事（IDが'a-'で始まる）はローカル状態からのみ削除します。
   */
  const handleArticleDelete = async (articleId: string) => {
    console.log('📍 handleArticleDelete開始:', articleId);

    try {
      // 新規作成中の記事かどうかを判定
      const isNewArticle = articleId.startsWith('a-');
      console.log('📍 記事タイプ:', isNewArticle ? '新規作成中' : 'Supabase保存済み');

      if (!isNewArticle) {
        // Supabaseに保存済みの記事の場合、データベースからも削除
        console.log('🗑️ Supabaseから記事を削除中...', articleId);
        await deleteArticle(articleId);
        console.log('✅ Supabaseから記事を削除しました');
      } else {
        console.log('📝 新規作成中の記事なので、ローカル状態からのみ削除します');
      }

      // ローカル状態から削除
      console.log('🗑️ ローカル状態から削除中...');
      setAccumulatedArticles(prev => {
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

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-700">電子回覧板</h2>
      </div>

      {/* ブレッドクラムナビゲーション */}
      {isEditMode && editingNewsletterId && activeTab === 'pdf' && (
        <div className="flex items-center gap-2 text-sm text-slate-600 mb-3">
          <button
            onClick={() => {
              if (uploadedPDFs.length > 0) {
                if (!confirm('追加したPDFの変更が破棄されます。よろしいですか？')) return;
              }
              setActiveTab('saved');
              handleResetNewsletter();
            }}
            className="flex items-center gap-1 hover:text-primary-600 transition-colors"
          >
            <ArrowLeft size={14} />
            保存済み一覧
          </button>
          <ChevronRight size={16} className="text-slate-400" />
          <div className="flex items-center gap-2 text-primary-600 font-medium">
            <Edit3 size={16} />
            <span>{currentNewsletter?.title || '電子回覧板'}を編集中</span>
          </div>
        </div>
      )}

      {/* タブ切り替え */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-1 inline-flex gap-1">
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
        <button
          onClick={() => setActiveTab('pdf')}
          className={`px-6 py-2 rounded-lg font-medium transition-all ${
            activeTab === 'pdf'
              ? isEditMode && activeTab === 'pdf'
                ? 'bg-primary-600 text-white shadow-sm'
                : 'bg-primary-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-2">
            {isEditMode && activeTab === 'pdf' ? <Edit3 size={18} /> : <FileText size={18} />}
            <span>{isEditMode && activeTab === 'pdf' ? 'PDF 編集中' : '新規作成'}</span>
          </div>
        </button>
      </div>

      {/* PDF広報誌セクション */}
      {activeTab === 'pdf' && (
        <div className="space-y-6">
          {/* Newsletter未作成時: 作成フォーム */}
          {!currentNewsletter && (
            <div className="bg-white p-6 rounded-2xl shadow border border-primary-100">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                <FileText size={20} className="text-primary-600" />
                新しい電子回覧板を作成
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
              {/* Newsletter情報バナー（新規作成時のみ表示） */}
              {!isEditMode && (
              <div className="p-4 rounded-xl border bg-primary-50 border-primary-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-primary-900">
                      作成中: {currentNewsletter.title}
                    </h3>
                    <p className="text-sm mt-1 text-primary-700">
                      合計 {accumulatedArticles.length} 件の記事
                      {uploadedPDFs.length > 0 && ` / ${uploadedPDFs.length} 個のPDF`}
                    </p>
                  </div>
                  <button
                    onClick={handleResetNewsletter}
                    className="text-sm underline text-primary-600 hover:text-primary-800"
                  >
                    リセット
                  </button>
                </div>
              </div>
              )}

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
              <div className="bg-white p-6 rounded-2xl shadow border border-slate-200 relative">
                <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Upload size={20} className="text-primary-600" />
                  PDFを追加
                </h4>
                {isEditMode && (
                  <button
                    onClick={() => {
                      setReturnToNewsletterId(editingNewsletterId);
                      setSelectedPDF(null);
                      setPendingPDFBase64(null);
                      setIsProcessingPDF(false);
                      setIsEditMode(false);
                      setEditingNewsletterId(null);
                      setCurrentNewsletter(null);
                      setAccumulatedArticles([]);
                      setUploadedPDFs([]);
                      setActiveTab('saved');
                    }}
                    className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
                    title="閉じる"
                  >
                    <X size={20} />
                  </button>
                )}

                <div className="space-y-4">
                  {/* 抽出モード選択 */}
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-slate-700 mb-3">抽出モード</p>

                    {/* カード1: 自治会のお知らせ */}
                    <div
                      onClick={() => setExtractionMode('detailed')}
                      className={`
                        p-4 rounded-lg border-2 cursor-pointer transition-all
                        ${extractionMode === 'detailed'
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                        }
                      `}
                    >
                      <div className="flex items-start gap-3">
                        {extractionMode === 'detailed' && (
                          <Check size={20} className="text-primary-600 mt-0.5 flex-shrink-0" />
                        )}
                        <div className="flex-1">
                          <p className="text-base font-semibold text-slate-800">自治会のお知らせ</p>
                          <p className="text-sm text-slate-600 mt-1">記事を詳しく作成</p>
                          <p className="text-xs text-slate-500 mt-1">処理時間: 約30-60秒</p>
                        </div>
                      </div>
                    </div>

                    {/* カード2: 地域の知らせ */}
                    <div
                      onClick={() => setExtractionMode('brief')}
                      className={`
                        p-4 rounded-lg border-2 cursor-pointer transition-all
                        ${extractionMode === 'brief'
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                        }
                      `}
                    >
                      <div className="flex items-start gap-3">
                        {extractionMode === 'brief' && (
                          <Check size={20} className="text-primary-600 mt-0.5 flex-shrink-0" />
                        )}
                        <div className="flex-1">
                          <p className="text-base font-semibold text-slate-800">地域のお知らせ</p>
                          <p className="text-sm text-slate-600 mt-1">PDFで保管（簡単登録）</p>
                          <p className="text-xs text-slate-500 mt-1">処理時間: 約5-10秒</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* PDFインポート（地域のお知らせモード時） */}
                  {extractionMode === 'brief' && (
                    <div className="border-2 border-dashed border-green-400 rounded-lg p-6 text-center bg-green-50">
                      <input
                        type="file"
                        accept="application/pdf"
                        multiple
                        onChange={(e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            handleBulkImport(e.target.files);
                            e.target.value = '';
                          }
                        }}
                        className="hidden"
                        id="pdf-bulk"
                        disabled={isBulkImporting || !currentNewsletter}
                      />
                      <label
                        htmlFor="pdf-bulk"
                        className="cursor-pointer inline-flex flex-col items-center gap-2"
                      >
                        {isBulkImporting ? (
                          <>
                            <Loader2 size={32} className="text-green-600 animate-spin" />
                            <span className="text-sm font-medium text-green-700">
                              {bulkProgress.current}/{bulkProgress.total}件 インポート中...
                            </span>
                          </>
                        ) : (
                          <>
                            <Upload size={32} className="text-green-500" />
                            <span className="text-sm font-medium text-green-700">
                              クリックしてPDFを選択
                            </span>
                            <span className="text-xs text-green-500">1件でも複数でもまとめて登録できます</span>
                          </>
                        )}
                      </label>
                    </div>
                  )}

                  {/* PDF選択（自治会のお知らせモード時のみ） */}
                  {extractionMode !== 'brief' && (
                  <>
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
                    {isProcessingPDF ? (
                      <button
                        onClick={() => {
                          setIsProcessingPDF(false);
                          setIsMetadataLoading(false);
                          setShowMetadataDialog(false);
                          setPendingPDFBase64(null);
                          setSelectedPDF(null);
                        }}
                        className="flex-1 px-6 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium flex items-center justify-center gap-2"
                      >
                        キャンセル
                      </button>
                    ) : (
                      <button
                        onClick={handlePDFSelectAndExtractMetadata}
                        disabled={!selectedPDF}
                        className="flex-1 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        <Sparkles size={18} />
                        記事を抽出して追加
                      </button>
                    )}
                  </div>
                  </>
                  )}
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
                    onArticleUpdate={handleArticleUpdate}
                    onArticleDelete={handleArticleDelete}
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
          <NewsletterList onEditNewsletter={handleStartEdit} returnToNewsletterId={returnToNewsletterId} />
        </div>
      )}

      {/* PDFメタデータ入力ダイアログ */}
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

      {/* 重複検出ダイアログ */}
      <DuplicateDetectionDialog
        isOpen={showDuplicateDialog}
        duplicates={detectedDuplicates}
        onConfirm={handleDuplicateConfirm}
        onCancel={handleDuplicateCancel}
      />
    </div>
  );
};
