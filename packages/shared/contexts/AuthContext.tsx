/**
 * 認証コンテキスト
 *
 * アプリケーション全体で認証状態を管理するためのReact Contextを提供します。
 * localStorageを使用してログイン状態を永続化します。
 *
 * @module contexts/AuthContext
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AuthContextType } from '../types/auth.js';

/**
 * localStorage に保存する認証状態のキー
 */
const AUTH_STORAGE_KEY = 'cc-saas-auth';

/**
 * 認証コンテキスト
 */
const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * 認証プロバイダーのプロパティ
 *
 * @property {ReactNode} children - 子コンポーネント
 */
interface AuthProviderProps {
  children: ReactNode;
}

/**
 * 認証プロバイダーコンポーネント
 *
 * アプリケーション全体をこのプロバイダーでラップすることで、
 * 認証状態を共有できるようになります。
 *
 * @param {AuthProviderProps} props - プロパティ
 * @returns {JSX.Element} プロバイダーコンポーネント
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  /**
   * コンポーネントマウント時にlocalStorageから認証状態を復元
   */
  useEffect(() => {

    const storedAuth = localStorage.getItem(AUTH_STORAGE_KEY);

    if (storedAuth === 'true') {
      setIsAuthenticated(true);
    }
    setIsLoading(false);
  }, []);

  /**
   * ログイン処理
   *
   * 入力されたパスワードを環境変数と照合し、一致すればログイン状態にします。
   *
   * @param {string} password - 入力されたパスワード
   * @returns {boolean} ログイン成功ならtrue、失敗ならfalse
   */
  const login = (password: string): boolean => {

    // 環境変数からパスワードを取得
    const correctPassword =
      (import.meta as any).env?.VITE_APP_PASSWORD ||
      (typeof process !== 'undefined' && process.env?.VITE_APP_PASSWORD);

    if (!correctPassword) {
      console.error('VITE_APP_PASSWORD が設定されていません');
      return false;
    }

    // パスワードが一致するかチェック
    const isMatch = password === correctPassword;

    if (isMatch) {
      setIsAuthenticated(true);
      localStorage.setItem(AUTH_STORAGE_KEY, 'true');
      return true;
    }

    return false;
  };

  /**
   * ログアウト処理
   *
   * ログイン状態を解除し、localStorageから認証情報を削除します。
   */
  const logout = (): void => {
    setIsAuthenticated(false);
    localStorage.removeItem(AUTH_STORAGE_KEY);
  };

  const value: AuthContextType = {
    isAuthenticated,
    login,
    logout,
    isLoading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/**
 * 認証コンテキストを使用するカスタムフック
 *
 * コンポーネント内で認証状態にアクセスするために使用します。
 *
 * @throws {Error} AuthProvider の外で使用された場合
 * @returns {AuthContextType} 認証コンテキストの値
 *
 * @example
 * ```tsx
 * const { isAuthenticated, login, logout } = useAuth();
 *
 * if (!isAuthenticated) {
 *   return <LoginForm onLogin={login} />;
 * }
 * ```
 */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
