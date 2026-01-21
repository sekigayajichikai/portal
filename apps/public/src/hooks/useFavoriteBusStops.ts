/**
 * お気に入りバス停管理フック
 * 
 * localStorageを使用してお気に入りバス停を永続化します。
 * 最大5つまで登録可能です。
 */

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'favoriteBusStops';
const MAX_FAVORITES = 5;

/**
 * お気に入りバス停を管理するフック
 * 
 * @returns お気に入りバス停の状態と操作関数
 */
export function useFavoriteBusStops() {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // localStorageから読み込み
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setFavorites(parsed);
        }
      }
    } catch (error) {
      console.error('お気に入りバス停の読み込みに失敗しました:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * お気に入りに追加
   * 
   * @param stopName - バス停名
   * @returns 追加成功の場合true、失敗の場合false
   */
  const addFavorite = (stopName: string): boolean => {
    // 最大数チェック
    if (favorites.length >= MAX_FAVORITES) {
      console.warn(`お気に入りは最大${MAX_FAVORITES}つまでです`);
      return false;
    }

    // 重複チェック
    if (favorites.includes(stopName)) {
      console.warn('このバス停は既にお気に入りに追加されています');
      return false;
    }

    try {
      const newFavorites = [...favorites, stopName];
      setFavorites(newFavorites);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newFavorites));
      return true;
    } catch (error) {
      console.error('お気に入りの追加に失敗しました:', error);
      return false;
    }
  };

  /**
   * お気に入りから削除
   * 
   * @param stopName - バス停名
   */
  const removeFavorite = (stopName: string): void => {
    try {
      const newFavorites = favorites.filter((s) => s !== stopName);
      setFavorites(newFavorites);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newFavorites));
    } catch (error) {
      console.error('お気に入りの削除に失敗しました:', error);
    }
  };

  /**
   * お気に入りかどうかを確認
   * 
   * @param stopName - バス停名
   * @returns お気に入りの場合true
   */
  const isFavorite = (stopName: string): boolean => {
    return favorites.includes(stopName);
  };

  /**
   * お気に入りがいっぱいかどうかを確認
   * 
   * @returns 最大数に達している場合true
   */
  const isFull = (): boolean => {
    return favorites.length >= MAX_FAVORITES;
  };

  return {
    favorites,
    isLoading,
    addFavorite,
    removeFavorite,
    isFavorite,
    isFull,
    maxFavorites: MAX_FAVORITES,
  };
}
