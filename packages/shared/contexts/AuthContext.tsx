/**
 * 認証コンテキスト
 *
 * アプリケーション全体で認証状態を管理するためのReact Contextを提供します。
 *
 * 認証方式（2026-10-02 に Supabase Auth へ移行）:
 * - ログインは Supabase Auth。画面はパスワード欄だけのまま使えるよう、
 *   メールアドレスは固定のもの（ADMIN_EMAIL）を裏で組み合わせる。
 * - これにより、データベースへの読み書きが「ログイン済みの人」として届くようになる。
 *   以前は管理画面の操作もすべて公開鍵のまま実行されており、
 *   データベース側では管理者か住民かを見分けられなかった。
 * - Edge Function（ai-proxy / line-broadcast / line-richmenu）は、まだ
 *   app-login が発行する合言葉のトークンで守られている。再デプロイを避けるため、
 *   ログイン時にそちらのトークンも取っておく。両者のパスワードは同じにしておくこと。
 *   詳細と今後の段取りは docs/セキュリティ-RLS.md。
 *
 * @module contexts/AuthContext
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AuthContextType } from '../types/auth.js';
import { getSupabaseClient } from '../services/supabaseClient.js';
import { AUTH_TOKEN_STORAGE_KEY } from '../services/ai/aiProxyClient.js';

/**
 * 旧方式のlocalStorageキー（移行時の掃除にだけ使う）
 */
const AUTH_STORAGE_KEY = 'cc-saas-auth';

/**
 * 管理者アカウントのメールアドレス。
 * 画面にはメール欄を出さないので、ここで決めたものを使う。
 * 別のアドレスでアカウントを作った場合は VITE_ADMIN_EMAIL で上書きできる。
 */
const ADMIN_EMAIL: string =
  (import.meta as any).env?.VITE_ADMIN_EMAIL || 'sekigaya.dx@gmail.com';

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
   * マウント時に Supabase のログイン状態を復元し、以後の変化も追いかける。
   * ログイン状態は Supabase のクライアントが持っていて、再読み込みしても続く。
   */
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setIsAuthenticated(!!data.session);
        setIsLoading(false);
      })
      .catch(() => {
        if (active) setIsLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => {
      active = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  /**
   * ログイン処理
   *
   * パスワードを Supabase Auth に渡してログインする。
   * あわせて Edge Function 用のトークンも取りに行く（失敗してもログインは成立させる）。
   *
   * @param {string} password - 入力されたパスワード
   * @returns {Promise<boolean>} ログイン成功ならtrue、失敗ならfalse
   */
  const login = async (password: string): Promise<boolean> => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      console.error('Supabaseが未設定のため、ログインできません');
      return false;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: ADMIN_EMAIL,
      password,
    });
    if (error) {
      console.warn('ログインできませんでした:', error.message);
      return false;
    }

    // AI・LINE の機能は、まだ合言葉のトークンで守られている Edge Function を通る。
    // 取れなくてもログイン自体は成立させる（その場合それらの機能だけが使えない）。
    void fetchAppToken(password);
    setIsAuthenticated(true);
    return true;
  };

  /**
   * app-login でパスワードを照合し、アプリトークンを localStorage に保存する。
   * 成功なら true。失敗（パスワード不一致・未設定・通信エラー）なら false
   */
  const fetchAppToken = async (password: string): Promise<boolean> => {
    const supabase = getSupabaseClient();
    if (!supabase) return false;
    try {
      const { data, error } = await supabase.functions.invoke('app-login', {
        body: { password },
      });
      if (error || !data?.token) {
        console.warn('AI・LINE機能用のトークンを取得できませんでした。それらの機能だけ使えない場合があります。');
        return false;
      }
      localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, data.token);
      return true;
    } catch (e) {
      console.error('トークンの取得でエラーが発生しました:', e);
      return false;
    }
  };

  /**
   * ログアウト処理
   *
   * Supabase のログイン状態を解除し、localStorage に残る古い情報も消します。
   */
  const logout = (): void => {
    const supabase = getSupabaseClient();
    void supabase?.auth.signOut();
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
