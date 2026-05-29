/**
 * 画像切り抜きページ（フルスクリーン）
 *
 * PDFをpdfjs-distで直接高解像度レンダリングし、
 * 1ページから複数の領域を切り抜いて記事に紐付けるコンポーネント。
 * ズーム対応、複数切り抜き、新規記事作成、連続作業対応。
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { X, Check, Plus, Trash2, FileText, ArrowLeft, ChevronLeft, ChevronRight, Scissors, ZoomIn, ZoomOut, Save, PlusCircle } from 'lucide-react';
import type { Article } from '@cc-saas/shared';
import { updateArticle, addArticlesToNewsletter } from '@cc-saas/shared';
import { uploadImage } from '@cc-saas/shared/services/data/storageService';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface CroppedItem {
  id: string;
  blob: Blob;
  previewUrl: string;
  articleId: string | null;
  saved: boolean;
  fitContain: boolean; // true = 全体表示（contain）、false = 切り取り（cover）
  imageFull: boolean; // true = 画像を大きく表示
}

interface ImageCropPageProps {
  pdfUrls: string[];
  newsletterId: string;
  articles: Article[];
  onClose: () => void;
  onSaved: () => void;
}

export const ImageCropPage: React.FC<ImageCropPageProps> = ({
  pdfUrls,
  newsletterId,
  articles: initialArticles,
  onClose,
  onSaved,
}) => {
  // 記事一覧（新規作成分を含む動的リスト）
  const [articles, setArticles] = useState<Article[]>(initialArticles);

  // PDF状態（複数PDF対応）
  const [currentPdfIndex, setCurrentPdfIndex] = useState(0);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pageDataUrl, setPageDataUrl] = useState<string | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(true);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // クロップ関連
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [isCropping, setIsCropping] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // ズーム・パン
  const [zoom, setZoom] = useState(100);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const canPan = !isCropping;

  // 複数切り抜き管理
  const [croppedItems, setCroppedItems] = useState<CroppedItem[]>([]);
  const [selectedCroppedIndex, setSelectedCroppedIndex] = useState<number | null>(null);

  // 保存中
  const [isSaving, setIsSaving] = useState(false);

  // 新規記事作成
  const [showNewArticleForm, setShowNewArticleForm] = useState(false);
  const [newArticleTitle, setNewArticleTitle] = useState('');

  // 変更があったかどうか
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
    console.log('🖼️ ImageCropPage: マウント, pdfUrls=', pdfUrls);
    loadPdf(pdfUrls[0]);
  }, []);

  // PDF切り替え時
  useEffect(() => {
    if (pdfUrls[currentPdfIndex]) {
      loadPdf(pdfUrls[currentPdfIndex]);
    }
  }, [currentPdfIndex]);

  /** 左ドラッグでパン（切り抜きモードでない時のみ） */
  const handlePanStart = useCallback((e: React.MouseEvent) => {
    if (!canPan || e.button !== 0) return;
    e.preventDefault();
    setIsPanning(true);
    setPanStart({ x: e.clientX, y: e.clientY });
  }, [canPan]);

  const handlePanMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning || !scrollContainerRef.current) return;
    scrollContainerRef.current.scrollLeft -= (e.clientX - panStart.x);
    scrollContainerRef.current.scrollTop -= (e.clientY - panStart.y);
    setPanStart({ x: e.clientX, y: e.clientY });
  }, [isPanning, panStart]);

  const handlePanEnd = useCallback(() => {
    setIsPanning(false);
  }, []);

  useEffect(() => {
    if (pdfDoc) renderPage(currentPage);
  }, [pdfDoc, currentPage]);

  const loadPdf = async (url: string) => {
    setIsLoadingPdf(true);
    setPdfError(null);
    setCurrentPage(1);
    console.log('📄 PDF読み込み開始:', url);
    try {
      const response = await fetch(url);
      console.log('📄 fetch応答:', response.status, response.statusText);
      if (!response.ok) throw new Error(`PDF取得エラー: ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      console.log('📄 ArrayBuffer取得完了:', arrayBuffer.byteLength, 'bytes');
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const doc = await loadingTask.promise;
      setPdfDoc(doc);
      setTotalPages(doc.numPages);
      console.log('📄 PDF読み込み完了:', doc.numPages, 'ページ');
    } catch (error: any) {
      console.error('❌ PDF読み込みエラー:', error);
      setPdfError(error.message || 'PDFの読み込みに失敗しました');
    } finally {
      setIsLoadingPdf(false);
    }
  };

  const renderPage = async (pageNum: number) => {
    if (!pdfDoc) return;
    try {
      const page = await pdfDoc.getPage(pageNum);
      const scale = 3.0;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
      setPageDataUrl(canvas.toDataURL('image/png'));
      setCrop(undefined);
      setCompletedCrop(undefined);
    } catch (error) {
      console.error(`ページ ${pageNum} レンダリングエラー:`, error);
    }
  };

  const getCroppedBlob = useCallback(async (): Promise<Blob | null> => {
    if (!completedCrop || !imgRef.current) return null;
    const image = imgRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    const cropWidth = completedCrop.width * scaleX;
    const cropHeight = completedCrop.height * scaleY;
    canvas.width = cropWidth;
    canvas.height = cropHeight;

    ctx.drawImage(
      image,
      completedCrop.x * scaleX, completedCrop.y * scaleY,
      cropWidth, cropHeight,
      0, 0, cropWidth, cropHeight
    );

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png', 0.95);
    });
  }, [completedCrop]);

  const handleAddCrop = async () => {
    const blob = await getCroppedBlob();
    if (!blob) return;

    const previewUrl = URL.createObjectURL(blob);
    const newItem: CroppedItem = {
      id: `crop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      blob,
      previewUrl,
      articleId: null,
      saved: false,
      fitContain: false,
      imageFull: false,
    };

    setCroppedItems((prev) => [...prev, newItem]);
    setSelectedCroppedIndex(croppedItems.length);
    setCrop(undefined);
    setCompletedCrop(undefined);
    setHasUnsavedChanges(true);
  };

  const handleRemoveCrop = (index: number) => {
    const item = croppedItems[index];
    if (item.saved) return; // 保存済みは削除不可
    URL.revokeObjectURL(item.previewUrl);
    setCroppedItems((prev) => prev.filter((_, i) => i !== index));
    if (selectedCroppedIndex === index) setSelectedCroppedIndex(null);
    else if (selectedCroppedIndex !== null && selectedCroppedIndex > index) {
      setSelectedCroppedIndex(selectedCroppedIndex - 1);
    }
  };

  const handleSetArticleForCrop = (articleId: string) => {
    if (selectedCroppedIndex === null) return;
    setCroppedItems((prev) =>
      prev.map((item, i) => (i === selectedCroppedIndex ? { ...item, articleId } : item))
    );
    setHasUnsavedChanges(true);
  };

  /** 新規記事を作成して切り抜きに紐付け */
  const handleCreateNewArticle = async () => {
    if (!newArticleTitle.trim() || selectedCroppedIndex === null) return;

    try {
      const newArticle = {
        organization_id: import.meta.env.VITE_DEFAULT_ORGANIZATION_ID || null,
        title: newArticleTitle.trim(),
        category: 'notice',
        article_type: 'official' as const,
        priority: 'medium' as const,
        control_date: null,
        headline: newArticleTitle.trim(),
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

      const result = await addArticlesToNewsletter(newsletterId, [newArticle]);
      if (result.length > 0) {
        const createdArticle = result[0];
        setArticles((prev) => [...prev, createdArticle]);
        handleSetArticleForCrop(createdArticle.id);
        setNewArticleTitle('');
        setShowNewArticleForm(false);
        console.log(`✅ 新規記事「${createdArticle.title}」を作成`);
      }
    } catch (error) {
      console.error('記事作成エラー:', error);
      alert('記事の作成に失敗しました');
    }
  };

  /** 未保存の切り抜きを一括保存（保存後もページに留まる） */
  const handleSaveAll = async () => {
    const itemsToSave = croppedItems.filter((item) => item.articleId && !item.saved);
    if (itemsToSave.length === 0) {
      alert('保存する切り抜きがありません');
      return;
    }

    setIsSaving(true);
    try {
      // 同じ記事に複数画像を追加する場合に備え、最新のattachmentsをローカルで追跡
      const latestAttachments: Record<string, any[]> = {};
      for (const a of articles) {
        latestAttachments[a.id] = [...(a.attachments || [])];
      }

      for (const item of itemsToSave) {
        const file = new File(
          [item.blob],
          `cropped-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.png`,
          { type: 'image/png' }
        );
        const uploadResult = await uploadImage(file);

        const articleId = item.articleId!;
        const newAttachment = {
          type: 'image' as const,
          url: uploadResult.url,
          label: '',
        };

        const currentAttachments = latestAttachments[articleId] || [];
        const updatedAttachments = [...currentAttachments, newAttachment];

        // thumbnail_urlが未設定なら1枚目の画像を自動セット
        const article = articles.find((a) => a.id === articleId);
        const updates: any = { attachments: updatedAttachments };
        if (!article?.thumbnail_url && updatedAttachments.find((a: any) => a.type === 'image')) {
          updates.thumbnail_url = updatedAttachments.find((a: any) => a.type === 'image').url;
        }
        if (item.fitContain) {
          updates.thumbnail_fit = 'contain';
        }
        if (item.imageFull) {
          updates.image_display = 'full';
        }
        await updateArticle(articleId, updates);

        // ローカル追跡を更新（次のループで最新値を使える）
        latestAttachments[articleId] = updatedAttachments;

        // 保存済みにマーク
        setCroppedItems((prev) =>
          prev.map((ci) => (ci.id === item.id ? { ...ci, saved: true } : ci))
        );
      }

      // ローカルの記事リストを一括更新
      setArticles((prev) =>
        prev.map((a) => ({
          ...a,
          attachments: latestAttachments[a.id] || a.attachments,
        }))
      );

      setHasUnsavedChanges(false);
      onSaved();
      console.log(`✅ ${itemsToSave.length}件を保存しました`);
    } catch (error) {
      console.error('保存エラー:', error);
      alert('画像の保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    const unsaved = croppedItems.filter((item) => item.articleId && !item.saved);
    if (unsaved.length > 0) {
      if (!confirm(`未保存の切り抜きが${unsaved.length}件あります。閉じますか？`)) return;
    }
    croppedItems.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    onClose();
  };

  const selectedCropped = selectedCroppedIndex !== null ? croppedItems[selectedCroppedIndex] : null;
  const unsavedCount = croppedItems.filter((item) => item.articleId && !item.saved).length;

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-6 py-2.5 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={handleClose} className="flex items-center gap-2 text-slate-600 hover:text-slate-800 transition">
            <ArrowLeft size={20} />
            戻る
          </button>
          <div className="h-5 w-px bg-slate-300" />
          <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
            <Scissors size={20} className="text-primary-600" />
            画像の切り抜き
          </h2>
        </div>

        <div className="flex items-center gap-3">
          {croppedItems.length > 0 && (
            <span className="text-sm text-slate-500">
              {croppedItems.filter((i) => i.saved).length}件保存済み
              {unsavedCount > 0 && ` / ${unsavedCount}件未保存`}
            </span>
          )}
          <button
            onClick={handleSaveAll}
            disabled={unsavedCount === 0 || isSaving}
            className="px-5 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm transition"
          >
            {isSaving ? (
              <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> 保存中...</>
            ) : (
              <><Save size={16} /> {unsavedCount}件を保存</>
            )}
          </button>
          <div className="h-5 w-px bg-slate-300" />
          <button onClick={handleClose}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 font-medium text-sm transition">
            <X size={16} /> 終了
          </button>
        </div>
      </div>

      {/* メインコンテンツ */}
      {isLoadingPdf ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4" />
            <p className="text-slate-600">PDFを読み込み中...</p>
          </div>
        </div>
      ) : pdfError ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-red-600">{pdfError}</p>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* 左: PDF表示 + クロップ */}
          <div className="w-1/2 flex flex-col border-r border-slate-200">
            {/* ツールバー */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 bg-slate-50 shrink-0">
              <div className="flex items-center gap-2">
                {/* PDF切り替え（複数ある場合） */}
                {pdfUrls.length > 1 && (
                  <>
                    <select
                      value={currentPdfIndex}
                      onChange={(e) => setCurrentPdfIndex(Number(e.target.value))}
                      className="text-xs border border-slate-300 rounded px-2 py-1 bg-white"
                    >
                      {pdfUrls.map((_, i) => (
                        <option key={i} value={i}>PDF {i + 1}</option>
                      ))}
                    </select>
                    <div className="h-4 w-px bg-slate-300 mx-1" />
                  </>
                )}

                {/* ページナビ */}
                <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}
                  className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-30 transition">
                  <ChevronLeft size={18} />
                </button>
                <span className="text-sm font-medium text-slate-700">{currentPage} / {totalPages}</span>
                <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}
                  className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-30 transition">
                  <ChevronRight size={18} />
                </button>

                <div className="h-4 w-px bg-slate-300 mx-1" />

                {/* ズーム */}
                <button onClick={() => setZoom((z) => Math.max(50, z - 25))} disabled={zoom <= 50}
                  className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-30 transition">
                  <ZoomOut size={16} />
                </button>
                <button onClick={() => setZoom(100)} className="text-xs font-medium text-slate-600 w-12 text-center hover:bg-slate-200 rounded py-0.5 transition">
                  {zoom}%
                </button>
                <button onClick={() => setZoom((z) => Math.min(1000, z + 25))} disabled={zoom >= 1000}
                  className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-30 transition">
                  <ZoomIn size={16} />
                </button>
              </div>

              {!isCropping ? (
                <button onClick={() => setIsCropping(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 transition font-medium">
                  <Scissors size={14} /> 切り抜きモード
                </button>
              ) : (
                <button onClick={handleAddCrop} disabled={!completedCrop || completedCrop.width === 0}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium disabled:opacity-50">
                  <Plus size={14} /> リストに追加
                </button>
              )}
            </div>

            {/* PDF画像 */}
            <div ref={scrollContainerRef}
              className={`flex-1 overflow-auto p-4 bg-slate-100 ${isPanning ? 'cursor-grabbing' : canPan ? 'cursor-grab' : ''}`}
              onMouseDown={handlePanStart}
              onMouseMove={handlePanMove}
              onMouseUp={handlePanEnd}
              onMouseLeave={handlePanEnd}>
              {pageDataUrl && (
                <div style={{ width: `${zoom}%`, minWidth: '100%' }}>
                  {isCropping ? (
                    <ReactCrop crop={crop} onChange={(c) => setCrop(c)} onComplete={(c) => setCompletedCrop(c)}>
                      <img ref={imgRef} src={pageDataUrl} alt={`Page ${currentPage}`}
                        className="w-full h-auto shadow-lg rounded" crossOrigin="anonymous" />
                    </ReactCrop>
                  ) : (
                    <img src={pageDataUrl} alt={`Page ${currentPage}`} className="w-full h-auto shadow-lg rounded" />
                  )}
                </div>
              )}
            </div>

            {isCropping && (
              <div className="px-4 py-2 bg-amber-50 border-t border-amber-100 text-sm text-amber-700 shrink-0">
                ドラッグで範囲選択 → 「リストに追加」 ｜ 「終了」で移動モードに切替
              </div>
            )}
          </div>

          {/* 右: 切り抜き一覧 + 記事選択 */}
          <div className="w-1/2 flex flex-col">
            {/* 切り抜き一覧 */}
            <div className="border-b border-slate-200 bg-slate-50 shrink-0">
              <div className="px-4 py-2 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <Scissors size={14} /> 切り抜き一覧 ({croppedItems.length})
                </h3>
              </div>

              {croppedItems.length === 0 ? (
                <div className="px-4 py-5 text-center">
                  <p className="text-sm text-slate-400">左のPDFから画像を切り抜いてください</p>
                </div>
              ) : (
                <div className="flex gap-2 p-2 overflow-x-auto">
                  {croppedItems.map((item, index) => {
                    const assignedArticle = item.articleId ? articles.find((a) => a.id === item.articleId) : null;
                    return (
                      <div key={item.id} onClick={() => setSelectedCroppedIndex(index)}
                        className={`shrink-0 w-32 rounded-lg border-2 overflow-hidden cursor-pointer transition ${
                          item.saved ? 'opacity-60 ' : ''
                        }${selectedCroppedIndex === index ? 'border-primary-500 shadow-md' : 'border-slate-200 hover:border-slate-300'}`}>
                        <div className="relative">
                          <img src={item.previewUrl} alt={`#${index + 1}`} className="w-full h-16 object-cover" />
                          {item.saved && (
                            <div className="absolute inset-0 bg-green-600/20 flex items-center justify-center">
                              <Check size={20} className="text-green-700" />
                            </div>
                          )}
                        </div>
                        <div className="p-1 bg-white">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-500">#{index + 1}</span>
                            {!item.saved && (
                              <button onClick={(e) => { e.stopPropagation(); handleRemoveCrop(index); }}
                                className="text-slate-300 hover:text-red-500 transition">
                                <Trash2 size={11} />
                              </button>
                            )}
                          </div>
                          {assignedArticle ? (
                            <p className="text-xs text-primary-700 font-medium line-clamp-1">{assignedArticle.title}</p>
                          ) : (
                            <p className="text-xs text-amber-600">未紐付け</p>
                          )}
                          {!item.saved ? (
                            <div className="flex gap-2 mt-1" onClick={(e) => e.stopPropagation()}>
                              <label className="flex items-center gap-1 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={item.fitContain}
                                  onChange={() => {
                                    setCroppedItems((prev) =>
                                      prev.map((ci, ci_i) => ci_i === index ? { ...ci, fitContain: !ci.fitContain } : ci)
                                    );
                                  }}
                                  className="w-3 h-3 rounded border-slate-300 text-blue-600"
                                />
                                <span className="text-xs text-slate-500">全体表示</span>
                              </label>
                              <label className="flex items-center gap-1 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={item.imageFull}
                                  onChange={() => {
                                    setCroppedItems((prev) =>
                                      prev.map((ci, ci_i) => ci_i === index ? { ...ci, imageFull: !ci.imageFull } : ci)
                                    );
                                  }}
                                  className="w-3 h-3 rounded border-slate-300 text-blue-600"
                                />
                                <span className="text-xs text-slate-500">大きく</span>
                              </label>
                            </div>
                          ) : (
                            <div className="flex gap-2 mt-1">
                              {item.fitContain && <span className="text-xs text-blue-600">全体表示</span>}
                              {item.imageFull && <span className="text-xs text-blue-600">大きく</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 記事選択 */}
            <div className="flex-1 overflow-y-auto p-4">
              {selectedCroppedIndex === null ? (
                <div className="text-center py-12">
                  <FileText size={36} className="text-slate-300 mx-auto mb-3" />
                  <p className="text-sm text-slate-400">上の切り抜きを選択すると<br />紐付け先の記事を選べます</p>
                </div>
              ) : selectedCropped?.saved ? (
                <div className="text-center py-12">
                  <Check size={36} className="text-green-500 mx-auto mb-3" />
                  <p className="text-sm text-green-700 font-medium">保存済み</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {articles.find((a) => a.id === selectedCropped.articleId)?.title}
                  </p>
                </div>
              ) : (
                <>
                  <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                    <FileText size={14} />
                    切り抜き #{selectedCroppedIndex + 1} の紐付け先
                  </h3>

                  {/* 新規記事作成 */}
                  {!showNewArticleForm ? (
                    <button onClick={() => setShowNewArticleForm(true)}
                      className="w-full mb-3 p-3 rounded-lg border-2 border-dashed border-slate-300 text-slate-500 hover:border-primary-400 hover:text-primary-600 transition flex items-center justify-center gap-2 text-sm">
                      <PlusCircle size={16} /> 新しい記事を作成して紐付け
                    </button>
                  ) : (
                    <div className="mb-3 p-3 rounded-lg border-2 border-primary-300 bg-primary-50">
                      <p className="text-xs font-medium text-primary-700 mb-2">新しい記事のタイトル</p>
                      <input type="text" value={newArticleTitle} onChange={(e) => setNewArticleTitle(e.target.value)}
                        placeholder="例：お花見のお知らせ"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleCreateNewArticle(); }} />
                      <div className="flex gap-2 mt-2">
                        <button onClick={handleCreateNewArticle} disabled={!newArticleTitle.trim()}
                          className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-xs font-medium hover:bg-primary-700 disabled:opacity-50 transition">
                          作成
                        </button>
                        <button onClick={() => { setShowNewArticleForm(false); setNewArticleTitle(''); }}
                          className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs hover:bg-slate-200 transition">
                          キャンセル
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    {articles.map((article) => {
                      // この記事に紐付いている画像の数
                      const imageCount = article.attachments?.filter((a: any) => a.type === 'image').length || 0;

                      return (
                        <button key={article.id} onClick={() => handleSetArticleForCrop(article.id)}
                          className={`w-full p-2.5 rounded-lg border-2 text-left transition ${
                            selectedCropped?.articleId === article.id
                              ? 'border-primary-500 bg-primary-50'
                              : 'border-slate-200 hover:border-slate-300 bg-white'
                          }`}>
                          <div className="flex items-start gap-2">
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                              selectedCropped?.articleId === article.id ? 'border-primary-500 bg-primary-500' : 'border-slate-300'
                            }`}>
                              {selectedCropped?.articleId === article.id && <Check size={10} className="text-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="font-medium text-slate-800 text-sm line-clamp-1">{article.title}</p>
                                {imageCount > 0 && (
                                  <span className="shrink-0 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                                    {imageCount}枚
                                  </span>
                                )}
                              </div>
                              {article.summary && (
                                <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{article.summary}</p>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
