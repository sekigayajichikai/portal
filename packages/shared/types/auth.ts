/**
 * 認証関連の型定義
 *
 * アプリケーション全体で使用する認証関連の型を定義します。
 *
 * @module types/auth
 */

/**
 * 認証コンテキストの型定義
 *
 * @property {boolean} isAuthenticated - ユーザーがログイン済みかどうか
 * @property {function} login - ログイン処理を実行する関数（パスワードを受け取り、成功/失敗を返す）
 * @property {function} logout - ログアウト処理を実行する関数
 * @property {boolean} isLoading - 認証状態の初期化中かどうか
 */
export interface AuthContextType {
  isAuthenticated: boolean;
  login: (password: string) => boolean;
  logout: () => void;
  isLoading: boolean;
}
