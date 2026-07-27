/**
 * AIプロキシ Edge Function
 *
 * クライアントからのAIリクエストを受け取り、サーバー側で保持するAPIキーを
 * 付与して各AIプロバイダーへ転送します。APIキーをクライアントバンドルに
 * 含めないためのプロキシです。
 *
 * リクエスト形式:
 *   POST { provider: 'anthropic' | 'openrouter' | 'gemini', body: object, path?: string }
 *   ヘッダー: x-app-token (app-login が発行したトークン)
 *
 * 必要なシークレット:
 * - APP_TOKEN_SECRET: トークン検証用（app-login と共通）
 * - ANTHROPIC_API_KEY: Claude API キー
 * - OPENROUTER_API_KEY: OpenRouter API キー（任意）
 * - GEMINI_API_KEY: Gemini API キー（任意、ラジオ生成用）
 */

import { computeAppToken, corsHeaders, jsonResponse } from './appToken.ts';

/** プロバイダーごとの転送先を解決する */
function resolveUpstream(
  provider: string,
  path: string | undefined
): { url: string; headers: Record<string, string> } | { error: string; status: number } {
  switch (provider) {
    case 'anthropic': {
      const key = Deno.env.get('ANTHROPIC_API_KEY');
      if (!key) return { error: 'ANTHROPIC_API_KEY が設定されていません', status: 500 };
      return {
        url: 'https://api.anthropic.com/v1/messages',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
      };
    }
    case 'openrouter': {
      const key = Deno.env.get('OPENROUTER_API_KEY');
      if (!key) return { error: 'OPENROUTER_API_KEY が設定されていません', status: 500 };
      return {
        url: 'https://openrouter.ai/api/v1/chat/completions',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
      };
    }
    case 'gemini': {
      const key = Deno.env.get('GEMINI_API_KEY');
      if (!key) return { error: 'GEMINI_API_KEY が設定されていません', status: 500 };
      // path 例: 'models/gemini-2.5-flash:generateContent'
      if (!path || !/^models\/[\w.-]+:[\w]+$/.test(path)) {
        return { error: 'gemini には有効な path が必要です', status: 400 };
      }
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/${path}?key=${key}`,
        headers: { 'Content-Type': 'application/json' },
      };
    }
    default:
      return { error: `不明なプロバイダー: ${provider}`, status: 400 };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const tokenSecret = Deno.env.get('APP_TOKEN_SECRET');
  if (!tokenSecret) {
    console.error('APP_TOKEN_SECRET が設定されていません');
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }

  // アプリトークンの検証（app-login でパスワード認証済みのクライアントのみ許可）
  const expectedToken = await computeAppToken(tokenSecret);
  const providedToken = req.headers.get('x-app-token') ?? '';
  if (providedToken !== expectedToken) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  let provider = '';
  let body: unknown = null;
  let path: string | undefined;
  try {
    const parsed = await req.json();
    provider = typeof parsed?.provider === 'string' ? parsed.provider : '';
    body = parsed?.body ?? null;
    path = typeof parsed?.path === 'string' ? parsed.path : undefined;
  } catch (_e) {
    return jsonResponse({ error: 'Invalid request body' }, 400);
  }

  if (!provider || body === null) {
    return jsonResponse({ error: 'provider と body は必須です' }, 400);
  }

  const upstream = resolveUpstream(provider, path);
  if ('error' in upstream) {
    return jsonResponse({ error: upstream.error }, upstream.status);
  }

  try {
    const response = await fetch(upstream.url, {
      method: 'POST',
      headers: upstream.headers,
      body: JSON.stringify(body),
    });

    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error(`${provider} への転送に失敗:`, error);
    return jsonResponse({ error: `上流APIへの接続に失敗しました: ${String(error)}` }, 502);
  }
});
