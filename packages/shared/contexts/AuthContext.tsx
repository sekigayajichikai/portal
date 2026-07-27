/**
 * 認証コンテキスト
 *
 * アプリケーション全体で認証状態を管理するためのReact Contextを提供します。
 *
 * 認証方式:
 * - 本番: Supabase Edge Function（app-login）でパスワードをサーバー側照合し、
 *   発行されたアプリトークンをlocalStorageに保存します。
 *   （パスワードはクライアントバンドルに含まれません）
 * - 開発: VITE_APP_PASSWORD が設定されていればローカル照合にフォールバックします。
 *
 * @module contexts/AuthContext
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AuthContextType } from '../types/auth.js';
import { getSupabaseClient } from '../services/supabaseClient.js';
import { AUTH_TOKEN_STORAGE_KEY } from '../services/ai/aiProxyClient.js';

/**
 * 旧方式（開発用フォールバック）のlocalStorageキー
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
 * 開発モードのローカルパスワードを取得（本番ビルドでは常にundefined）
 */
function getDevPassword(): string | undefined {
  const env = (import.meta as any).env;
  if (env?.DEV) {
    return env?.VITE_APP_PASSWORD;
  }
  return undefined;
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
    const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    const legacyAuth = localStorage.getItem(AUTH_STORAGE_KEY);

    if (token) {
      // サーバー発行トークンあり
      setIsAuthenticated(true);
    } else if (legacyAuth === 'true' && getDevPassword()) {
      // 開発モードのローカル認証のみ旧フラグを許可
      setIsAuthenticated(true);
    }
    setIsLoading(false);
  }, []);

  /**
   * ログイン処理
   *
   * 開発モードではローカル照合、本番ではEdge Function（app-login）で
   * サーバー側照合を行い、アプリトークンを保存します。
   *
   * @param {string} password - 入力されたパスワード
   * @returns {Promise<boolean>} ログイン成功ならtrue、失敗ならfalse
   */
  const login = async (password: string): Promise<boolean> => {
    // 開発モード: ローカル照合（本番バンドルにはパスワードは含まれない）
    const devPassword = getDevPassword();
    if (devPassword) {
      if (password === devPassword) {
        setIsAuthenticated(true);
        localStorage.setItem(AUTH_STORAGE_KEY, 'true');
        return true;
      }
      return false;
    }

    // 本番: サーバー側でパスワード照合
    const supabase = getSupabaseClient();
    if (!supabase) {
      console.error('Supabaseが未設定のため、ログインできません');
      return false;
    }

    try {
      const { data, error } = await supabase.functions.invoke('app-login', {
        body: { password },
      });

      if (error || !data?.token) {
        return false;
      }

      localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, data.token);
      setIsAuthenticated(true);
      return true;
    } catch (e) {
      console.error('ログイン処理でエラーが発生しました:', e);
      return false;
    }
  };

  /**
   * ログアウト処理
   *
   * ログイン状態を解除し、localStorageから認証情報を削除します。
   */
  const logout = (): void => {
    setIsAuthenticated(false);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
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
