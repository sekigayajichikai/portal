/**
 * LINE 配信 Edge Function（週次配信の送信用）
 *
 * 管理画面（週次配信タブ）が組み立てたメッセージ（テキスト＋Flexカルーセル）を、
 * サーバー側で保持するチャネルアクセストークンを付けて LINE Messaging API へ送ります。
 * トークンをクライアントバンドルに含めないためのプロキシです。
 *
 * リクエスト形式:
 *   POST { mode: 'validate' | 'test' | 'broadcast', messages: LineMessage[] }
 *   ヘッダー: x-app-token (app-login が発行したトークン)
 *
 *   validate  … 送らずに LINE 側で形式チェックだけ行う（Flex JSON の間違いを事前に検出）
 *   test      … LINE_TEST_USER_ID（管理者自身）にだけ push する
 *   broadcast … 友だち全員に broadcast する
 *
 * 必要なシークレット:
 * - APP_TOKEN_SECRET: トークン検証用（app-login と共通）
 * - LINE_CHANNEL_ACCESS_TOKEN: Messaging API のチャネルアクセストークン（長期）
 * - LINE_TEST_USER_ID: テスト送信先のユーザーID（LINE Developers の「あなたのユーザーID」）
 *
 * 仕様: docs/週次配信.md
 */

import { computeAppToken, corsHeaders, jsonResponse } from './appToken.ts';

const LINE_API = 'https://api.line.me/v2/bot/message';
const MAX_MESSAGES = 5;

type Mode = 'validate' | 'test' | 'broadcast';

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
  const expectedToken = await computeAppToken(tokenSecret);
  if ((req.headers.get('x-app-token') ?? '') !== expectedToken) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const channelToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
  if (!channelToken) {
    return jsonResponse({ error: 'LINE_CHANNEL_ACCESS_TOKEN が設定されていません（Supabase の Edge Function Secrets に追加してください）' }, 500);
  }

  let mode: Mode;
  let messages: unknown[];
  try {
    const parsed = await req.json();
    mode = parsed?.mode;
    messages = Array.isArray(parsed?.messages) ? parsed.messages : [];
  } catch (_e) {
    return jsonResponse({ error: 'Invalid request body' }, 400);
  }
  if (!['validate', 'test', 'broadcast'].includes(mode)) {
    return jsonResponse({ error: "mode は 'validate' | 'test' | 'broadcast' のいずれかです" }, 400);
  }
  if (messages.length === 0 || messages.length > MAX_MESSAGES) {
    return jsonResponse({ error: `messages は1〜${MAX_MESSAGES}件です` }, 400);
  }

  let url: string;
  let body: Record<string, unknown>;
  if (mode === 'validate') {
    url = `${LINE_API}/validate/broadcast`;
    body = { messages };
  } else if (mode === 'test') {
    const to = Deno.env.get('LINE_TEST_USER_ID');
    if (!to) {
      return jsonResponse({ error: 'LINE_TEST_USER_ID が設定されていません（テスト送信先の自分のユーザーID）' }, 500);
    }
    url = `${LINE_API}/push`;
    body = { to, messages };
  } else {
    url = `${LINE_API}/broadcast`;
    body = { messages };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${channelToken}`,
        'Content-Type': 'application/json',
        // 同じ内容の二重送信を LINE 側で防ぐ（同一キーは24時間以内なら再送されない）
        ...(mode === 'broadcast' ? { 'X-Line-Retry-Key': crypto.randomUUID() } : {}),
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let detail: unknown = text;
    try {
      detail = text ? JSON.parse(text) : {};
    } catch {
      /* テキストのまま */
    }
    return jsonResponse({ ok: res.ok, status: res.status, mode, line: detail }, res.ok ? 200 : res.status);
  } catch (error) {
    console.error('LINE API への送信に失敗:', error);
    return jsonResponse({ error: `LINE API への接続に失敗しました: ${String(error)}` }, 502);
  }
});
