/**
 * 記事編集ダイアログコンポーネント
 * 
 * 記事の全フィールド（タイトル、カテゴリ、優先度、4段階要約など）を編集できる
 * モーダルダイアログです。
 */

import React, { useState, useEffect, useRef } from 'react';
import { Article, Category, Priority, Visibility, Attachment } from '@cc-saas/shared';
import { X, Save, Loader2, Eye, EyeOff, Pin, Calendar, Image as ImageIcon, Upload, Trash2 } from 'lucide-react';
import { uploadImage, deleteImage } from '@cc-saas/shared/services/data/storageService';

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

  /**
   * 記事が変更されたら、フォームデータを初期化
   */
  useEffect(() => {
    if (article) {
      setFormData({
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
        is_pinned: article.is_pinned,
        attachments: article.attachments,
        thumbnail_url: article.thumbnail_url,
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
    if (!formData.headline?.trim()) {
      newErrors.headline = '見出しは必須です';
    }
    if (!formData.brief?.trim()) {
      newErrors.brief = '簡潔な説明は必須です';
    }
    if (!formData.summary?.trim()) {
      newErrors.summary = '要約は必須です';
    }
    if (!formData.content?.trim()) {
      newErrors.content = '本文は必須です';
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

          {/* 締切日と公開範囲 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                締切日
              </label>
              <div className="relative">
                <Calendar size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={formData.deadline || ''}
                  onChange={(e) => updateField('deadline', e.target.value || null)}
                  className="w-full p-3 pl-10 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                公開範囲
              </label>
              <select
                value={formData.visibility || 'public'}
                onChange={(e) => updateField('visibility', e.target.value as Visibility)}
                className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="public">一般公開</option>
                <option value="members-only">会員限定</option>
                <option value="board-only">役員のみ</option>
              </select>
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
            <h3 className="font-bold text-slate-800">4段階要約</h3>

            {/* 見出し */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                見出し（5文字程度） <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.headline || ''}
                onChange={(e) => updateField('headline', e.target.value)}
                className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                  errors.headline ? 'border-red-500' : 'border-slate-300'
                }`}
                placeholder="例: 総会案内"
                maxLength={10}
              />
              {errors.headline && (
                <p className="text-red-500 text-sm mt-1">{errors.headline}</p>
              )}
            </div>

            {/* 簡潔 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                簡潔（15文字程度） <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.brief || ''}
                onChange={(e) => updateField('brief', e.target.value)}
                className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                  errors.brief ? 'border-red-500' : 'border-slate-300'
                }`}
                placeholder="例: 定期総会を3月15日に開催"
                maxLength={30}
              />
              {errors.brief && (
                <p className="text-red-500 text-sm mt-1">{errors.brief}</p>
              )}
            </div>

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

            {/* 全文 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                全文 <span className="text-red-500">*</span>
              </label>
              <textarea
                value={formData.content || ''}
                onChange={(e) => updateField('content', e.target.value)}
                className={`w-full p-3 border rounded-lg h-40 focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                  errors.content ? 'border-red-500' : 'border-slate-300'
                }`}
                placeholder="記事の全文を入力してください"
              />
              {errors.content && (
                <p className="text-red-500 text-sm mt-1">{errors.content}</p>
              )}
            </div>
          </div>

          {/* タグ */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              タグ
            </label>
            <div className="flex gap-2 mb-2">
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
                className="flex-1 p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="タグを入力してEnter"
              />
              <button
                type="button"
                onClick={addTag}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
              >
                追加
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.tags?.map((tag, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-primary-100 text-primary-700 rounded-full text-sm"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(index)}
                    className="hover:text-primary-900"
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
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
                        className="w-full h-full object-cover"
                      />
                    </div>
                    
                    {/* サムネイルバッジ */}
                    {index === 0 && (
                      <div className="absolute top-2 left-2 bg-primary-600 text-white text-xs px-2 py-1 rounded-full font-medium">
                        サムネイル
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
