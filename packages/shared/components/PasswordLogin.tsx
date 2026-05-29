/**
 * パスワードログインコンポーネント
 *
 * シンプルなパスワード入力フォームを提供します。
 * 入力されたパスワードをAuthContextのlogin関数で検証します。
 *
 * @module components/PasswordLogin
 */

import React, { useState, FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext.js';

/**
 * パスワードログインコンポーネント
 *
 * ユーザーにパスワードを入力させ、認証を行います。
 * 認証に成功すると、自動的にメインアプリが表示されます。
 *
 * @returns {JSX.Element} パスワードログインフォーム
 */
export const PasswordLogin: React.FC = () => {
  const { login } = useAuth();
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  /**
   * フォーム送信ハンドラー
   *
   * パスワードを検証し、ログイン処理を実行します。
   *
   * @param {FormEvent<HTMLFormElement>} e - フォームイベント
   */
  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // パスワードが空の場合
    if (!password.trim()) {
      setError('パスワードを入力してください');
      setIsLoading(false);
      return;
    }

    // ログイン処理
    const success = login(password);

    if (!success) {
      setError('パスワードが正しくありません');
      setPassword(''); // パスワードをクリア
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-md">
        {/* ヘッダー */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">CC-SaaS</h1>
          <p className="text-gray-600">自治会向け多機能Webアプリ</p>
        </div>

        {/* ログインフォーム */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              パスワード
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="パスワードを入力"
              disabled={isLoading}
              autoFocus
            />
          </div>

          {/* エラーメッセージ */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
              {error}
            </div>
          )}

          {/* ログインボタン */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-md font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>

        {/* フッター */}
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>URLを知っている方のみアクセスできます</p>
        </div>
      </div>
    </div>
  );
};
