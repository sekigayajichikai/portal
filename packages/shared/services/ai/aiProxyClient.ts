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
    throw new Error(`AI呼び出しに失敗しました: ${detail}`);
  }

  return data as T;
}
