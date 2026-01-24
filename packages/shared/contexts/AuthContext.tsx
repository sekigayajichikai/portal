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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AuthContext.tsx:useEffect:init',message:'AuthProvider initializing',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
    // #endregion

    const storedAuth = localStorage.getItem(AUTH_STORAGE_KEY);
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AuthContext.tsx:useEffect:localStorage',message:'Checking localStorage',data:{storedAuth:storedAuth,willSetAuthenticated:storedAuth==='true'},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
    // #endregion

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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AuthContext.tsx:login:entry',message:'Login function called',data:{inputPassword:password,inputPasswordLength:password.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
    // #endregion

    // 環境変数からパスワードを取得
    const correctPassword =
      (import.meta as any).env?.VITE_APP_PASSWORD ||
      (typeof process !== 'undefined' && process.env?.VITE_APP_PASSWORD);

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AuthContext.tsx:login:envCheck',message:'Environment variable check',data:{correctPassword:correctPassword,correctPasswordLength:correctPassword?.length,hasCorrectPassword:!!correctPassword,importMetaEnv:(import.meta as any).env,viteAppPasswordDirect:(import.meta as any).env?.VITE_APP_PASSWORD},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
    // #endregion

    if (!correctPassword) {
      console.error('VITE_APP_PASSWORD が設定されていません');
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AuthContext.tsx:login:noPassword',message:'No password configured',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      return false;
    }

    // パスワードが一致するかチェック
    const isMatch = password === correctPassword;
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AuthContext.tsx:login:comparison',message:'Password comparison',data:{inputPassword:password,correctPassword:correctPassword,isMatch:isMatch,inputTrimmed:password.trim(),correctTrimmed:correctPassword.trim(),inputLength:password.length,correctLength:correctPassword.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
    // #endregion

    if (isMatch) {
      setIsAuthenticated(true);
      localStorage.setItem(AUTH_STORAGE_KEY, 'true');
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AuthContext.tsx:login:success',message:'Login successful',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      return true;
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AuthContext.tsx:login:failure',message:'Login failed',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
    // #endregion

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
