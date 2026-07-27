/**
 * アプリ認証トークンの共通ロジック（Edge Functions用）
 *
 * APP_TOKEN_SECRET を鍵として固定メッセージのHMAC-SHA256を計算し、
 * アプリトークンとして使用します。app-login が発行し、ai-proxy が検証します。
 */

const TOKEN_MESSAGE = 'cc-saas-app-token-v1';

/**
 * アプリトークンを計算する
 *
 * @param secret - APP_TOKEN_SECRET の値
 * @returns HMAC-SHA256 の16進文字列
 */
export async function computeAppToken(secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(TOKEN_MESSAGE));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * CORSヘッダー（supabase-js の functions.invoke からの呼び出しに対応）
 */
export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-app-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * JSONレスポンスを生成する
 */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
