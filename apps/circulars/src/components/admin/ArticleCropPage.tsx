/**
 * 統合クロップページ（フルスクリーン）
 *
 * PDFを表示し、範囲選択した部分を：
 * - 記事モード: 複数範囲をまとめてAIに渡し記事を生成
 * - 画像モード: 切り抜き画像を既存記事に紐付け
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { X, ChevronLeft, ChevronRight, Scissors, ZoomIn, ZoomOut, Loader2, Save, Plus, Trash2, FileText, Image as ImageIcon, Check } from 'lucide-react';
import type { Article } from '@cc-saas/shared';
import { addArticlesToNewsletter, updateArticle } from '@cc-saas/shared';
import { extractArticleFromImage } from '@cc-saas/shared/services/ai/claudeService';
import { uploadImage } from '@cc-saas/shared/services/data/storageService';
import { MOCK_CATEGORIES } from '@cc-saas/shared/constants';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

type CropMode = 'article' | 'image' | 'thumbnail';

interface CropItem {
  id: string;
  blob: Blob;
  previewUrl: string;
  base64: string;
}

interface ArticleCropPageProps {
  pdfUrls: string[];
  pdfLabels?: string[];
  newsletterId: string;
  articles: Article[];
  onClose: () => void;
  onSaved: () => void;
}

export const ArticleCropPage: React.FC<ArticleCropPageProps> = ({
  pdfUrls,
  pdfLabels = [],
  newsletterId,
  articles: initialArticles,
  onClose,
  onSaved,
}) => {
  const [articles, setArticles] = useState<Article[]>(initialArticles);

  // PDF
  const [currentPdfIndex, setCurrentPdfIndex] = useState(0);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pageDataUrl, setPageDataUrl] = useState<string | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(true);
  const [zoom, setZoom] = useState(100);

  // クロップ
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const imgRef = useRef<HTMLImageElement>(null);

  // モード
  const [mode, setMode] = useState<CropMode>('article');

  // 複数クロップ管理
  const [cropItems, setCropItems] = useState<CropItem[]>([]);

  // 記事モード: AI抽出結果
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedArticle, setExtractedArticle] = useState<any>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [editContent, setEditContent] = useState('');

  // 画像モード: 記事選択
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [showNewArticleForm, setShowNewArticleForm] = useState(false);
  const [newArticleTitle, setNewArticleTitle] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  useEffect(() => { loadPdf(pdfUrls[0]); }, []);
  useEffect(() => { if (pdfUrls[currentPdfIndex]) loadPdf(pdfUrls[currentPdfIndex]); }, [currentPdfIndex]);
  useEffect(() => { if (pdfDoc) renderPage(currentPage); }, [pdfDoc, currentPage]);

  const loadPdf = async (url: string) => {
    setIsLoadingPdf(true);
    try {
      const res = await fetch(url);
      const buf = await res.arrayBuffer();
      const doc = await pdfjsLib.getDocument({
        data: buf,
        cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.7.284/cmaps/',
        cMapPacked: true,
        useSystemFonts: true,
      }).promise;
      setPdfDoc(doc);
      setTotalPages(doc.numPages);
      setCurrentPage(1);
    } catch (e) { console.error('PDF読み込みエラー:', e); }
    finally { setIsLoadingPdf(false); }
  };

  const renderPage = async (pageNum: number) => {
    if (!pdfDoc) return;
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
  };

  const getCroppedData = useCallback(async (): Promise<{ blob: Blob; base64: string } | null> => {
    if (!completedCrop || !imgRef.current) return null;
    const image = imgRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const sx = image.naturalWidth / image.width;
    const sy = image.naturalHeight / image.height;
    const w = completedCrop.width * sx;
    const h = completedCrop.height * sy;
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(image, completedCrop.x * sx, completedCrop.y * sy, w, h, 0, 0, w, h);

    const base64 = canvas.toDataURL('image/png').split(',')[1];
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), 'image/png', 0.95);
    });
    return { blob, base64 };
  }, [completedCrop]);

  /** クロップをリストに追加 */
  const handleAddCrop = async () => {
    const data = await getCroppedData();
    if (!data) return;
    const previewUrl = URL.createObjectURL(data.blob);
    setCropItems(prev => [...prev, {
      id: `crop-${Date.now()}`,
      blob: data.blob,
      previewUrl,
      base64: data.base64,
    }]);
    setCrop(undefined);
    setCompletedCrop(undefined);
  };

  const handleRemoveCrop = (index: number) => {
    const item = cropItems[index];
    URL.revokeObjectURL(item.previewUrl);
    setCropItems(prev => prev.filter((_, i) => i !== index));
  };

  /** 記事モード: まとめてAI抽出 */
  const handleExtractArticle = async () => {
    if (cropItems.length === 0) return;
    setIsExtracting(true);
    setExtractedArticle(null);
    try {
      const base64List = cropItems.map(item => item.base64);
      const result = await extractArticleFromImage(base64List, MOCK_CATEGORIES);
      setExtractedArticle(result);
      setEditTitle(result.title || '');
      setEditSummary(result.summary || '');
      setEditContent(result.content || '');
    } catch (error: any) {
      console.error('記事抽出エラー:', error);
      alert(`記事の抽出に失敗しました\n\n${error.message}`);
    } finally {
      setIsExtracting(false);
    }
  };

  /** 記事モード: 保存 */
  const handleSaveArticle = async () => {
    if (!extractedArticle) return;
    setIsSaving(true);
    try {
      const article = {
        organization_id: import.meta.env.VITE_DEFAULT_ORGANIZATION_ID || null,
        title: editTitle,
        category: extractedArticle.category || 'notice',
        article_type: 'official' as const,
        priority: (extractedArticle.priority || 'medium') as any,
        control_date: extractedArticle.event_date || null,
        headline: editTitle.substring(0, 5),
        brief: editSummary.substring(0, 30),
        summary: editSummary,
        content: editContent,
        tags: extractedArticle.tags || [],
        visibility: 'public' as const,
        source: pdfLabels[currentPdfIndex] || decodeURIComponent(pdfUrls[currentPdfIndex]?.split('/').pop()?.replace(/\.pdf$/i, '') || ''),
        attachments: [],
        display_order: savedCount,
        is_pinned: false,
        thumbnail_url: null,
        event_date: extractedArticle.event_date || null,
        event_time: extractedArticle.event_time || null,
        event_location: extractedArticle.event_location || null,
      };
      const result = await addArticlesToNewsletter(newsletterId, [article]);
      if (result.length > 0) setArticles(prev => [...prev, result[0]]);
      setSavedCount(prev => prev + 1);
      setExtractedArticle(null);
      setCropItems(prev => { prev.forEach(i => URL.revokeObjectURL(i.previewUrl)); return []; });
      onSaved();
    } catch (error: any) {
      alert(`保存に失敗しました: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  /** 画像モード: 保存 */
  const handleSaveImage = async () => {
    if (cropItems.length === 0 || !selectedArticleId) return;
    setIsSaving(true);
    try {
      const article = articles.find(a => a.id === selectedArticleId);
      if (!article) return;
      let currentAttachments = [...(article.attachments || [])];

      for (const item of cropItems) {
        const file = new File([item.blob], `cropped-${Date.now()}.png`, { type: 'image/png' });
        const uploadResult = await uploadImage(file);
        currentAttachments.push({ type: 'image' as const, url: uploadResult.url, label: '' });
      }

      const updates: any = { attachments: currentAttachments };
      if (!article.thumbnail_url && currentAttachments.find((a: any) => a.type === 'image')) {
        updates.thumbnail_url = currentAttachments.find((a: any) => a.type === 'image').url;
      }
      await updateArticle(selectedArticleId, updates);

      setArticles(prev => prev.map(a => a.id === selectedArticleId ? { ...a, ...updates } : a));
      setSavedCount(prev => prev + 1);
      setCropItems(prev => { prev.forEach(i => URL.revokeObjectURL(i.previewUrl)); return []; });
      setSelectedArticleId(null);
      onSaved();
    } catch (error: any) {
      alert(`保存に失敗しました: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-6 py-2.5 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
            <Scissors size={20} className="text-primary-600" />
            PDFクロップ
          </h2>

          {/* モード切替 */}
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            <button onClick={() => { setMode('article'); setCropItems(prev => { prev.forEach(i => URL.revokeObjectURL(i.previewUrl)); return []; }); setExtractedArticle(null); }}
              className={`px-3 py-1 rounded-md text-sm font-medium transition ${mode === 'article' ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-600'}`}>
              <FileText size={14} className="inline mr-1" />記事抽出
            </button>
            <button onClick={() => { setMode('image'); setCropItems(prev => { prev.forEach(i => URL.revokeObjectURL(i.previewUrl)); return []; }); setExtractedArticle(null); }}
              className={`px-3 py-1 rounded-md text-sm font-medium transition ${mode === 'image' ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-600'}`}>
              <ImageIcon size={14} className="inline mr-1" />画像追加
            </button>
            <button onClick={() => { setMode('thumbnail'); setCropItems(prev => { prev.forEach(i => URL.revokeObjectURL(i.previewUrl)); return []; }); setExtractedArticle(null); }}
              className={`px-3 py-1 rounded-md text-sm font-medium transition ${mode === 'thumbnail' ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-600'}`}>
              📷 サムネイル
            </button>
          </div>

          {savedCount > 0 && <span className="text-sm text-green-600 font-medium">{savedCount}件保存済み</span>}
        </div>
        <button onClick={onClose}
          className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 font-medium text-sm transition">
          <X size={16} /> 終了
        </button>
      </div>

      {isLoadingPdf ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={32} className="animate-spin text-primary-600" />
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* 左: PDF */}
          <div className="w-1/2 flex flex-col border-r border-slate-200">
            <div className="px-4 py-2 border-b border-slate-100 bg-slate-50 shrink-0 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {pdfUrls.length > 1 && (
                    <select value={currentPdfIndex} onChange={e => setCurrentPdfIndex(Number(e.target.value))}
                      className="text-xs border border-slate-300 rounded px-2 py-1 bg-white max-w-[150px] truncate">
                      {pdfUrls.map((_, i) => <option key={i} value={i}>{pdfLabels?.[i] || `PDF ${i + 1}`}</option>)}
                    </select>
                  )}
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}
                    className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-30 transition"><ChevronLeft size={18} /></button>
                  <span className="text-sm font-medium text-slate-700">{currentPage}/{totalPages}</span>
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}
                    className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-30 transition"><ChevronRight size={18} /></button>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setZoom(z => Math.max(50, z - 25))} disabled={zoom <= 50}
                    className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-30 transition"><ZoomOut size={16} /></button>
                  <button onClick={() => setZoom(100)}
                    className="text-xs font-medium text-slate-600 w-10 text-center hover:bg-slate-200 rounded py-0.5">{zoom}%</button>
                  <button onClick={() => setZoom(z => Math.min(1000, z + 25))} disabled={zoom >= 1000}
                    className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-30 transition"><ZoomIn size={16} /></button>
                  <button onClick={handleAddCrop} disabled={!completedCrop || completedCrop.width === 0}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium disabled:opacity-50">
                    <Plus size={14} /> 追加
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 bg-slate-100">
              {pageDataUrl && (
                <div style={{ width: `${zoom}%`, minWidth: '100%' }}>
                  <ReactCrop crop={crop} onChange={c => setCrop(c)} onComplete={c => setCompletedCrop(c)}>
                    <img ref={imgRef} src={pageDataUrl} alt={`Page ${currentPage}`}
                      className="w-full h-auto shadow-lg rounded" crossOrigin="anonymous" />
                  </ReactCrop>
                </div>
              )}
            </div>
            <div className="px-4 py-2 bg-amber-50 border-t border-amber-100 text-sm text-amber-700 shrink-0">
              {mode === 'article'
                ? '記事の範囲をドラッグ → 「追加」で複数範囲を溜める → 「まとめて抽出」'
                : mode === 'image'
                ? '画像の範囲をドラッグ → 「追加」→ 記事を選んで保存'
                : 'PDFの表紙を範囲選択 → 「追加」→ PDFを選んで保存'}
            </div>
          </div>

          {/* 右 */}
          <div className="w-1/2 flex flex-col">
            {/* クロップ一覧 */}
            <div className="border-b border-slate-200 bg-slate-50 shrink-0">
              <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-700">選択範囲 ({cropItems.length})</h3>
                {mode === 'article' && cropItems.length > 0 && (
                  <button onClick={handleExtractArticle} disabled={isExtracting}
                    className="flex items-center gap-1 px-3 py-1 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 font-medium transition">
                    {isExtracting ? <><Loader2 size={14} className="animate-spin" /> 抽出中...</>
                      : <><Scissors size={14} /> まとめて抽出</>}
                  </button>
                )}
              </div>
              {cropItems.length === 0 ? (
                <div className="px-4 py-4 text-center text-sm text-slate-400">
                  左のPDFで範囲を選択してください
                </div>
              ) : (
                <div className="flex gap-2 p-2 overflow-x-auto">
                  {cropItems.map((item, i) => (
                    <div key={item.id} className="shrink-0 w-28 rounded-lg border border-slate-200 overflow-hidden relative">
                      <img src={item.previewUrl} alt={`#${i + 1}`} className="w-full h-16 object-cover" />
                      <button onClick={() => handleRemoveCrop(i)}
                        className="absolute top-1 right-1 p-0.5 bg-white/80 rounded-full text-slate-400 hover:text-red-500">
                        <Trash2 size={12} />
                      </button>
                      <p className="text-xs text-center text-slate-500 py-0.5">#{i + 1}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* モード別コンテンツ */}
            <div className="flex-1 overflow-y-auto p-4">
              {mode === 'article' ? (
                // === 記事モード ===
                isExtracting ? (
                  <div className="flex-1 flex items-center justify-center py-12">
                    <div className="text-center">
                      <Loader2 size={32} className="animate-spin text-primary-600 mx-auto mb-3" />
                      <p className="text-slate-600">AIが記事を読み取り中...</p>
                    </div>
                  </div>
                ) : extractedArticle ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-1">タイトル</label>
                      <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-lg text-sm" />
                    </div>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-slate-600 mb-1">カテゴリ</label>
                        <select value={extractedArticle.category}
                          onChange={e => setExtractedArticle({ ...extractedArticle, category: e.target.value })}
                          className="w-full p-2 border border-slate-300 rounded-lg text-sm">
                          {MOCK_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-slate-600 mb-1">優先度</label>
                        <select value={extractedArticle.priority}
                          onChange={e => setExtractedArticle({ ...extractedArticle, priority: e.target.value })}
                          className="w-full p-2 border border-slate-300 rounded-lg text-sm">
                          <option value="high">重要</option>
                          <option value="medium">通常</option>
                          <option value="low">参考</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-1">要約</label>
                      <textarea value={editSummary} onChange={e => setEditSummary(e.target.value)} rows={2}
                        className="w-full p-2 border border-slate-300 rounded-lg text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-1">本文</label>
                      <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={10}
                        className="w-full p-2 border border-slate-300 rounded-lg text-sm font-mono" />
                    </div>
                    {/* バッジ（募集） */}
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-1">バッジ</label>
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={extractedArticle.tags?.includes('募集') || false}
                          onChange={(e) => {
                            const tags = [...(extractedArticle.tags || [])];
                            if (e.target.checked) {
                              if (!tags.includes('募集')) tags.push('募集');
                            } else {
                              const idx = tags.indexOf('募集');
                              if (idx >= 0) tags.splice(idx, 1);
                            }
                            setExtractedArticle({ ...extractedArticle, tags });
                          }}
                          className="w-4 h-4 rounded border-slate-300 text-pink-600"
                        />
                        <span className="text-sm text-slate-700">募集</span>
                      </label>
                    </div>

                    <div className="flex gap-3">
                      <button onClick={() => { setExtractedArticle(null); }}
                        className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 font-medium text-sm">
                        やり直す
                      </button>
                      <button onClick={handleSaveArticle} disabled={isSaving || !editTitle.trim()}
                        className="flex-1 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                        {isSaving ? <><Loader2 size={16} className="animate-spin" /> 保存中...</>
                          : <><Save size={16} /> 記事を保存</>}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <FileText size={48} className="text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500">範囲を選択して「追加」→「まとめて抽出」</p>
                    <p className="text-xs text-slate-400 mt-1">複数範囲を1つの記事にまとめられます</p>
                  </div>
                )
              ) : mode === 'image' ? (
                // === 画像モード ===
                cropItems.length === 0 ? (
                  <div className="text-center py-12">
                    <ImageIcon size={48} className="text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500">画像の範囲を選択して「追加」</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-slate-700">紐付け先の記事を選択</h3>

                    {/* 新規記事作成 */}
                    {!showNewArticleForm ? (
                      <button onClick={() => setShowNewArticleForm(true)}
                        className="w-full p-3 rounded-lg border-2 border-dashed border-slate-300 text-slate-500 hover:border-primary-400 hover:text-primary-600 transition flex items-center justify-center gap-2 text-sm">
                        <Plus size={16} /> 新しい記事を作成して紐付け
                      </button>
                    ) : (
                      <div className="p-3 rounded-lg border-2 border-primary-300 bg-primary-50">
                        <p className="text-xs font-medium text-primary-700 mb-2">新しい記事のタイトル</p>
                        <input type="text" value={newArticleTitle} onChange={(e) => setNewArticleTitle(e.target.value)}
                          placeholder="例：お花見のお知らせ"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                          autoFocus onKeyDown={(e) => {
                            if (e.key === 'Enter' && newArticleTitle.trim()) {
                              (async () => {
                                try {
                                  const newArticle = {
                                    organization_id: import.meta.env.VITE_DEFAULT_ORGANIZATION_ID || null,
                                    title: newArticleTitle.trim(),
                                    category: 'info',
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
                                    setArticles(prev => [...prev, result[0]]);
                                    setSelectedArticleId(result[0].id);
                                    setNewArticleTitle('');
                                    setShowNewArticleForm(false);
                                  }
                                } catch { alert('記事の作成に失敗しました'); }
                              })();
                            }
                          }} />
                        <div className="flex gap-2 mt-2">
                          <button onClick={async () => {
                            if (!newArticleTitle.trim()) return;
                            try {
                              const newArticle = {
                                organization_id: import.meta.env.VITE_DEFAULT_ORGANIZATION_ID || null,
                                title: newArticleTitle.trim(),
                                category: 'info',
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
                                setArticles(prev => [...prev, result[0]]);
                                setSelectedArticleId(result[0].id);
                                setNewArticleTitle('');
                                setShowNewArticleForm(false);
                              }
                            } catch { alert('記事の作成に失敗しました'); }
                          }} disabled={!newArticleTitle.trim()}
                            className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-xs font-medium hover:bg-primary-700 disabled:opacity-50">
                            作成
                          </button>
                          <button onClick={() => { setShowNewArticleForm(false); setNewArticleTitle(''); }}
                            className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs hover:bg-slate-200">
                            キャンセル
                          </button>
                        </div>
                      </div>
                    )}

                    {articles.map(article => (
                      <button key={article.id} onClick={() => setSelectedArticleId(article.id)}
                        className={`w-full p-3 rounded-lg border-2 text-left transition ${
                          selectedArticleId === article.id ? 'border-primary-500 bg-primary-50' : 'border-slate-200 hover:border-slate-300'
                        }`}>
                        <div className="flex items-start gap-2">
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                            selectedArticleId === article.id ? 'border-primary-500 bg-primary-500' : 'border-slate-300'
                          }`}>
                            {selectedArticleId === article.id && <Check size={10} className="text-white" />}
                          </div>
                          <p className="font-medium text-slate-800 text-sm line-clamp-1">{article.title}</p>
                        </div>
                      </button>
                    ))}
                    <button onClick={handleSaveImage} disabled={!selectedArticleId || isSaving}
                      className="w-full px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                      {isSaving ? <><Loader2 size={16} className="animate-spin" /> 保存中...</>
                        : <><Save size={16} /> {cropItems.length}枚の画像を保存</>}
                    </button>
                  </div>
                )
              ) : (
                // === サムネイルモード ===
                cropItems.length === 0 ? (
                  <div className="text-center py-12">
                    <span className="text-5xl mb-4 block">📷</span>
                    <p className="text-slate-500">PDFの表紙を範囲選択して「追加」</p>
                    <p className="text-xs text-slate-400 mt-1">選択後、紐付け先のPDFを選んで保存</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-slate-700">サムネイルを設定するPDFを選択</h3>
                    {(() => {
                      const pdfList: { url: string; label: string }[] = (pdfUrls || []).map((url: string, i: number) => ({
                        url, label: pdfLabels?.[i] || url.split('/').pop() || `PDF ${i + 1}`,
                      }));
                      return pdfList.map((pdf, i) => (
                        <button key={i} onClick={() => setSelectedArticleId(pdf.url)}
                          className={`w-full p-3 rounded-lg border-2 text-left transition ${
                            selectedArticleId === pdf.url ? 'border-primary-500 bg-primary-50' : 'border-slate-200 hover:border-slate-300'
                          }`}>
                          <div className="flex items-start gap-2">
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                              selectedArticleId === pdf.url ? 'border-primary-500 bg-primary-500' : 'border-slate-300'
                            }`}>
                              {selectedArticleId === pdf.url && <Check size={10} className="text-white" />}
                            </div>
                            <p className="font-medium text-slate-800 text-sm line-clamp-2">{pdf.label}</p>
                          </div>
                        </button>
                      ));
                    })()}
                    <button
                      onClick={async () => {
                        if (!selectedArticleId || cropItems.length === 0) return;
                        setIsSaving(true);
                        try {
                          const { uploadImage } = await import('@cc-saas/shared/services/data/storageService');
                          const { getSupabaseClient } = await import('@cc-saas/shared/services/supabaseClient');
                          const item = cropItems[0];
                          const file = new File([item.blob], `thumb-${Date.now()}.png`, { type: 'image/png' });
                          const result = await uploadImage(file);
                          // source_pdf_urls更新
                          const entries: any[] = [...((await import('@cc-saas/shared')).getSupabaseClient ? [] : [])];
                          const supabase = getSupabaseClient();
                          if (supabase) {
                            const { data: nl } = await supabase.from('newsletters').select('source_pdf_urls').eq('id', newsletterId).single();
                            const urls: any[] = nl?.source_pdf_urls || [];
                            const idx = urls.findIndex((e: any) => (typeof e === 'string' ? e : e.url) === selectedArticleId);
                            if (idx >= 0) {
                              urls[idx] = { ...(typeof urls[idx] === 'string' ? { url: urls[idx], label: '' } : urls[idx]), thumbnail: result.url };
                              await supabase.from('newsletters').update({ source_pdf_urls: urls }).eq('id', newsletterId);
                            }
                          }
                          setSavedCount(prev => prev + 1);
                          setCropItems(prev => { prev.forEach(ci => URL.revokeObjectURL(ci.previewUrl)); return []; });
                          setSelectedArticleId(null);
                          onSaved();
                        } catch (e: any) { alert(`保存に失敗しました: ${e.message}`); }
                        finally { setIsSaving(false); }
                      }}
                      disabled={!selectedArticleId || cropItems.length === 0 || isSaving}
                      className="w-full px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                      {isSaving ? <><Loader2 size={16} className="animate-spin" /> 保存中...</>
                        : <><Save size={16} /> サムネイルを保存</>}
                    </button>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
