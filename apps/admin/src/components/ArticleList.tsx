/**
 * 記事一覧コンポーネント
 * 
 * PDFから抽出された記事を表示し、4段階要約の切り替え、優先度別の色分け、
 * カテゴリフィルターなどの機能を提供します。
 */

import React, { useState } from 'react';
import { Article, Category, Priority } from '@cc-saas/shared';
import { ChevronDown, ChevronUp, Calendar, Tag, Eye, EyeOff, Pin } from 'lucide-react';

interface ArticleListProps {
  articles: Article[];
  categories: Category[];
  onSave?: (articles: Article[]) => void;
}

type ViewLevel = 'headline' | 'brief' | 'summary' | 'content';

/**
 * 優先度に対応する色クラスを取得
 */
const getPriorityColor = (priority: Priority): string => {
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

export const ArticleList: React.FC<ArticleListProps> = ({ articles, categories, onSave }) => {
  // 優先度がhighまたはmediumの記事は初期展開
  const [expandedArticles, setExpandedArticles] = useState<Set<string>>(
    new Set(articles.filter((a) => a.priority !== 'low').map((a) => a.id))
  );
  
  const [viewLevel, setViewLevel] = useState<ViewLevel>('summary');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

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
   * カテゴリでフィルタリングされた記事を取得
   */
  const filteredArticles = selectedCategory
    ? articles.filter((a) => a.category === selectedCategory)
    : articles;

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

  return (
    <div className="space-y-4">
      {/* コントロールバー */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="flex flex-wrap gap-4 items-center justify-between">
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
        ) : (
          filteredArticles.map((article) => {
            const isExpanded = expandedArticles.has(article.id);
            const categoryInfo = getCategoryInfo(article.category);
            const visibilityStyle = getVisibilityStyle(article.visibility);
            const VisibilityIcon = visibilityStyle.icon;

            return (
              <div
                key={article.id}
                className={`rounded-xl shadow-sm border-2 transition-all ${getPriorityColor(
                  article.priority
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

                        {/* カテゴリバッジ */}
                        {categoryInfo && (
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
                      <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">
                        {getArticleContent(article)}
                      </p>
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

                    {/* メタ情報 */}
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span>出典: {article.source}</span>
                      <span>作成: {new Date(article.created_at).toLocaleDateString('ja-JP')}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

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
    </div>
  );
};
