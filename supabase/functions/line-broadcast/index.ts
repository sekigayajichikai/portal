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
 *   admins    … LINE_ADMIN_USER_IDS（DX委員など。リッチメニューと共通）に multicast する（確認用。人数ぶん通数を使う）
 *   broadcast … 友だち全員に broadcast する
 *
 *   POST { mode: 'quota' }（x-app-token 必要）
 *   quota … 今月の上限（limited なら通数、none なら上限なし）と使った通数を返す。API で送った分も含む
 *
 *   POST { mode: 'run-scheduled' }（ヘッダー不要。pg_cron が5分ごとに呼ぶ）
 *   run-scheduled … 送る時刻を過ぎた予約（weekly_digest_schedules）を全員に配信し、結果を書き戻す。
 *     予約は管理画面（ログイン済み）でしか作れず、時刻前のものは送らないので、誰が呼んでも
 *     「予約どおりに送る」以上のことは起きない。X-Line-Retry-Key に予約IDを使い、二重に届かない。
 *     SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY は Edge Function に自動で入る。
 *
 * 必要なシークレット:
 * - APP_TOKEN_SECRET: トークン検証用（app-login と共通）
 * - LINE_CHANNEL_ACCESS_TOKEN: Messaging API のチャネルアクセストークン（長期）
 * - LINE_TEST_USER_ID: テスト送信先のユーザーID（LINE Developers の「あなたのユーザーID」）
 * - LINE_ADMIN_USER_IDS: 管理者に送るときの宛先（カンマ区切りのユーザーID。line-richmenu と共通）
 *
 * 仕様: docs/週次配信.md
 */

import { computeAppToken, corsHeaders, jsonResponse } from './appToken.ts';

const LINE_API = 'https://api.line.me/v2/bot/message';
const MAX_MESSAGES = 5;

type Mode = 'validate' | 'test' | 'admins' | 'broadcast';
const MODES: Mode[] = ['validate', 'test', 'admins', 'broadcast'];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  // deno-lint-ignore no-explicit-any
  let parsed: any;
  try {
    parsed = await req.json();
  } catch (_e) {
    return jsonResponse({ error: 'Invalid request body' }, 400);
  }

  // 予約配信（pg_cron から）。合言葉のトークンは持てないので、この分岐だけ先に処理する
  if (parsed?.mode === 'run-scheduled') {
    return await runScheduled();
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

  // 今月の通数（上限と使った数）。管理画面に「今月の残り」を出す用
  if (parsed?.mode === 'quota') {
    return await getQuota(channelToken);
  }

  const mode: Mode = parsed?.mode;
  const messages: unknown[] = Array.isArray(parsed?.messages) ? parsed.messages : [];
  if (!MODES.includes(mode)) {
    return jsonResponse({ error: `mode は ${MODES.map((m) => `'${m}'`).join(' | ')} のいずれかです` }, 400);
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
  } else if (mode === 'admins') {
    // 管理者（DX委員など）の確認用。ID はリッチメニューの「管理者だけに反映」と同じ Secret から読む
    const to = [...new Set((Deno.env.get('LINE_ADMIN_USER_IDS') ?? '').split(/[\s,]+/).filter((id) => /^U[0-9a-f]{32}$/.test(id)))];
    if (to.length === 0) {
      return jsonResponse({ error: 'LINE_ADMIN_USER_IDS が設定されていません（管理者のユーザーIDをカンマ区切りで Supabase の Secrets に）' }, 500);
    }
    url = `${LINE_API}/multicast`;
    body = { to: to.slice(0, 500), messages };
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

// ---------------------------------------------------------------------------
// 予約配信
// ---------------------------------------------------------------------------

/** サービスロールで PostgREST を呼ぶ（RLS を通らない。予約の読み書きと履歴の記録だけに使う） */
async function db(path: string, init: RequestInit = {}): Promise<Response> {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY がありません');
  return await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}

interface ScheduleRow {
  id: string;
  base_date: string;
  messages: unknown[];
  text: string | null;
  draft_id: string | null;
}

/** 送る時刻を過ぎた予約を1件ずつ「送信中」に押さえてから送る（同時に2回呼ばれても二重送信しない） */
async function runScheduled(): Promise<Response> {
  const channelToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
  if (!channelToken) return jsonResponse({ error: 'LINE_CHANNEL_ACCESS_TOKEN が設定されていません' }, 500);

  const now = new Date().toISOString();
  const dueRes = await db(`weekly_digest_schedules?select=id&status=eq.scheduled&send_at=lte.${encodeURIComponent(now)}&order=send_at.asc&limit=5`);
  if (!dueRes.ok) return jsonResponse({ error: `予約の読み込みに失敗: ${await dueRes.text()}` }, 500);
  const due = (await dueRes.json()) as Array<{ id: string }>;

  const results: Array<{ id: string; status: string; line_status: number }> = [];
  for (const { id } of due) {
    // scheduled → sending に変えられたときだけ送る（取り消し・別の呼び出しとの競合を避ける）
    const claim = await db(`weekly_digest_schedules?id=eq.${id}&status=eq.scheduled&select=id,base_date,messages,text,draft_id`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'sending' }),
    });
    const rows = claim.ok ? ((await claim.json()) as ScheduleRow[]) : [];
    const row = rows[0];
    if (!row) continue;

    let lineStatus = 0;
    let error: string | null = null;
    try {
      const res = await fetch(`${LINE_API}/broadcast`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${channelToken}`, 'Content-Type': 'application/json', 'X-Line-Retry-Key': row.id },
        body: JSON.stringify({ messages: row.messages }),
      });
      lineStatus = res.status;
      // 409 = 同じ Retry-Key がすでに受け付け済み（前回の呼び出しで送れていた）。送信済み扱い
      if (!res.ok && res.status !== 409) error = (await res.text()).slice(0, 500);
    } catch (e) {
      error = `LINE API への接続に失敗: ${String(e)}`;
    }

    const status = error ? 'failed' : 'sent';
    await db(`weekly_digest_schedules?id=eq.${row.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, line_status: lineStatus || null, error, sent_at: new Date().toISOString() }),
    });
    if (error) {
      console.error(`予約配信に失敗 ${row.id}:`, error);
    } else {
      await db('weekly_digest_sends', {
        method: 'POST',
        body: JSON.stringify({ base_date: row.base_date, mode: 'broadcast', text: row.text, messages: row.messages, line_status: lineStatus, draft_id: row.draft_id }),
      });
    }
    results.push({ id: row.id, status, line_status: lineStatus });
  }
  return jsonResponse({ ok: true, processed: results });
}

// ---------------------------------------------------------------------------
// 今月の通数
// ---------------------------------------------------------------------------

/** { type: 'limited' | 'none', limit: number | null, used: number } を返す */
async function getQuota(channelToken: string): Promise<Response> {
  const headers = { Authorization: `Bearer ${channelToken}` };
  try {
    const [qRes, uRes] = await Promise.all([fetch(`${LINE_API}/quota`, { headers }), fetch(`${LINE_API}/quota/consumption`, { headers })]);
    if (!qRes.ok || !uRes.ok) {
      return jsonResponse({ error: `LINE から通数を取得できませんでした（${qRes.status} / ${uRes.status}）` }, 502);
    }
    const q = (await qRes.json()) as { type: 'limited' | 'none'; value?: number };
    const u = (await uRes.json()) as { totalUsage: number };
    return jsonResponse({ type: q.type, limit: q.type === 'limited' ? (q.value ?? null) : null, used: u.totalUsage });
  } catch (e) {
    return jsonResponse({ error: `LINE API への接続に失敗しました: ${String(e)}` }, 502);
  }
}
