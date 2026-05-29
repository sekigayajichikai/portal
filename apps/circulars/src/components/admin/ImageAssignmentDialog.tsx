/**
 * 画像紐付けダイアログ
 *
 * Newsletter から抽出された保留画像を表示し、記事に紐付けるためのダイアログコンポーネントです。
 * 1枚のページ画像から複数の領域を切り抜き、それぞれ別の記事に紐付けることができます。
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { X, Check, XCircle, Image as ImageIcon, FileText, Sparkles, Crop as CropIcon, Plus, Trash2, ChevronRight } from 'lucide-react';
import type { PendingImage, Article } from '@cc-saas/shared';
import { getPendingImagesByNewsletterId, assignImageToArticle, rejectPendingImage } from '@cc-saas/shared/services/image/pendingImageService';
import { updateArticle } from '@cc-saas/shared';
import { uploadImage } from '@cc-saas/shared/services/data/storageService';

interface CroppedItem {
  id: string;
  blob: Blob;
  previewUrl: string;
  articleId: string | null;
}

interface ImageAssignmentDialogProps {
  isOpen: boolean;
  newsletterId: string;
  articles: Article[];
  onClose: () => void;
  onAssigned: () => void;
}

export const ImageAssignmentDialog: React.FC<ImageAssignmentDialogProps> = ({
  isOpen,
  newsletterId,
  articles,
  onClose,
  onAssigned,
}) => {
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // クロップ関連
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [isCropping, setIsCropping] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // 複数切り抜き管理
  const [croppedItems, setCroppedItems] = useState<CroppedItem[]>([]);
  const [selectedCroppedIndex, setSelectedCroppedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen && newsletterId) {
      loadPendingImages();
    }
  }, [isOpen, newsletterId]);

  // 画像が切り替わったらクロップ状態をリセット
  useEffect(() => {
    resetAllCrops();
  }, [selectedImageIndex]);

  const loadPendingImages = async () => {
    setIsLoading(true);
    try {
      const images = await getPendingImagesByNewsletterId(newsletterId, true);
      setPendingImages(images);
      if (images.length > 0) {
        setSelectedImageIndex(0);
      }
    } catch (error) {
      console.error('保留画像の読み込みエラー:', error);
      alert('保留画像の読み込みに失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  const resetAllCrops = () => {
    setCrop(undefined);
    setCompletedCrop(undefined);
    setIsCropping(false);
    setSelectedCroppedIndex(null);
    // プレビューURLを解放
    croppedItems.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setCroppedItems([]);
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
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      cropWidth,
      cropHeight,
      0,
      0,
      cropWidth,
      cropHeight
    );

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png', 0.95);
    });
  }, [completedCrop]);

  /** 切り抜きを追加 */
  const handleAddCrop = async () => {
    const blob = await getCroppedBlob();
    if (!blob) {
      alert('切り抜きに失敗しました');
      return;
    }

    const previewUrl = URL.createObjectURL(blob);
    const newItem: CroppedItem = {
      id: `crop-${Date.now()}`,
      blob,
      previewUrl,
      articleId: null,
    };

    setCroppedItems((prev) => [...prev, newItem]);
    setSelectedCroppedIndex(croppedItems.length);
    setCrop(undefined);
    setCompletedCrop(undefined);
    setIsCropping(false);
  };

  /** 切り抜きを削除 */
  const handleRemoveCrop = (index: number) => {
    const item = croppedItems[index];
    URL.revokeObjectURL(item.previewUrl);
    setCroppedItems((prev) => prev.filter((_, i) => i !== index));
    if (selectedCroppedIndex === index) {
      setSelectedCroppedIndex(null);
    } else if (selectedCroppedIndex !== null && selectedCroppedIndex > index) {
      setSelectedCroppedIndex(selectedCroppedIndex - 1);
    }
  };

  /** 切り抜きに記事を紐付け */
  const handleSetArticleForCrop = (articleId: string) => {
    if (selectedCroppedIndex === null) return;
    setCroppedItems((prev) =>
      prev.map((item, i) => (i === selectedCroppedIndex ? { ...item, articleId } : item))
    );
  };

  /** 全ての切り抜きを一括保存 */
  const handleSaveAllCrops = async () => {
    const itemsToSave = croppedItems.filter((item) => item.articleId);
    if (itemsToSave.length === 0) {
      alert('記事が紐付けられた切り抜きがありません');
      return;
    }

    const currentImage = pendingImages[selectedImageIndex];
    if (!currentImage) return;

    setIsProcessing(true);
    try {
      for (const item of itemsToSave) {
        const file = new File([item.blob], `cropped-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.png`, { type: 'image/png' });
        const uploadResult = await uploadImage(file);

        const article = articles.find((a) => a.id === item.articleId);
        if (article) {
          const newAttachment = {
            type: 'image' as const,
            url: uploadResult.url,
            label: `${currentImage.detected_context || '画像'} (切り抜き)`,
          };
          const existingAttachments = article.attachments || [];
          await updateArticle(article.id, {
            attachments: [...existingAttachments, newAttachment],
          });
          console.log(`✅ 切り抜き画像を「${article.title}」に追加`);
        }
      }

      // 元画像のステータスを更新
      await assignImageToArticle(currentImage.id, itemsToSave[0].articleId!);

      advanceToNextImage();
    } catch (error) {
      console.error('画像保存エラー:', error);
      alert('画像の保存に失敗しました');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectImage = async () => {
    const currentImage = pendingImages[selectedImageIndex];
    if (!currentImage) return;
    if (!confirm('この画像を却下しますか？')) return;

    setIsProcessing(true);
    try {
      await rejectPendingImage(currentImage.id);
      advanceToNextImage();
    } catch (error) {
      console.error('画像却下エラー:', error);
      alert('画像の却下に失敗しました');
    } finally {
      setIsProcessing(false);
    }
  };

  const advanceToNextImage = () => {
    resetAllCrops();
    const newPendingImages = pendingImages.filter((_, i) => i !== selectedImageIndex);
    setPendingImages(newPendingImages);

    if (newPendingImages.length > 0) {
      setSelectedImageIndex(Math.min(selectedImageIndex, newPendingImages.length - 1));
    } else {
      alert('全ての画像を処理しました');
      onAssigned();
      onClose();
    }
  };

  if (!isOpen) return null;

  const currentImage = pendingImages[selectedImageIndex];
  const selectedCropped = selectedCroppedIndex !== null ? croppedItems[selectedCroppedIndex] : null;
  const assignedCount = croppedItems.filter((item) => item.articleId).length;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-7xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <ImageIcon size={24} className="text-primary-600" />
            <h3 className="font-bold text-xl text-slate-800">
              保留画像の紐付け ({pendingImages.length}件)
            </h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
            <X size={24} />
          </button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center p-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
              <p className="text-slate-600">保留画像を読み込み中...</p>
            </div>
          </div>
        ) : pendingImages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-12">
            <div className="text-center">
              <ImageIcon size={48} className="text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600">保留画像はありません</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex">
            {/* 左: 元画像 + クロップ */}
            <div className="w-5/12 p-5 border-r border-slate-200 overflow-y-auto flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-slate-600">
                  ページ {selectedImageIndex + 1} / {pendingImages.length}
                </p>
                {!isCropping ? (
                  <button
                    onClick={() => setIsCropping(true)}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 transition font-medium"
                  >
                    <CropIcon size={14} />
                    切り抜き
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setIsCropping(false); setCrop(undefined); }}
                      className="px-3 py-1.5 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition"
                    >
                      キャンセル
                    </button>
                    <button
                      onClick={handleAddCrop}
                      disabled={!completedCrop || completedCrop.width === 0}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium disabled:opacity-50"
                    >
                      <Plus size={14} />
                      追加
                    </button>
                  </div>
                )}
              </div>

              {/* 画像表示 */}
              <div className="bg-slate-100 rounded-lg overflow-hidden flex-1 min-h-0">
                {isCropping ? (
                  <ReactCrop
                    crop={crop}
                    onChange={(c) => setCrop(c)}
                    onComplete={(c) => setCompletedCrop(c)}
                  >
                    <img
                      ref={imgRef}
                      src={currentImage.image_url}
                      alt={currentImage.caption || '画像'}
                      className="w-full h-auto"
                      crossOrigin="anonymous"
                    />
                  </ReactCrop>
                ) : (
                  <img
                    src={currentImage.image_url}
                    alt={currentImage.caption || '画像'}
                    className="w-full h-auto"
                  />
                )}
              </div>

              {isCropping && (
                <p className="text-sm text-amber-700 bg-amber-50 p-2 rounded-lg mt-3">
                  ドラッグで範囲を選択 → 「追加」で切り抜きリストに追加
                </p>
              )}

              {/* ページナビゲーション */}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setSelectedImageIndex(Math.max(0, selectedImageIndex - 1))}
                  disabled={selectedImageIndex === 0}
                  className="flex-1 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  前のページ
                </button>
                <button
                  onClick={() => setSelectedImageIndex(Math.min(pendingImages.length - 1, selectedImageIndex + 1))}
                  disabled={selectedImageIndex === pendingImages.length - 1}
                  className="flex-1 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  次のページ
                </button>
              </div>
            </div>

            {/* 中央: 切り抜きリスト */}
            <div className="w-3/12 p-5 border-r border-slate-200 overflow-y-auto bg-slate-50">
              <h4 className="font-bold text-sm text-slate-800 mb-3 flex items-center gap-2">
                <CropIcon size={16} />
                切り抜き一覧 ({croppedItems.length})
              </h4>

              {croppedItems.length === 0 ? (
                <div className="text-center py-8">
                  <CropIcon size={32} className="text-slate-300 mx-auto mb-3" />
                  <p className="text-sm text-slate-500">
                    「切り抜き」ボタンから<br />画像を切り抜いてください
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {croppedItems.map((item, index) => {
                    const assignedArticle = item.articleId
                      ? articles.find((a) => a.id === item.articleId)
                      : null;

                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelectedCroppedIndex(index)}
                        className={`rounded-lg border-2 overflow-hidden cursor-pointer transition ${
                          selectedCroppedIndex === index
                            ? 'border-primary-500 shadow-md'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <img
                          src={item.previewUrl}
                          alt={`切り抜き ${index + 1}`}
                          className="w-full h-24 object-cover"
                        />
                        <div className="p-2 bg-white">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-600">
                              #{index + 1}
                            </span>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRemoveCrop(index); }}
                              className="text-slate-400 hover:text-red-500 transition"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                          {assignedArticle ? (
                            <p className="text-xs text-primary-700 font-medium mt-1 line-clamp-1">
                              → {assignedArticle.title}
                            </p>
                          ) : (
                            <p className="text-xs text-amber-600 mt-1">記事を選択してください</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 右: 記事一覧 */}
            <div className="w-4/12 p-5 overflow-y-auto">
              <h4 className="font-bold text-sm text-slate-800 mb-3 flex items-center gap-2">
                <FileText size={16} />
                {selectedCroppedIndex !== null
                  ? `切り抜き #${selectedCroppedIndex + 1} の紐付け先`
                  : '記事一覧'}
              </h4>

              {selectedCroppedIndex === null ? (
                <div className="text-center py-8">
                  <FileText size={32} className="text-slate-300 mx-auto mb-3" />
                  <p className="text-sm text-slate-500">
                    左の切り抜きを選択すると<br />紐付け先の記事を選べます
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {articles.map((article) => (
                    <button
                      key={article.id}
                      onClick={() => handleSetArticleForCrop(article.id)}
                      className={`w-full p-3 rounded-lg border-2 text-left transition ${
                        selectedCropped?.articleId === article.id
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div
                          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                            selectedCropped?.articleId === article.id
                              ? 'border-primary-500 bg-primary-500'
                              : 'border-slate-300'
                          }`}
                        >
                          {selectedCropped?.articleId === article.id && (
                            <Check size={10} className="text-white" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-800 text-sm mb-0.5 line-clamp-1">{article.title}</p>
                          <p className="text-xs text-slate-600 line-clamp-2">{article.summary}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* フッター */}
        {pendingImages.length > 0 && (
          <div className="p-5 border-t border-slate-200 flex items-center gap-3">
            <button
              onClick={handleRejectImage}
              disabled={isProcessing}
              className="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 font-medium flex items-center gap-2 disabled:opacity-50 text-sm"
            >
              <XCircle size={18} />
              このページをスキップ
            </button>
            <div className="flex-1" />
            {croppedItems.length > 0 && (
              <p className="text-sm text-slate-500">
                {assignedCount}/{croppedItems.length} 件の切り抜きに記事を紐付け済み
              </p>
            )}
            <button
              onClick={handleSaveAllCrops}
              disabled={assignedCount === 0 || isProcessing}
              className="px-6 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {isProcessing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  保存中...
                </>
              ) : (
                <>
                  <Check size={18} />
                  {assignedCount}件の切り抜きを保存
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
