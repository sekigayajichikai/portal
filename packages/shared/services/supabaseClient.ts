/**
 * Supabase クライアント
 *
 * データベース操作のための共通クライアントを提供します。
 *
 * @module services/supabaseClient
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabaseクライアントインスタンス
 * 環境変数が設定されていない場合はnullを返します
 */
let supabaseInstance: SupabaseClient | null = null;

/**
 * Supabaseクライアントを取得
 *
 * 環境変数からURL and APIキーを読み取り、クライアントを初期化します。
 * 環境変数が設定されていない場合は、null を返します。
 *
 * @returns Supabaseクライアントインスタンスまたはnull
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  // Viteの環境変数または通常の環境変数から取得
  const supabaseUrl =
    (typeof process !== 'undefined' && process.env?.SUPABASE_URL) ||
    (import.meta as any).env?.VITE_SUPABASE_URL ||
    (import.meta as any).env?.SUPABASE_URL;

  const supabaseKey =
    (typeof process !== 'undefined' && process.env?.SUPABASE_ANON_KEY) ||
    (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ||
    (import.meta as any).env?.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn('Supabase設定が見つかりません。データベース機能は無効化されています。');
    return null;
  }

  supabaseInstance = createClient(supabaseUrl, supabaseKey);
  return supabaseInstance;
}

/**
 * 後方互換性のためのデフォルトエクスポート
 */
export const supabase = getSupabaseClient();
