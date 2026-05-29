/**
 * 記事編集ダイアログコンポーネント
 * 
 * 記事の全フィールド（タイトル、カテゴリ、優先度、4段階要約など）を編集できる
 * モーダルダイアログです。
 */

import React, { useState, useEffect, useRef } from 'react';
import { Article, Category, Priority, Visibility, Attachment } from '@cc-saas/shared';
import { X, Save, Loader2, Eye, EyeOff, Pin, Calendar, Image as ImageIcon, Upload, Trash2, FileText } from 'lucide-react';
import { uploadImage, deleteImage } from '@cc-saas/shared/services/data/storageService';
import { RichTextEditor } from './RichTextEditor';

/**
 * ArticleEditDialogコンポーネントのProps
 */
interface ArticleEditDialogProps {
  /** ダイアログの表示状態 */
  isOpen: boolean;
  /** 編集対象の記事 */
  article: Article | null;
  /** カテゴリ一覧 */
  categories: Category[];
  /** 登録済みPDF一覧（source_pdf_urls） */
  availablePdfs?: { url: string; label: string }[];
  /** 保存ボタンクリック時のコールバック */
  onSave: (articleId: string, updates: Partial<Article>) => Promise<void>;
  /** キャンセルボタンクリック時のコールバック */
  onCancel: () => void;
}

/**
 * ArticleEditDialogコンポーネント
 * 
 * 記事を編集するためのモーダルダイアログを表示します。
 */
export const ArticleEditDialog: React.FC<ArticleEditDialogProps> = ({
  isOpen,
  article,
  categories,
  availablePdfs,
  onSave,
  onCancel,
}) => {
  // フォームの状態
  const [formData, setFormData] = useState<Partial<Article>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [newTag, setNewTag] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showPdfPicker, setShowPdfPicker] = useState(false);

  /**
   * 記事が変更されたら、フォームデータを初期化
   */
  useEffect(() => {
    if (article) {
      setFormData({
        title: article.title,
        category: article.category,
        priority: article.priority,
        control_date: article.control_date,
        summary: article.summary,
        content: article.content,
        tags: article.tags,
        visibility: article.visibility,
        is_pinned: article.is_pinned,
        attachments: article.attachments,
        thumbnail_url: article.thumbnail_url,
        thumbnail_fit: article.thumbnail_fit || 'cover',
        image_display: article.image_display || 'thumbnail',
      });
      // 既存の画像attachmentsを読み込み
      const existingImages = article.attachments.filter(att => att.type === 'image');
      setUploadedImages(existingImages);
      setErrors({});
    }
  }, [article]);

  /**
   * フォームフィールドの値を更新
   */
  const updateField = <K extends keyof Article>(
    field: K,
    value: Article[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // エラーをクリア
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  /**
   * タグを追加
   */
  const addTag = () => {
    const tag = newTag.trim();
    if (tag && formData.tags && !formData.tags.includes(tag)) {
      updateField('tags', [...formData.tags, tag]);
      setNewTag('');
    }
  };

  /**
   * タグを削除
   */
  const removeTag = (index: number) => {
    if (formData.tags) {
      const newTags = [...formData.tags];
      newTags.splice(index, 1);
      updateField('tags', newTags);
    }
  };

  /**
   * 画像ファイル選択時の処理
   */
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      const newImages: Attachment[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const result = await uploadImage(file);
          
          const imageAttachment: Attachment = {
            type: 'image',
            url: result.url,
            label: result.filename,
          };
          
          newImages.push(imageAttachment);
        } catch (error: any) {
          console.error(`画像 ${file.name} のアップロードエラー:`, error);
          alert(`画像 ${file.name} のアップロードに失敗しました: ${error.message}`);
        }
      }

      if (newImages.length > 0) {
        const updatedImages = [...uploadedImages, ...newImages];
        setUploadedImages(updatedImages);

        // attachmentsを更新（画像以外も含める）
        const nonImageAttachments = formData.attachments?.filter(att => att.type !== 'image') || [];
        const allAttachments = [...nonImageAttachments, ...updatedImages];
        updateField('attachments', allAttachments);

        // 最初の画像をサムネイルに設定（まだサムネイルがない場合）
        if (!formData.thumbnail_url && updatedImages.length > 0) {
          updateField('thumbnail_url', updatedImages[0].url);
        }
      }
    } catch (error) {
      console.error('画像アップロード処理エラー:', error);
      alert('画像のアップロードに失敗しました');
    } finally {
      setIsUploading(false);
      // input要素をリセット（同じファイルを再選択できるように）
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  /**
   * 画像を削除
   */
  const handleImageDelete = async (index: number) => {
    const imageToDelete = uploadedImages[index];
    
    if (!confirm(`画像「${imageToDelete.label}」を削除しますか？`)) {
      return;
    }

    try {
      // Storageから削除（URLからパスを抽出）
      const url = new URL(imageToDelete.url);
      const pathParts = url.pathname.split('/newsletter-images/');
      if (pathParts.length > 1) {
        const storagePath = pathParts[1];
        await deleteImage(storagePath);
      }

      // ローカル状態から削除
      const updatedImages = uploadedImages.filter((_, i) => i !== index);
      setUploadedImages(updatedImages);

      // attachmentsを更新
      const nonImageAttachments = formData.attachments?.filter(att => att.type !== 'image') || [];
      const allAttachments = [...nonImageAttachments, ...updatedImages];
      updateField('attachments', allAttachments);

      // 削除した画像がサムネイルだった場合、サムネイルを更新
      if (formData.thumbnail_url === imageToDelete.url) {
        updateField('thumbnail_url', updatedImages.length > 0 ? updatedImages[0].url : null);
      }

      console.log('画像を削除しました');
    } catch (error: any) {
      console.error('画像削除エラー:', error);
      alert(`画像の削除に失敗しました: ${error.message}`);
    }
  };

  /**
   * フォームのバリデーション
   */
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.title?.trim()) {
      newErrors.title = 'タイトルは必須です';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * 保存処理
   */
  const handleSave = async () => {
    if (!article) return;
    
    if (!validateForm()) {
      return;
    }

    setIsSaving(true);
    try {
      await onSave(article.id, formData);
      onCancel(); // ダイアログを閉じる
    } catch (error) {
      console.error('保存エラー:', error);
      alert('保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  // ダイアログが閉じている場合は何も表示しない
  if (!isOpen || !article) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div 
        className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-2xl font-bold text-slate-800">記事を編集</h2>
          <button
            type="button"
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            disabled={isSaving}
          >
            <X size={24} />
          </button>
        </div>

        {/* フォーム */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* タイトル */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              タイトル <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.title || ''}
              onChange={(e) => updateField('title', e.target.value)}
              className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                errors.title ? 'border-red-500' : 'border-slate-300'
              }`}
              placeholder="記事のタイトル"
            />
            {errors.title && (
              <p className="text-red-500 text-sm mt-1">{errors.title}</p>
            )}
          </div>

          {/* カテゴリと優先度 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                カテゴリ
              </label>
              <select
                value={formData.category || ''}
                onChange={(e) => updateField('category', e.target.value)}
                className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.icon} {cat.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                優先度
              </label>
              <select
                value={formData.priority || 'medium'}
                onChange={(e) => updateField('priority', e.target.value as Priority)}
                className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="high">重要</option>
                <option value="medium">確認推奨</option>
                <option value="low">参考情報</option>
              </select>
            </div>
          </div>

          {/* 管理用日付 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-1">
                <Calendar size={14} /> 日付
              </label>
              <input
                type="date"
                value={formData.control_date || ''}
                onChange={(e) => updateField('control_date', e.target.value || null)}
                className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

          </div>

          {/* ピン留め */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="is_pinned"
              checked={formData.is_pinned || false}
              onChange={(e) => updateField('is_pinned', e.target.checked)}
              className="w-5 h-5 text-primary-600 border-slate-300 rounded focus:ring-primary-500"
            />
            <label htmlFor="is_pinned" className="text-sm font-medium text-slate-700 flex items-center gap-2">
              <Pin size={16} className="text-primary-600" />
              記事をピン留めする（常に上部に表示）
            </label>
          </div>

          {/* 4段階要約 */}
          <div className="border-t pt-6 space-y-4">
            <h3 className="font-bold text-slate-800">記事内容</h3>

            {/* 要約 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                要約（40文字程度） <span className="text-red-500">*</span>
              </label>
              <textarea
                value={formData.summary || ''}
                onChange={(e) => updateField('summary', e.target.value)}
                className={`w-full p-3 border rounded-lg h-20 focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                  errors.summary ? 'border-red-500' : 'border-slate-300'
                }`}
                placeholder="例: 令和6年度定期総会を3月15日（土）午前10時から会館で開催します。出欠票は3月1日までに提出してください。"
                maxLength={80}
              />
              {errors.summary && (
                <p className="text-red-500 text-sm mt-1">{errors.summary}</p>
              )}
            </div>

            {/* 全文（WYSIWYGエディタ） */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                全文 <span className="text-red-500">*</span>
              </label>
              <RichTextEditor
                value={formData.content || ''}
                onChange={(md) => updateField('content', md)}
                placeholder="記事の全文を入力してください"
              />
              {errors.content && (
                <p className="text-red-500 text-sm mt-1">{errors.content}</p>
              )}
            </div>
          </div>

          {/* バッジ（募集など） */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              バッジ（記事上部に表示）
            </label>
            <div className="flex gap-2 mb-2 flex-wrap">
              {['募集'].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    if (formData.tags?.includes(preset)) {
                      updateField('tags', formData.tags.filter((t: string) => t !== preset));
                    } else {
                      updateField('tags', [...(formData.tags || []), preset]);
                    }
                  }}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium transition ${
                    formData.tags?.includes(preset)
                      ? 'bg-pink-500 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                className="flex-1 p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="自由入力で追加"
              />
              <button
                type="button"
                onClick={addTag}
                className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm"
              >
                追加
              </button>
            </div>
            {formData.tags && formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.tags.map((tag: string, index: number) => (
                  <span
                    key={index}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-pink-100 text-pink-700 rounded-full text-sm"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(index)}
                      className="hover:text-pink-900"
                    >
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 画像アップロード */}
          <div className="border-t pt-6">
            <div className="flex items-center justify-between mb-4">
              <label className="block text-sm font-medium text-slate-700 flex items-center gap-2">
                <ImageIcon size={18} />
                画像
              </label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Upload size={16} />
                {isUploading ? 'アップロード中...' : '画像を追加'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                multiple
                onChange={handleImageSelect}
                className="hidden"
              />
            </div>

            {/* 画像一覧 */}
            {uploadedImages.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {uploadedImages.map((image, index) => (
                  <div key={index} className="relative group">
                    <div className="aspect-square rounded-lg overflow-hidden bg-slate-100 border border-slate-200">
                      <img
                        src={image.url}
                        alt={image.label}
                        className={`w-full h-full ${index === 0 && formData.thumbnail_fit === 'contain' ? 'object-contain' : 'object-cover'}`}
                      />
                    </div>
                    
                    {/* サムネイルバッジ + 表示モード */}
                    {index === 0 && (
                      <div className="absolute top-2 left-2 flex flex-col gap-1">
                        <div className="bg-primary-600 text-white text-xs px-2 py-1 rounded-full font-medium w-fit">
                          サムネイル
                        </div>
                        <select
                          value={formData.image_display || 'thumbnail'}
                          onChange={(e) => updateField('image_display', e.target.value as any)}
                          className="bg-white/90 rounded-full px-2 py-1 text-xs text-slate-700 border border-slate-300"
                        >
                          <option value="thumbnail">切り取り</option>
                          <option value="full">全体表示</option>
                          <option value="tall">縦長表示（マンガ・チラシ向け）</option>
                        </select>
                      </div>
                    )}

                    {/* 削除ボタン */}
                    <button
                      type="button"
                      onClick={() => handleImageDelete(index)}
                      className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700"
                      title="画像を削除"
                    >
                      <Trash2 size={16} />
                    </button>

                    {/* ファイル名 */}
                    <p className="mt-2 text-xs text-slate-600 truncate">
                      {image.label}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 border-2 border-dashed border-slate-300 rounded-lg bg-slate-50">
                <ImageIcon size={48} className="mx-auto text-slate-400 mb-2" />
                <p className="text-sm text-slate-600 mb-1">画像がありません</p>
                <p className="text-xs text-slate-500">
                  画像を追加すると、最初の画像が自動的にサムネイルに設定されます
                </p>
              </div>
            )}

            {/* アップロード中の表示 */}
            {isUploading && (
              <div className="mt-4 flex items-center justify-center gap-2 text-primary-600">
                <Loader2 size={20} className="animate-spin" />
                <span className="text-sm">画像をアップロード中...</span>
              </div>
            )}
          </div>

          {/* PDF添付 */}
          <div className="border-t pt-6">
            <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
              <FileText size={20} />
              添付PDF
            </h3>

            {/* 既存のPDF一覧 */}
            {formData.attachments?.filter((a: any) => a.type === 'pdf').length > 0 && (
              <div className="space-y-2 mb-4">
                {formData.attachments?.filter((a: any) => a.type === 'pdf').map((att: any, idx: number) => (
                  <div key={`pdf-${idx}`} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg group">
                    <a href={att.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 min-w-0">
                      <FileText size={16} />
                      <span className="truncate">{att.label || 'PDF'}</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = formData.attachments?.filter((_: any, i: number) => {
                          // PDF添付のインデックスを計算
                          const pdfIndex = formData.attachments?.filter((a: any) => a.type === 'pdf').indexOf(att);
                          const allIndex = formData.attachments?.indexOf(att);
                          return i !== allIndex;
                        }) || [];
                        updateField('attachments', updated);
                      }}
                      className="p-1 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* PDF追加ボタン */}
            <div className="flex gap-2 flex-wrap">
              <label className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 cursor-pointer transition text-sm font-medium">
                <Upload size={16} />
                PDFをアップロード
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const { uploadPDF } = await import('@cc-saas/shared/services/data/storageService');
                      const result = await uploadPDF(file, 'attachment');
                      const newAttachment = {
                        type: 'pdf' as const,
                        url: result.url,
                        label: file.name.replace(/\.pdf$/i, ''),
                      };
                      updateField('attachments', [...(formData.attachments || []), newAttachment]);
                    } catch {
                      alert('PDFのアップロードに失敗しました');
                    }
                    e.target.value = '';
                  }}
                />
              </label>

              {availablePdfs && availablePdfs.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowPdfPicker(!showPdfPicker)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition text-sm font-medium"
                >
                  <FileText size={16} />
                  登録済みPDFから選択
                </button>
              )}
            </div>

            {/* 登録済みPDF選択リスト */}
            {showPdfPicker && availablePdfs && (
              <div className="mt-3 border border-blue-200 rounded-lg bg-blue-50/50 p-3">
                <p className="text-xs text-slate-500 mb-2">この号に登録されているPDFから選択:</p>
                <div className="space-y-1">
                  {availablePdfs.map((pdf, idx) => {
                    const alreadyAttached = formData.attachments?.some(
                      (a: any) => a.type === 'pdf' && a.url === pdf.url
                    );
                    return (
                      <button
                        key={idx}
                        type="button"
                        disabled={alreadyAttached}
                        onClick={() => {
                          const newAttachment = {
                            type: 'pdf' as const,
                            url: pdf.url,
                            label: pdf.label,
                          };
                          updateField('attachments', [...(formData.attachments || []), newAttachment]);
                          setShowPdfPicker(false);
                        }}
                        className={`w-full flex items-center gap-2 p-2 rounded-lg text-sm text-left transition ${
                          alreadyAttached
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'hover:bg-blue-100 text-slate-700'
                        }`}
                      >
                        <FileText size={14} />
                        <span className="truncate flex-1">{pdf.label}</span>
                        {alreadyAttached && (
                          <span className="text-xs text-slate-400">添付済み</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* フッター */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="px-6 py-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <Save size={18} />
                保存する
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
