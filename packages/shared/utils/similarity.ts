/**
 * テキスト類似度計算ユーティリティ
 * 
 * レーベンシュタイン距離を使用して、2つのテキスト間の類似度を計算します。
 * 重複記事の検出に使用されます。
 * 
 * @module utils/similarity
 */

import { Article } from '../types/index.js';

/**
 * レーベンシュタイン距離を計算
 * 
 * 2つの文字列間の編集距離（挿入、削除、置換の最小操作回数）を計算します。
 * 
 * @param str1 - 比較する文字列1
 * @param str2 - 比較する文字列2
 * @returns 編集距離（整数）
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  
  // 動的計画法用の2次元配列
  const dp: number[][] = Array(len1 + 1)
    .fill(null)
    .map(() => Array(len2 + 1).fill(0));
  
  // 初期化：片方が空文字列の場合の距離
  for (let i = 0; i <= len1; i++) {
    dp[i][0] = i;
  }
  for (let j = 0; j <= len2; j++) {
    dp[0][j] = j;
  }
  
  // 動的計画法で距離を計算
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        // 文字が一致する場合、編集不要
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        // 文字が異なる場合、挿入/削除/置換の最小値+1
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,     // 削除
          dp[i][j - 1] + 1,     // 挿入
          dp[i - 1][j - 1] + 1  // 置換
        );
      }
    }
  }
  
  return dp[len1][len2];
}

/**
 * 2つのテキスト間の類似度を計算
 * 
 * レーベンシュタイン距離を正規化して、0.0（完全に異なる）から1.0（完全に一致）の
 * スコアに変換します。
 * 
 * @param text1 - 比較するテキスト1
 * @param text2 - 比較するテキスト2
 * @returns 類似度スコア（0.0〜1.0）
 * 
 * @example
 * ```typescript
 * calculateSimilarity("hello", "hello") // 1.0（完全一致）
 * calculateSimilarity("hello", "hallo") // 0.8（1文字違い）
 * calculateSimilarity("hello", "world") // 0.2（ほぼ異なる）
 * ```
 */
export function calculateSimilarity(text1: string, text2: string): number {
  // 空文字列の処理
  if (text1.length === 0 && text2.length === 0) return 1.0;
  if (text1.length === 0 || text2.length === 0) return 0.0;
  
  // 正規化：小文字に変換し、前後の空白を削除
  const normalized1 = text1.trim().toLowerCase();
  const normalized2 = text2.trim().toLowerCase();
  
  // レーベンシュタイン距離を計算
  const distance = levenshteinDistance(normalized1, normalized2);
  
  // 最大文字列長で正規化して類似度スコアに変換
  const maxLength = Math.max(normalized1.length, normalized2.length);
  const similarity = 1 - distance / maxLength;
  
  // 0.0〜1.0の範囲に収める
  return Math.max(0, Math.min(1, similarity));
}

/**
 * 重複記事のペア情報
 */
export interface DuplicatePair {
  /** 新しい記事 */
  newArticle: Article;
  /** 既存の記事 */
  existingArticle: Article;
  /** タイトルの類似度（0.0〜1.0） */
  titleSimilarity: number;
  /** 内容の類似度（0.0〜1.0） */
  contentSimilarity: number;
  /** 総合類似度（0.0〜1.0） */
  overallSimilarity: number;
}

/**
 * 重複記事を検出
 * 
 * 新しく追加される記事と既存の記事を比較し、類似度の高いペアを検出します。
 * タイトルと内容（brief）の両方を比較し、総合的な類似度を計算します。
 * 
 * @param newArticles - 新しく追加される記事の配列
 * @param existingArticles - 既存の記事の配列
 * @param threshold - 重複と判定する類似度の閾値（デフォルト: 0.8）
 * @returns 重複と判定された記事ペアの配列
 * 
 * @example
 * ```typescript
 * const duplicates = findDuplicateArticles(
 *   [newArticle1, newArticle2],
 *   [existingArticle1, existingArticle2, existingArticle3],
 *   0.8
 * );
 * 
 * if (duplicates.length > 0) {
 *   console.log(`${duplicates.length}件の重複が検出されました`);
 *   duplicates.forEach(pair => {
 *     console.log(`類似度: ${(pair.overallSimilarity * 100).toFixed(1)}%`);
 *   });
 * }
 * ```
 */
export function findDuplicateArticles(
  newArticles: Article[],
  existingArticles: Article[],
  threshold: number = 0.8
): DuplicatePair[] {
  const duplicates: DuplicatePair[] = [];
  
  // 各新規記事について、既存記事との類似度をチェック
  for (const newArticle of newArticles) {
    for (const existingArticle of existingArticles) {
      // タイトルの類似度を計算
      const titleSimilarity = calculateSimilarity(
        newArticle.title,
        existingArticle.title
      );
      
      // 内容（brief）の類似度を計算
      const contentSimilarity = calculateSimilarity(
        newArticle.brief,
        existingArticle.brief
      );
      
      // 総合類似度：タイトル70%、内容30%の重み付け
      const overallSimilarity = titleSimilarity * 0.7 + contentSimilarity * 0.3;
      
      // 閾値を超えた場合、重複と判定
      if (overallSimilarity >= threshold) {
        duplicates.push({
          newArticle,
          existingArticle,
          titleSimilarity,
          contentSimilarity,
          overallSimilarity,
        });
      }
    }
  }
  
  // 類似度の高い順にソート
  duplicates.sort((a, b) => b.overallSimilarity - a.overallSimilarity);
  
  return duplicates;
}

/**
 * 重複記事をフィルタリング
 * 
 * ユーザーの選択に基づいて、重複記事を除外します。
 * 
 * @param articles - フィルタリング対象の記事配列
 * @param duplicatePairs - 重複と判定されたペアの配列
 * @param keepNew - true: 新しい記事を残す、false: 既存の記事を残す
 * @returns フィルタリング後の記事配列
 */
export function filterDuplicateArticles(
  articles: Article[],
  duplicatePairs: DuplicatePair[],
  keepNew: boolean
): Article[] {
  // 除外する記事のIDセット
  const excludeIds = new Set<string>();
  
  duplicatePairs.forEach((pair) => {
    if (keepNew) {
      // 既存の記事を除外（新しい記事を優先）
      excludeIds.add(pair.existingArticle.id);
    } else {
      // 新しい記事を除外（既存の記事を優先）
      excludeIds.add(pair.newArticle.id);
    }
  });
  
  // 除外IDに含まれない記事のみを返す
  return articles.filter((article) => !excludeIds.has(article.id));
}
