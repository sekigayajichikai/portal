/**
 * 画像紐付けダイアログ
 *
 * Newsletter から抽出された保留画像を表示し、記事に紐付けるためのダイアログコンポーネントです。
 * 画像のプレビュー、AI推奨情報、記事一覧を表示し、手動で画像と記事を紐付けることができます。
 */

import React, { useState, useEffect } from 'react';
import { X, Check, XCircle, Image as ImageIcon, FileText, Sparkles } from 'lucide-react';
import type { PendingImage, Article } from '@cc-saas/shared';
import { getPendingImagesByNewsletterId, assignImageToArticle, rejectPendingImage } from '@cc-saas/shared/services/pendingImageService';
import { updateArticle } from '@cc-saas/shared';

interface ImageAssignmentDialogProps {
  isOpen: boolean;
  newsletterId: string;
  articles: Article[];
  onClose: () => void;
  onAssigned: () => void; // 紐付け完了後の更新コールバック
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
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // 保留画像を読み込み
  useEffect(() => {
    if (isOpen && newsletterId) {
      loadPendingImages();
    }
  }, [isOpen, newsletterId]);

  const loadPendingImages = async () => {
    setIsLoading(true);
    try {
      const images = await getPendingImagesByNewsletterId(newsletterId, true);
      setPendingImages(images);
      if (images.length > 0) {
        setSelectedImageIndex(0);
        // AI推奨記事を自動選択
        const firstImage = images[0];
        if (firstImage.suggested_article_ids && firstImage.suggested_article_ids.length > 0) {
          setSelectedArticleId(firstImage.suggested_article_ids[0]);
        }
      }
    } catch (error) {
      console.error('保留画像の読み込みエラー:', error);
      alert('保留画像の読み込みに失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  // 画像を記事に紐付ける
  const handleAssignToArticle = async () => {
    if (!selectedArticleId) {
      alert('記事を選択してください');
      return;
    }

    const currentImage = pendingImages[selectedImageIndex];
    if (!currentImage) return;

    setIsProcessing(true);
    try {
      // 保留画像のステータスを更新
      await assignImageToArticle(currentImage.id, selectedArticleId);

      // 記事のattachmentsに画像を追加
      const article = articles.find((a) => a.id === selectedArticleId);
      if (article) {
        const newAttachment = {
          type: 'image' as const,
          url: currentImage.image_url,
          label: currentImage.caption || '画像',
        };

        const existingAttachments = article.attachments || [];
        await updateArticle(article.id, {
          attachments: [...existingAttachments, newAttachment],
        });
      }

      console.log('✅ 画像を記事に紐付けました');

      // 次の画像に進むか、ダイアログを閉じる
      const newPendingImages = pendingImages.filter((_, i) => i !== selectedImageIndex);
      setPendingImages(newPendingImages);

      if (newPendingImages.length > 0) {
        // 次の画像があれば自動選択
        setSelectedImageIndex(Math.min(selectedImageIndex, newPendingImages.length - 1));
        const nextImage = newPendingImages[Math.min(selectedImageIndex, newPendingImages.length - 1)];
        if (nextImage.suggested_article_ids && nextImage.suggested_article_ids.length > 0) {
          setSelectedArticleId(nextImage.suggested_article_ids[0]);
        } else {
          setSelectedArticleId(null);
        }
      } else {
        // 全ての画像を処理完了
        alert('全ての画像を処理しました');
        onAssigned();
        onClose();
      }
    } catch (error) {
      console.error('画像紐付けエラー:', error);
      alert('画像の紐付けに失敗しました');
    } finally {
      setIsProcessing(false);
    }
  };

  // 画像を却下
  const handleRejectImage = async () => {
    const currentImage = pendingImages[selectedImageIndex];
    if (!currentImage) return;

    if (!confirm('この画像を却下しますか？')) {
      return;
    }

    setIsProcessing(true);
    try {
      await rejectPendingImage(currentImage.id);

      console.log('✅ 画像を却下しました');

      // 次の画像に進むか、ダイアログを閉じる
      const newPendingImages = pendingImages.filter((_, i) => i !== selectedImageIndex);
      setPendingImages(newPendingImages);

      if (newPendingImages.length > 0) {
        setSelectedImageIndex(Math.min(selectedImageIndex, newPendingImages.length - 1));
        const nextImage = newPendingImages[Math.min(selectedImageIndex, newPendingImages.length - 1)];
        if (nextImage.suggested_article_ids && nextImage.suggested_article_ids.length > 0) {
          setSelectedArticleId(nextImage.suggested_article_ids[0]);
        } else {
          setSelectedArticleId(null);
        }
      } else {
        alert('全ての画像を処理しました');
        onAssigned();
        onClose();
      }
    } catch (error) {
      console.error('画像却下エラー:', error);
      alert('画像の却下に失敗しました');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  const currentImage = pendingImages[selectedImageIndex];
  const suggestedArticle =
    currentImage?.suggested_article_ids?.[0]
      ? articles.find((a) => a.id === currentImage.suggested_article_ids[0])
      : null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <ImageIcon size={24} className="text-primary-600" />
            <h3 className="font-bold text-xl text-slate-800">
              保留画像の紐付け ({pendingImages.length}件)
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition"
          >
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
            {/* 左側: 画像プレビュー */}
            <div className="w-1/2 p-6 border-r border-slate-200 overflow-y-auto">
              <div className="mb-4">
                <p className="text-sm text-slate-600 mb-2">
                  画像 {selectedImageIndex + 1} / {pendingImages.length}
                </p>
                <div className="bg-slate-100 rounded-lg overflow-hidden mb-4">
                  <img
                    src={currentImage.image_url}
                    alt={currentImage.caption || '画像'}
                    className="w-full h-auto"
                  />
                </div>

                {/* 画像情報 */}
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1">ページ番号</p>
                    <p className="text-sm text-slate-800">Page {currentImage.page_number}</p>
                  </div>

                  {currentImage.caption && (
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-1">キャプション</p>
                      <p className="text-sm text-slate-800">{currentImage.caption}</p>
                    </div>
                  )}

                  {currentImage.detected_context && (
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-1">周辺テキスト</p>
                      <p className="text-sm text-slate-600 line-clamp-3">
                        {currentImage.detected_context}
                      </p>
                    </div>
                  )}

                  {suggestedArticle && (
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles size={16} className="text-purple-600" />
                        <p className="text-xs font-medium text-purple-700">AI推奨記事</p>
                        <span className="text-xs text-purple-600">
                          {Math.round(currentImage.confidence_score * 100)}%
                        </span>
                      </div>
                      <p className="text-sm font-medium text-slate-800">
                        {suggestedArticle.title}
                      </p>
                      <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                        {suggestedArticle.summary}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* 画像ナビゲーション */}
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedImageIndex(Math.max(0, selectedImageIndex - 1))}
                  disabled={selectedImageIndex === 0}
                  className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  前の画像
                </button>
                <button
                  onClick={() =>
                    setSelectedImageIndex(Math.min(pendingImages.length - 1, selectedImageIndex + 1))
                  }
                  disabled={selectedImageIndex === pendingImages.length - 1}
                  className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  次の画像
                </button>
              </div>
            </div>

            {/* 右側: 記事一覧 */}
            <div className="w-1/2 p-6 overflow-y-auto">
              <h4 className="font-bold text-lg text-slate-800 mb-4 flex items-center gap-2">
                <FileText size={20} />
                記事を選択
              </h4>

              <div className="space-y-2">
                {articles.map((article) => (
                  <button
                    key={article.id}
                    onClick={() => setSelectedArticleId(article.id)}
                    className={`w-full p-4 rounded-lg border-2 text-left transition ${
                      selectedArticleId === article.id
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                          selectedArticleId === article.id
                            ? 'border-primary-500 bg-primary-500'
                            : 'border-slate-300'
                        }`}
                      >
                        {selectedArticleId === article.id && (
                          <Check size={12} className="text-white" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-slate-800 mb-1">{article.title}</p>
                        <p className="text-sm text-slate-600 line-clamp-2">{article.summary}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* フッター（アクションボタン） */}
        {pendingImages.length > 0 && (
          <div className="p-6 border-t border-slate-200 flex gap-3">
            <button
              onClick={handleRejectImage}
              disabled={isProcessing}
              className="px-6 py-3 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 font-medium flex items-center gap-2 disabled:opacity-50"
            >
              <XCircle size={20} />
              却下
            </button>
            <button
              onClick={handleAssignToArticle}
              disabled={!selectedArticleId || isProcessing}
              className="flex-1 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  処理中...
                </>
              ) : (
                <>
                  <Check size={20} />
                  記事に追加
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
