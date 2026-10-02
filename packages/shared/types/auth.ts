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
  login: (password: string) => Promise<LoginResult>;
  logout: () => void;
  isLoading: boolean;
  /**
   * AI・LINE 機能用のトークンを持っているか。
   * false のときはログインはできているが、AI読み取りや LINE 配信だけが使えない。
   */
  aiReady: boolean;
}

/**
 * ログインの結果。失敗したときは理由で画面の案内を変える
 * - wrong-password: パスワード違い
 * - network: 通信できなかった
 * - server: サーバー側の設定や障害（入力した人のせいではない）
 */
export interface LoginResult {
  ok: boolean;
  /** 失敗したときだけ入る */
  reason?: 'wrong-password' | 'network' | 'server';
}
