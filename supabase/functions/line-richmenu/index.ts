/**
 * LINE リッチメニュー管理 Edge Function
 *
 * 管理画面（リッチメニュータブ）から、Messaging API のリッチメニュー操作を代行する。
 * チャネルアクセストークンをクライアントに置かないためのプロキシ。
 *
 * リクエスト: POST { op: string, ...params }  ヘッダー: x-app-token
 *   list            … 登録済みリッチメニュー一覧
 *   get_default     … 全員の既定メニュー（無ければ null）
 *   create          … { menu } リッチメニューを作る → { richMenuId }
 *   upload_image    … { richMenuId, contentType, base64 } 画像を載せる（2500×1686 / 2500×843、1MB以内）
 *   set_default     … { richMenuId } 全員の既定にする
 *   clear_default   … 全員の既定を解除
 *   delete          … { richMenuId } 削除
 *   link_test       … { richMenuId } 自分（LINE_TEST_USER_ID）にだけ紐づける
 *   unlink_test     … 自分の紐づけを解除（既定に戻る）
 *   link_users      … { richMenuId, userIds[] } 複数ユーザーに一括で紐づけ（500人ずつ）
 *   unlink_users    … { userIds[] } 一括解除
 *   alias_list      … エイリアス（タブ切替用の別名）一覧
 *   alias_set       … { aliasId, richMenuId } エイリアスを作る／付け替える
 *   alias_delete    … { aliasId }
 *
 * 必要なシークレット: APP_TOKEN_SECRET / LINE_CHANNEL_ACCESS_TOKEN / LINE_TEST_USER_ID（link_test 用）
 * 仕様: docs/リッチメニュー.md
 */

import { computeAppToken, corsHeaders, jsonResponse } from './appToken.ts';

const API = 'https://api.line.me/v2/bot';
const DATA_API = 'https://api-data.line.me/v2/bot';

async function lineFetch(token: string, method: string, url: string, body?: BodyInit | null, contentType = 'application/json') {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': contentType } : {}) },
    body: body ?? undefined,
  });
  const text = await res.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* テキストのまま */
  }
  return { ok: res.ok, status: res.status, data };
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const tokenSecret = Deno.env.get('APP_TOKEN_SECRET');
  if (!tokenSecret) return jsonResponse({ error: 'Server configuration error' }, 500);
  if ((req.headers.get('x-app-token') ?? '') !== (await computeAppToken(tokenSecret))) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  const token = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
  if (!token) return jsonResponse({ error: 'LINE_CHANNEL_ACCESS_TOKEN が設定されていません' }, 500);

  let p: any;
  try {
    p = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, 400);
  }
  const op = String(p?.op ?? '');
  const testUser = Deno.env.get('LINE_TEST_USER_ID');

  try {
    let r;
    switch (op) {
      case 'list':
        r = await lineFetch(token, 'GET', `${API}/richmenu/list`);
        break;
      case 'get_default': {
        r = await lineFetch(token, 'GET', `${API}/user/all/richmenu`);
        if (r.status === 404) r = { ok: true, status: 200, data: { richMenuId: null } };
        break;
      }
      case 'create':
        if (!p.menu) return jsonResponse({ error: 'menu は必須です' }, 400);
        r = await lineFetch(token, 'POST', `${API}/richmenu`, JSON.stringify(p.menu));
        break;
      case 'upload_image': {
        if (!p.richMenuId || !p.base64) return jsonResponse({ error: 'richMenuId と base64 は必須です' }, 400);
        const bytes = base64ToBytes(String(p.base64));
        if (bytes.byteLength > 1024 * 1024) return jsonResponse({ error: `画像が1MBを超えています（${Math.round(bytes.byteLength / 1024)}KB）` }, 400);
        r = await lineFetch(token, 'POST', `${DATA_API}/richmenu/${p.richMenuId}/content`, bytes, String(p.contentType || 'image/png'));
        break;
      }
      case 'set_default':
        if (!p.richMenuId) return jsonResponse({ error: 'richMenuId は必須です' }, 400);
        r = await lineFetch(token, 'POST', `${API}/user/all/richmenu/${p.richMenuId}`);
        break;
      case 'clear_default':
        r = await lineFetch(token, 'DELETE', `${API}/user/all/richmenu`);
        break;
      case 'delete':
        if (!p.richMenuId) return jsonResponse({ error: 'richMenuId は必須です' }, 400);
        r = await lineFetch(token, 'DELETE', `${API}/richmenu/${p.richMenuId}`);
        break;
      case 'link_test':
        if (!testUser) return jsonResponse({ error: 'LINE_TEST_USER_ID が設定されていません' }, 500);
        if (!p.richMenuId) return jsonResponse({ error: 'richMenuId は必須です' }, 400);
        r = await lineFetch(token, 'POST', `${API}/user/${testUser}/richmenu/${p.richMenuId}`);
        break;
      case 'unlink_test':
        if (!testUser) return jsonResponse({ error: 'LINE_TEST_USER_ID が設定されていません' }, 500);
        r = await lineFetch(token, 'DELETE', `${API}/user/${testUser}/richmenu`);
        break;
      case 'link_users':
      case 'unlink_users': {
        const ids: string[] = Array.isArray(p.userIds) ? p.userIds.filter((u: unknown) => typeof u === 'string' && /^U[0-9a-f]{32}$/.test(u)) : [];
        if (ids.length === 0) return jsonResponse({ error: '有効なユーザーID（Uで始まる33文字）がありません' }, 400);
        if (op === 'link_users' && !p.richMenuId) return jsonResponse({ error: 'richMenuId は必須です' }, 400);
        let done = 0;
        let last: { ok: boolean; status: number; data: unknown } = { ok: true, status: 200, data: {} };
        for (let i = 0; i < ids.length; i += 500) {
          const chunk = ids.slice(i, i + 500);
          last = await lineFetch(
            token,
            'POST',
            `${API}/richmenu/bulk/${op === 'link_users' ? 'link' : 'unlink'}`,
            JSON.stringify(op === 'link_users' ? { richMenuId: p.richMenuId, userIds: chunk } : { userIds: chunk })
          );
          if (!last.ok) break;
          done += chunk.length;
        }
        r = { ...last, data: { ...(typeof last.data === 'object' ? (last.data as object) : {}), linked: done, total: ids.length } };
        break;
      }
      case 'alias_list':
        r = await lineFetch(token, 'GET', `${API}/richmenu/alias/list`);
        break;
      case 'alias_set': {
        if (!p.aliasId || !p.richMenuId) return jsonResponse({ error: 'aliasId と richMenuId は必須です' }, 400);
        r = await lineFetch(token, 'POST', `${API}/richmenu/alias`, JSON.stringify({ richMenuAliasId: p.aliasId, richMenuId: p.richMenuId }));
        // 既にあるエイリアスなら付け替え
        if (!r.ok && r.status === 400) {
          r = await lineFetch(token, 'POST', `${API}/richmenu/alias/${p.aliasId}`, JSON.stringify({ richMenuId: p.richMenuId }));
        }
        break;
      }
      case 'alias_delete':
        if (!p.aliasId) return jsonResponse({ error: 'aliasId は必須です' }, 400);
        r = await lineFetch(token, 'DELETE', `${API}/richmenu/alias/${p.aliasId}`);
        break;
      default:
        return jsonResponse({ error: `不明な op: ${op}` }, 400);
    }
    return jsonResponse({ ok: r.ok, status: r.status, op, line: r.data }, r.ok ? 200 : r.status);
  } catch (error) {
    console.error('LINE API エラー:', error);
    return jsonResponse({ error: `LINE API への接続に失敗しました: ${String(error)}` }, 502);
  }
});
