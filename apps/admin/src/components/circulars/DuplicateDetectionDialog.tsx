/**
 * 重複記事検出ダイアログコンポーネント
 * 
 * 新しく追加される記事と既存の記事を比較し、重複の可能性がある記事を
 * ユーザーに通知するダイアログです。
 */

import React, { useState } from 'react';
import { DuplicatePair } from '@cc-saas/shared';
import { AlertCircle, CheckCircle, X, ArrowRight } from 'lucide-react';

/**
 * 重複記事の処理アクション
 */
export type DuplicateAction = 'keep-both' | 'keep-new' | 'keep-existing';

/**
 * DuplicateDetectionDialogコンポーネントのProps
 */
interface DuplicateDetectionDialogProps {
  /** ダイアログの表示状態 */
  isOpen: boolean;
  /** 検出された重複記事ペアの配列 */
  duplicates: DuplicatePair[];
  /** ユーザーが選択を確定した時のコールバック */
  onConfirm: (action: DuplicateAction, selectedPairs: DuplicatePair[]) => void;
  /** キャンセル時のコールバック */
  onCancel: () => void;
}

/**
 * DuplicateDetectionDialogコンポーネント
 * 
 * 重複記事の一覧を表示し、ユーザーに処理方法を選択させます。
 */
export const DuplicateDetectionDialog: React.FC<DuplicateDetectionDialogProps> = ({
  isOpen,
  duplicates,
  onConfirm,
  onCancel,
}) => {
  const [selectedAction, setSelectedAction] = useState<DuplicateAction>('keep-both');
  const [selectedPairs, setSelectedPairs] = useState<Set<number>>(
    new Set(duplicates.map((_, index) => index))
  );

  /**
   * ペアの選択/選択解除をトグル
   */
  const togglePairSelection = (index: number) => {
    setSelectedPairs((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  /**
   * 全選択/全解除をトグル
   */
  const toggleAllSelection = () => {
    if (selectedPairs.size === duplicates.length) {
      setSelectedPairs(new Set());
    } else {
      setSelectedPairs(new Set(duplicates.map((_, index) => index)));
    }
  };

  /**
   * 確定処理
   */
  const handleConfirm = () => {
    const selectedDuplicates = duplicates.filter((_, index) =>
      selectedPairs.has(index)
    );
    onConfirm(selectedAction, selectedDuplicates);
  };

  /**
   * 類似度をパーセンテージで表示
   */
  const formatSimilarity = (similarity: number): string => {
    return `${(similarity * 100).toFixed(1)}%`;
  };

  /**
   * 類似度に応じた色クラスを取得
   */
  const getSimilarityColor = (similarity: number): string => {
    if (similarity >= 0.9) return 'text-red-600 bg-red-50';
    if (similarity >= 0.8) return 'text-orange-600 bg-orange-50';
    return 'text-yellow-600 bg-yellow-50';
  };

  // ダイアログが閉じている場合は何も表示しない
  if (!isOpen || duplicates.length === 0) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 bg-orange-50">
          <div className="flex items-center gap-3">
            <AlertCircle size={28} className="text-orange-600" />
            <div>
              <h2 className="text-2xl font-bold text-slate-800">重複の可能性がある記事を検出</h2>
              <p className="text-sm text-slate-600 mt-1">
                {duplicates.length}件の重複が見つかりました。処理方法を選択してください。
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* アクション選択 */}
        <div className="p-6 border-b border-slate-200 bg-slate-50">
          <h3 className="font-bold text-slate-800 mb-3">処理方法を選択</h3>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setSelectedAction('keep-both')}
              className={`p-4 border-2 rounded-xl text-left transition-all ${
                selectedAction === 'keep-both'
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle
                  size={20}
                  className={selectedAction === 'keep-both' ? 'text-primary-600' : 'text-slate-400'}
                />
                <span className="font-bold text-slate-800">両方残す</span>
              </div>
              <p className="text-sm text-slate-600">
                新旧両方の記事を保持します（重複を許容）
              </p>
            </button>

            <button
              onClick={() => setSelectedAction('keep-new')}
              className={`p-4 border-2 rounded-xl text-left transition-all ${
                selectedAction === 'keep-new'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle
                  size={20}
                  className={selectedAction === 'keep-new' ? 'text-blue-600' : 'text-slate-400'}
                />
                <span className="font-bold text-slate-800">新しいものを優先</span>
              </div>
              <p className="text-sm text-slate-600">
                新しい記事を残し、既存の記事を削除します
              </p>
            </button>

            <button
              onClick={() => setSelectedAction('keep-existing')}
              className={`p-4 border-2 rounded-xl text-left transition-all ${
                selectedAction === 'keep-existing'
                  ? 'border-green-500 bg-green-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle
                  size={20}
                  className={selectedAction === 'keep-existing' ? 'text-green-600' : 'text-slate-400'}
                />
                <span className="font-bold text-slate-800">既存を優先</span>
              </div>
              <p className="text-sm text-slate-600">
                既存の記事を残し、新しい記事を追加しません
              </p>
            </button>
          </div>
        </div>

        {/* 重複ペア一覧 */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800">重複記事の詳細</h3>
            <button
              onClick={toggleAllSelection}
              className="text-sm text-primary-600 hover:text-primary-800 font-medium"
            >
              {selectedPairs.size === duplicates.length ? '全て解除' : '全て選択'}
            </button>
          </div>

          <div className="space-y-4">
            {duplicates.map((pair, index) => (
              <div
                key={index}
                className={`border-2 rounded-xl p-4 transition-all ${
                  selectedPairs.has(index)
                    ? 'border-primary-300 bg-primary-50'
                    : 'border-slate-200 bg-white'
                }`}
              >
                {/* チェックボックスと類似度 */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedPairs.has(index)}
                      onChange={() => togglePairSelection(index)}
                      className="w-5 h-5 text-primary-600 border-slate-300 rounded focus:ring-primary-500"
                    />
                    <span className="font-bold text-slate-800">重複 #{index + 1}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`px-3 py-1 rounded-full text-sm font-bold ${getSimilarityColor(pair.overallSimilarity)}`}>
                      総合類似度: {formatSimilarity(pair.overallSimilarity)}
                    </div>
                  </div>
                </div>

                {/* 記事の比較 */}
                <div className="grid grid-cols-2 gap-4">
                  {/* 既存の記事 */}
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-bold text-slate-500 uppercase">既存の記事</span>
                      <span className="text-xs text-slate-400">({pair.existingArticle.source})</span>
                    </div>
                    <h4 className="font-bold text-slate-800 mb-2">{pair.existingArticle.title}</h4>
                    <p className="text-sm text-slate-600">{pair.existingArticle.brief}</p>
                    <div className="mt-2 text-xs text-slate-500">
                      タイトル類似度: {formatSimilarity(pair.titleSimilarity)}
                    </div>
                  </div>

                  {/* 矢印 */}
                  <div className="flex items-center justify-center">
                    <ArrowRight size={24} className="text-slate-300" />
                  </div>

                  {/* 新しい記事 */}
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-bold text-blue-600 uppercase">新しい記事</span>
                      <span className="text-xs text-blue-400">({pair.newArticle.source})</span>
                    </div>
                    <h4 className="font-bold text-slate-800 mb-2">{pair.newArticle.title}</h4>
                    <p className="text-sm text-slate-600">{pair.newArticle.brief}</p>
                    <div className="mt-2 text-xs text-blue-600">
                      内容類似度: {formatSimilarity(pair.contentSimilarity)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* フッター */}
        <div className="flex items-center justify-between p-6 border-t border-slate-200 bg-slate-50">
          <div className="text-sm text-slate-600">
            {selectedPairs.size}件の重複が選択されています
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onCancel}
              className="px-6 py-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
            >
              キャンセル
            </button>
            <button
              onClick={handleConfirm}
              disabled={selectedPairs.size === 0}
              className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <CheckCircle size={18} />
              確定する
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
