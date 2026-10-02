/**
 * AIプロキシクライアント
 *
 * 本番環境（ブラウザ）でAI APIを呼び出すためのクライアントです。
 * APIキーをクライアントバンドルに含めず、Supabase Edge Function（ai-proxy）
 * 経由でAIプロバイダーへリクエストを転送します。
 *
 * @module services/ai/aiProxyClient
 */

import { getSupabaseClient } from '../supabaseClient.js';

/**
 * アプリトークンを保存するlocalStorageのキー
 * （AuthContext の app-login 成功時に保存される）
 */
export const AUTH_TOKEN_STORAGE_KEY = 'cc-saas-auth-token';

/**
 * 保存済みのアプリトークンを取得する
 */
export function getStoredAppToken(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
}

/** トークンが使えなくなったときに画面に出す文言 */
export const RELOGIN_MESSAGE =
  'ログインし直しが必要です。ログイン画面に戻りますので、もう一度パスワードを入れてください。';

/**
 * AI・LINE 用のトークンが拒否されたときの後始末。
 * 保存済みトークンを捨て、Supabase のログインも解除してログイン画面に戻す。
 * （以前は「再読み込みして」と案内していたが、Supabase のログインが残るため
 *   再読み込みしてもログイン画面が出ず、ログアウトを知らないと抜け出せなかった）
 */
export function requireRelogin(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  }
  void getSupabaseClient()?.auth.signOut();
}

/**
 * AIプロキシが利用可能かどうか（Supabaseが設定されているか）
 */
export function isAIProxyAvailable(): boolean {
  return getSupabaseClient() !== null;
}

/**
 * AIプロキシ経由でAIプロバイダーを呼び出す
 *
 * @param provider - 'anthropic' | 'openrouter' | 'gemini'
 * @param body - プロバイダーAPIへそのまま転送するリクエストボディ
 * @param path - gemini の場合のAPIパス（例: 'models/gemini-2.5-flash:generateContent'）
 * @returns プロバイダーAPIのレスポンスJSON
 */
export async function invokeAIProxy<T = unknown>(
  provider: 'anthropic' | 'openrouter' | 'gemini',
  body: unknown,
  path?: string
): Promise<T> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabaseが未設定のため、AI機能を利用できません');
  }

  const { data, error } = await supabase.functions.invoke('ai-proxy', {
    body: { provider, body, path },
    headers: { 'x-app-token': getStoredAppToken() ?? '' },
  });

  if (error) {
    // 上流のエラーメッセージを可能な限り取り出す
    let detail = error.message ?? String(error);
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === 'function') {
      try {
        const errBody = await context.json();
        detail = errBody?.error?.message ?? errBody?.error ?? detail;
        if (typeof detail !== 'string') detail = JSON.stringify(detail);
      } catch {
        // JSONでない場合はそのまま
      }
    }

    // トークンが無効（別環境の古いトークンが残っている等）: ログイン画面に戻す。
    // 放置すると全AI機能が失敗し続けるため。
    if (context?.status === 401 || detail === 'Unauthorized') {
      requireRelogin();
      throw new Error(RELOGIN_MESSAGE);
    }

    throw new Error(`AI呼び出しに失敗しました: ${detail}`);
  }

  return data as T;
}
