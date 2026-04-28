/**
 * 記事一覧コンポーネント
 *
 * PDFから抽出された記事を表示し、4段階要約の切り替え、優先度別の色分け、
 * カテゴリフィルターなどの機能を提供します。
 */

import React, { useState } from 'react';
import { Article, Category, Priority, updateArticle, updateArticleOrders } from '@cc-saas/shared';
import { ChevronDown, ChevronUp, Calendar, Tag, Eye, EyeOff, Pin, FileText, Edit2, GripVertical, Download, Trash2, ExternalLink } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { ArticleEditDialog } from './ArticleEditDialog';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface ArticleListProps {
  articles: Article[];
  categories: Category[];
  onSave?: (articles: Article[]) => void;
  onArticleUpdate?: (articleId: string, updates: Partial<Article>) => void;
  onArticlesReorder?: (articles: Article[]) => void;
  onArticleDelete?: (articleId: string) => Promise<void>;
  enableDragAndDrop?: boolean;
}

type ViewLevel = 'headline' | 'brief' | 'summary' | 'content';

/**
 * 優先度に対応する色クラスを取得
 * カテゴリが「地域のお知らせ」の場合は薄い緑色を返す
 */
const getPriorityColor = (priority: Priority, category?: string): string => {
  // 地域のお知らせの場合は優先順位に関係なく薄い緑色
  if (category === 'local-info') {
    return 'bg-green-50 border-green-200';
  }

  switch (priority) {
    case 'high':
      return 'bg-red-50 border-red-200';
    case 'medium':
      return 'bg-yellow-50 border-yellow-200';
    case 'low':
      return 'bg-slate-50 border-slate-200';
  }
};

/**
 * 優先度に対応するバッジ色を取得
 */
const getPriorityBadgeColor = (priority: Priority): string => {
  switch (priority) {
    case 'high':
      return 'bg-red-100 text-red-700';
    case 'medium':
      return 'bg-yellow-100 text-yellow-700';
    case 'low':
      return 'bg-slate-100 text-slate-600';
  }
};

/**
 * 優先度のラベルを取得
 */
const getPriorityLabel = (priority: Priority): string => {
  switch (priority) {
    case 'high':
      return '重要';
    case 'medium':
      return '確認推奨';
    case 'low':
      return '参考情報';
  }
};

/**
 * カテゴリの色クラスを取得
 */
const getCategoryColor = (color: string): string => {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    gray: 'bg-slate-100 text-slate-600',
    purple: 'bg-purple-100 text-purple-700',
    green: 'bg-emerald-100 text-emerald-700',
    'light-green': 'bg-green-100 text-green-700',
  };
  return colorMap[color] || 'bg-slate-100 text-slate-600';
};

/**
 * 公開範囲のアイコンと色を取得
 */
const getVisibilityStyle = (visibility: string): { icon: typeof Eye; color: string; label: string } => {
  switch (visibility) {
    case 'public':
      return { icon: Eye, color: 'text-blue-600', label: '一般公開' };
    case 'members-only':
      return { icon: Eye, color: 'text-yellow-600', label: '会員限定' };
    case 'board-only':
      return { icon: EyeOff, color: 'text-slate-600', label: '役員のみ' };
    default:
      return { icon: Eye, color: 'text-slate-400', label: '不明' };
  }
};

type SortOption = 'priority' | 'category' | 'source' | 'date';

/**
 * ドラッグ可能な記事アイテムコンポーネント
 */
interface SortableArticleItemProps {
  article: Article;
  isExpanded: boolean;
  categoryInfo: Category | undefined;
  visibilityStyle: { icon: typeof Eye; color: string; label: string };
  viewLevel: ViewLevel;
  onToggleExpand: () => void;
  onEditClick: (article: Article, event: React.MouseEvent) => void;
  onDeleteClick: (article: Article, event: React.MouseEvent) => void;
  getArticleContent: (article: Article) => string;
}

const SortableArticleItem: React.FC<SortableArticleItemProps> = ({
  article,
  isExpanded,
  categoryInfo,
  visibilityStyle,
  viewLevel,
  onToggleExpand,
  onEditClick,
  onDeleteClick,
  getArticleContent,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: article.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const VisibilityIcon = visibilityStyle.icon;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-xl shadow-sm border-2 transition-all ${getPriorityColor(
        article.priority,
        article.category
      )}`}
    >
      {/* ヘッダー */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          {/* ドラッグハンドル */}
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 transition-colors pt-1"
          >
            <GripVertical size={20} />
          </div>

          <div className="flex-1" onClick={onToggleExpand}>
            <div className="flex items-center gap-2 mb-2 flex-wrap cursor-pointer">
              {/* ピン留めバッジ */}
              {article.is_pinned && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-100 text-primary-700 rounded-md text-xs font-bold">
                  <Pin size={12} />
                  ピン留め
                </span>
              )}

              {/* 優先度バッジ */}
              <span
                className={`px-2 py-0.5 rounded-md text-xs font-bold ${getPriorityBadgeColor(
                  article.priority
                )}`}
              >
                {getPriorityLabel(article.priority)}
              </span>

              {/* カテゴリバッジ（地域のお知らせの場合は表示しない） */}
              {categoryInfo && article.category !== 'local-info' && (
                <span
                  className={`px-2 py-0.5 rounded-md text-xs font-bold ${getCategoryColor(
                    categoryInfo.color
                  )}`}
                >
                  {categoryInfo.icon} {categoryInfo.label}
                </span>
              )}

              {/* 締切日 */}
              {article.deadline && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-100 text-rose-700 rounded-md text-xs font-bold">
                  <Calendar size={12} />
                  締切: {article.deadline}
                </span>
              )}

              {/* 公開範囲 */}
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 rounded-md text-xs ${visibilityStyle.color}`}
              >
                <VisibilityIcon size={12} />
                {visibilityStyle.label}
              </span>

              {/* ソース表示 */}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-100 text-primary-700 rounded-md text-xs font-medium">
                <FileText size={12} />
                {article.source}
              </span>
            </div>

            {/* タイトル */}
            <h3 className="text-lg font-bold text-slate-800 mb-1">{article.title}</h3>

            {/* 要約（折りたたみ時） */}
            {!isExpanded && (
              <p className="text-sm text-slate-600">{getArticleContent(article)}</p>
            )}
          </div>

          {/* 展開/折りたたみアイコン */}
          <button
            onClick={onToggleExpand}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
        </div>
      </div>

      {/* 展開時の詳細 */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-slate-200/50 pt-4 space-y-3">
          {/* 本文 */}
          <div className="bg-white p-4 rounded-lg">
            <div className="prose-compact max-w-none text-slate-700">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                {getArticleContent(article)}
              </ReactMarkdown>
            </div>
          </div>

          {/* タグ */}
          {article.tags.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Tag size={14} className="text-slate-400" />
              {article.tags.map((tag, index) => (
                <span
                  key={index}
                  className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-xs"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* メタ情報とボタン */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span>出典: {article.source}</span>
              <span>作成: {new Date(article.created_at).toLocaleDateString('ja-JP')}</span>
            </div>

            {/* ボタングループ（右下） */}
            <div className="flex items-center gap-2">
              {/* 編集ボタン */}
              <button
                type="button"
                onClick={(e) => onEditClick(article, e)}
                className="flex items-center gap-2 px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-xs font-medium"
              >
                <Edit2 size={14} />
                記事を編集
              </button>

              {/* 削除ボタン */}
              <button
                type="button"
                onClick={(e) => onDeleteClick(article, e)}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-400 text-white rounded-lg hover:bg-slate-500 transition-colors text-xs font-medium"
                title="削除"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const ArticleList: React.FC<ArticleListProps> = ({
  articles,
  categories,
  onSave,
  onArticleUpdate,
  onArticlesReorder,
  onArticleDelete,
  enableDragAndDrop = false,
}) => {
  // 優先度がhighまたはmediumの記事は初期展開
  const [expandedArticles, setExpandedArticles] = useState<Set<string>>(
    new Set(articles.filter((a) => a.priority !== 'low').map((a) => a.id))
  );

  const [viewLevel, setViewLevel] = useState<ViewLevel>('summary');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('priority');

  // 編集ダイアログの状態
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);

  // ドラッグ&ドロップのセンサー設定
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // 並び替え中かどうかの状態
  const [isSavingOrder, setIsSavingOrder] = useState(false);

  /**
   * 記事の展開/折りたたみをトグル
   */
  const toggleExpand = (articleId: string) => {
    setExpandedArticles((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(articleId)) {
        newSet.delete(articleId);
      } else {
        newSet.add(articleId);
      }
      return newSet;
    });
  };

  /**
   * カテゴリでフィルタリングし、ソートされた記事を取得
   */
  const sortArticles = (articles: Article[]): Article[] => {
    const filtered = selectedCategory
      ? articles.filter(a => a.category === selectedCategory)
      : articles;

    switch (sortBy) {
      case 'priority':
        return [...filtered].sort((a, b) => {
          // まず article_type で分ける（official が先、local-info が後）
          const articleTypeOrder = { official: 0, 'local-info': 1 };
          const typeOrderA = articleTypeOrder[a.article_type];
          const typeOrderB = articleTypeOrder[b.article_type];

          if (typeOrderA !== typeOrderB) {
            return typeOrderA - typeOrderB;
          }

          // 同じ article_type 内では priority でソート
          const priorityOrder = { high: 0, medium: 1, low: 2 };
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        });
      case 'category':
        // まず article_type で分ける、次にカテゴリ順
        return [...filtered].sort((a, b) => {
          // article_type で分ける
          const articleTypeOrder = { official: 0, 'local-info': 1 };
          const typeOrderA = articleTypeOrder[a.article_type];
          const typeOrderB = articleTypeOrder[b.article_type];

          if (typeOrderA !== typeOrderB) {
            return typeOrderA - typeOrderB;
          }

          // 同じ article_type 内ではカテゴリでソート
          const categoryOrder: Record<string, number> = {
            'event': 0,
            'notice': 1,
            'meeting': 2,
            'culture': 3,
            'report': 4,
            'local-info': 5,
          };
          const orderA = categoryOrder[a.category] ?? 99;
          const orderB = categoryOrder[b.category] ?? 99;
          return orderA - orderB;
        });
      case 'source':
        return [...filtered].sort((a, b) => a.source.localeCompare(b.source));
      case 'date':
        return [...filtered].sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      default:
        return filtered;
    }
  };

  const filteredArticles = sortArticles(articles);

  /**
   * 記事の内容を表示レベルに応じて取得
   */
  const getArticleContent = (article: Article): string => {
    switch (viewLevel) {
      case 'headline':
        return article.headline;
      case 'brief':
        return article.brief;
      case 'summary':
        return article.summary;
      case 'content':
        return article.content;
    }
  };

  /**
   * カテゴリ情報を取得
   */
  const getCategoryInfo = (categoryId: string) => {
    return categories.find((c) => c.id === categoryId);
  };

  /**
   * 編集ボタンクリック時の処理
   */
  const handleEditClick = (article: Article, event: React.MouseEvent) => {
    event.stopPropagation(); // 記事の展開/折りたたみを防ぐ
    setEditingArticle(article);
    setShowEditDialog(true);
  };

  /**
   * 削除ボタンクリック時の処理
   */
  const handleDeleteClick = async (article: Article, event: React.MouseEvent) => {
    event.stopPropagation(); // 記事の展開/折りたたみを防ぐ

    if (!confirm(`「${article.title}」を削除しますか？\n\nこの操作は取り消せません。`)) {
      return;
    }

    if (onArticleDelete) {
      try {
        console.log('🗑️ 削除処理を開始:', article.id);
        await onArticleDelete(article.id);
        console.log('✅ 削除処理が完了しました');
      } catch (error) {
        console.error('❌ 削除処理でエラーが発生しました:', error);
        alert('削除に失敗しました。コンソールでエラーを確認してください。');
      }
    } else {
      console.warn('⚠️ onArticleDeleteが設定されていません');
      alert('削除機能が利用できません');
    }
  };

  /**
   * 記事保存処理
   */
  const handleArticleSave = async (articleId: string, updates: Partial<Article>) => {
    try {
      // Supabaseに保存
      await updateArticle(articleId, updates);

      if (onArticleUpdate) {
        // 親コンポーネントに更新を通知（ローカル状態用）
        onArticleUpdate(articleId, updates);
      }

      alert('記事を更新しました');
    } catch (error) {
      console.error('記事更新エラー:', error);
      throw error;
    }
  };

  /**
   * 編集ダイアログを閉じる
   */
  const handleEditCancel = () => {
    setShowEditDialog(false);
    setEditingArticle(null);
  };

  /**
   * ドラッグ終了時の処理
   */
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = filteredArticles.findIndex((a) => a.id === active.id);
    const newIndex = filteredArticles.findIndex((a) => a.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    // 配列を並び替え
    const newArticles = arrayMove(filteredArticles, oldIndex, newIndex);

    // 親コンポーネントに通知（ローカル状態用）
    if (onArticlesReorder) {
      onArticlesReorder(newArticles);
    }

    // Supabaseに保存
    try {
      setIsSavingOrder(true);
      const updates = newArticles.map((article, index) => ({
        articleId: article.id,
        displayOrder: index,
      }));
      await updateArticleOrders(updates);
      console.log('✅ 記事の並び順を保存しました');
    } catch (error) {
      console.error('❌ 並び順保存エラー:', error);
      alert('並び順の保存に失敗しました');
    } finally {
      setIsSavingOrder(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* コントロールバー */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="flex flex-wrap gap-4 items-center">
          {/* カテゴリフィルター */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-600">カテゴリ:</span>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  selectedCategory === null
                    ? 'bg-primary-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                すべて ({articles.length})
              </button>
              {categories.map((category) => {
                const count = articles.filter((a) => a.category === category.id).length;
                return (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategory(category.id)}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                      selectedCategory === category.id
                        ? getCategoryColor(category.color)
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {category.icon} {category.label} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* ソート選択 */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-600">並び順:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="priority">優先度順</option>
              <option value="category">カテゴリ順</option>
              <option value="source">ソース順</option>
              <option value="date">日付順（新しい順）</option>
            </select>
          </div>

          {/* 表示レベル切り替え */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-600">詳細度:</span>
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
              {(['headline', 'brief', 'summary', 'content'] as ViewLevel[]).map((level) => (
                <button
                  key={level}
                  onClick={() => setViewLevel(level)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    viewLevel === level
                      ? 'bg-white text-primary-600 shadow-sm'
                      : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  {level === 'headline' && '見出し'}
                  {level === 'brief' && '簡潔'}
                  {level === 'summary' && '要約'}
                  {level === 'content' && '全文'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 記事一覧 */}
      <div className="space-y-3">
        {filteredArticles.length === 0 ? (
          <div className="bg-white p-8 rounded-xl text-center text-slate-500">
            記事がありません
          </div>
        ) : enableDragAndDrop ? (
          /* ドラッグ&ドロップ有効時 */
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={filteredArticles.map((a) => a.id)}
              strategy={verticalListSortingStrategy}
            >
              {filteredArticles.map((article) => (
                <SortableArticleItem
                  key={article.id}
                  article={article}
                  isExpanded={expandedArticles.has(article.id)}
                  categoryInfo={getCategoryInfo(article.category)}
                  visibilityStyle={getVisibilityStyle(article.visibility)}
                  viewLevel={viewLevel}
                  onToggleExpand={() => toggleExpand(article.id)}
                  onEditClick={handleEditClick}
                  onDeleteClick={handleDeleteClick}
                  getArticleContent={getArticleContent}
                />
              ))}
            </SortableContext>
          </DndContext>
        ) : (
          /* ドラッグ&ドロップ無効時 */
          filteredArticles.map((article) => {
            const isExpanded = expandedArticles.has(article.id);
            const categoryInfo = getCategoryInfo(article.category);
            const visibilityStyle = getVisibilityStyle(article.visibility);
            const VisibilityIcon = visibilityStyle.icon;

            return (
              <div
                key={article.id}
                className={`rounded-xl shadow-sm border-2 transition-all ${getPriorityColor(
                  article.priority,
                  article.category
                )}`}
              >
                {/* ヘッダー */}
                <div
                  className="p-4 cursor-pointer hover:bg-white/50 transition-colors"
                  onClick={() => toggleExpand(article.id)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        {/* ピン留めバッジ */}
                        {article.is_pinned && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-100 text-primary-700 rounded-md text-xs font-bold">
                            <Pin size={12} />
                            ピン留め
                          </span>
                        )}

                        {/* 優先度バッジ */}
                        <span
                          className={`px-2 py-0.5 rounded-md text-xs font-bold ${getPriorityBadgeColor(
                            article.priority
                          )}`}
                        >
                          {getPriorityLabel(article.priority)}
                        </span>

                        {/* カテゴリバッジ（地域のお知らせの場合は表示しない） */}
                        {categoryInfo && article.category !== 'local-info' && (
                          <span
                            className={`px-2 py-0.5 rounded-md text-xs font-bold ${getCategoryColor(
                              categoryInfo.color
                            )}`}
                          >
                            {categoryInfo.icon} {categoryInfo.label}
                          </span>
                        )}

                        {/* 締切日 */}
                        {article.deadline && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-100 text-rose-700 rounded-md text-xs font-bold">
                            <Calendar size={12} />
                            締切: {article.deadline}
                          </span>
                        )}

                        {/* 公開範囲 */}
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 rounded-md text-xs ${visibilityStyle.color}`}
                        >
                          <VisibilityIcon size={12} />
                          {visibilityStyle.label}
                        </span>

                        {/* ソース表示 */}
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-100 text-primary-700 rounded-md text-xs font-medium">
                          <FileText size={12} />
                          {article.source}
                        </span>
                      </div>

                      {/* タイトル */}
                      <h3 className="text-lg font-bold text-slate-800 mb-1">{article.title}</h3>

                      {/* 要約（折りたたみ時） */}
                      {!isExpanded && (
                        <p className="text-sm text-slate-600">{getArticleContent(article)}</p>
                      )}
                    </div>

                    {/* 展開/折りたたみアイコン */}
                    <button className="text-slate-400 hover:text-slate-600 transition-colors">
                      {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </button>
                  </div>
                </div>

      {/* 展開時の詳細 */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-slate-200/50 pt-4 space-y-3">
          {/* 本文 */}
          <div className="bg-white p-4 rounded-lg">
            <div className="prose-compact max-w-none text-slate-700">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                {getArticleContent(article)}
              </ReactMarkdown>
            </div>
          </div>

                    {/* PDF添付ファイル */}
                    {article.attachments && article.attachments.length > 0 && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <p className="text-sm font-medium text-blue-900 mb-2 flex items-center gap-2">
                          <FileText size={16} />
                          添付ファイルリンク
                        </p>
                        <div className="space-y-2">
                          {article.attachments.map((attachment: any, index: number) => (
                            <a
                              key={index}
                              href={attachment.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-between p-3 bg-white rounded-lg hover:bg-blue-50 transition-colors group"
                            >
                              <div className="flex items-center gap-3">
                                <FileText size={18} className="text-blue-600" />
                                <div>
                                  <p className="text-sm font-medium text-slate-800">
                                    {attachment.label || attachment.filename || 'ファイル'}
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    {attachment.type === 'image' && '画像ファイル'}
                                    {attachment.type === 'pdf' && 'PDFファイル'}
                                    {attachment.type === 'link' && 'リンク'}
                                    {!['image', 'pdf', 'link'].includes(attachment.type) && 'ファイル'}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-blue-600 group-hover:text-blue-700">
                                <ExternalLink size={16} />
                                <span className="text-sm font-medium">開く</span>
                              </div>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* タグ */}
                    {article.tags.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <Tag size={14} className="text-slate-400" />
                        {article.tags.map((tag, index) => (
                          <span
                            key={index}
                            className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-xs"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* メタ情報とボタン */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <span>出典: {article.source}</span>
                        <span>作成: {new Date(article.created_at).toLocaleDateString('ja-JP')}</span>
                      </div>

                      {/* ボタングループ（右下） */}
                      <div className="flex items-center gap-2">
                        {/* 編集ボタン */}
                        <button
                          type="button"
                          onClick={(e) => handleEditClick(article, e)}
                          className="flex items-center gap-2 px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-xs font-medium"
                        >
                          <Edit2 size={14} />
                          記事を編集
                        </button>

                        {/* 削除ボタン */}
                        <button
                          type="button"
                          onClick={(e) => handleDeleteClick(article, e)}
                          className="flex items-center gap-2 px-3 py-1.5 bg-slate-400 text-white rounded-lg hover:bg-slate-500 transition-colors text-xs font-medium"
                          title="削除"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 並び替え保存中のインジケーター */}
      {isSavingOrder && (
        <div className="fixed bottom-4 right-4 bg-primary-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
          並び順を保存中...
        </div>
      )}

      {/* 保存ボタン */}
      {onSave && filteredArticles.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={() => onSave(articles)}
            className="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium shadow-sm transition-colors"
          >
            記事を保存
          </button>
        </div>
      )}

      {/* 編集ダイアログ */}
      <ArticleEditDialog
        isOpen={showEditDialog}
        article={editingArticle}
        categories={categories}
        onSave={handleArticleSave}
        onCancel={handleEditCancel}
      />
    </div>
  );
};
