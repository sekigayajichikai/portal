/**
 * アプリログイン Edge Function
 *
 * パスワードをサーバー側で照合し、成功時にアプリトークンを発行します。
 * クライアントバンドルにパスワードを含めないための認証エンドポイントです。
 *
 * 必要なシークレット:
 * - APP_PASSWORD: アプリの共有パスワード
 * - APP_TOKEN_SECRET: トークン署名用のランダム文字列
 */

import { computeAppToken, corsHeaders, jsonResponse } from './appToken.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const appPassword = Deno.env.get('APP_PASSWORD');
  const tokenSecret = Deno.env.get('APP_TOKEN_SECRET');

  if (!appPassword || !tokenSecret) {
    console.error('APP_PASSWORD / APP_TOKEN_SECRET が設定されていません');
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }

  let password = '';
  try {
    const body = await req.json();
    password = typeof body?.password === 'string' ? body.password : '';
  } catch (_e) {
    return jsonResponse({ error: 'Invalid request body' }, 400);
  }

  // タイミング差を減らすため、比較前に固定の待機を入れる
  await new Promise((resolve) => setTimeout(resolve, 150));

  if (password !== appPassword) {
    return jsonResponse({ error: 'Invalid password' }, 401);
  }

  const token = await computeAppToken(tokenSecret);
  return jsonResponse({ token });
});
