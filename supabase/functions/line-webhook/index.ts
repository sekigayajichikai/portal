/**
 * 公式LINE の Webhook の受け口（LINE Developers の Webhook URL をここに向ける）
 *
 * - LINE の署名（X-Line-Signature）を確かめ、偽物は 401 で捨てる。
 * - バス時刻表（「バス」「マイバス」「バス検索」とバスのボタン）はここで答える（GAS の起動待ちがないので速い）。
 * - それ以外（名簿登録・お問い合わせ・友だち追加など）は、受け取った中身をそのまま名簿GAS（GAS_WEBHOOK_URL）へ渡す。
 *   LINE にはすぐ 200 を返し、GAS への受け渡しは後ろで続ける。
 * - バスの処理で失敗したときも GAS へ渡す（GAS にもバスの処理が残っている）。
 *
 * バスをここで答える相手（シークレット BUS_EDGE_MODE）:
 *   off  … 誰も答えない（全部 GAS へ渡すだけ）
 *   test … BUS_TEST_USER_IDS（カンマ区切り。なければ LINE_TEST_USER_ID）の人だけ
 *   live … 全員
 *
 * 時刻表データの同期: POST ?op=sync（ヘッダー x-sync-secret: BUS_SYNC_SECRET）
 *   名簿GAS の syncBusToSupabase がシート「バス時刻表」「特別ダイヤ」と祝日カレンダーを送ってくる。
 *   { timetable: [{direction, dayType, stopName, times[]}], specialDays: [{start, end, dayType, memo}],
 *     holidays: [{date, name}], settings?: [{userId, patternName, direction, stopName}] }
 *   settings があれば各人のバス設定を全部入れ替える（切り替えのときに一度だけ）。日付は 'yyyy-mm-dd'。
 *
 * 試験用: WEBHOOK_TEST_SECRET で署名したイベントは、LINE に返信せず、返すはずのメッセージを
 *   LINE の検証 API（validate/reply）にかけて JSON で返す（BUS_TEST_USER_IDS の人のイベントだけ受け付ける）。
 *   ヘッダー x-test-forward: 1 なら GAS への受け渡しも試す（GAS の応答を待って返す）。
 *
 * 必要なシークレット: LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN / GAS_WEBHOOK_URL / BUS_SYNC_SECRET
 *                   / BUS_EDGE_MODE / BUS_TEST_USER_IDS（任意）/ WEBHOOK_TEST_SECRET（試験のときだけ）
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY は自動で入る。
 * デプロイ: supabase functions deploy line-webhook --project-ref iplcopuwwzbtwoakqifh --no-verify-jwt
 * 仕様: docs/バス時刻表.md
 */

import {
  BUS_MAX_PATTERNS,
  BUS_TEXTS,
  type BusSetting,
  type SpecialDay,
  type TimetableRow,
  buildDeleteConfirmFlex,
  buildDirectionSelectFlex,
  buildSavedFlex,
  buildSettingsListFlex,
  buildStopSelectFlex,
  buildTimetableFlex,
  getBusTimetable,
  getDayType,
  getOtherRoutes,
  getStopNames,
  isoToNum,
  nextPatternName,
} from './bus.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const env = (k: string) => Deno.env.get(k) ?? '';

// ============================================================
// 署名
// ============================================================

async function hmacBase64(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
  let bin = '';
  for (const b of sig) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** 長さが同じなら最後まで比べる（比べる時間から中身を推測されないように） */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** 'line' … 本物の LINE ／ 'test' … 試験用の署名 ／ null … 偽物 */
async function checkSignature(body: string, signature: string | null): Promise<'line' | 'test' | null> {
  if (!signature) return null;
  const channelSecret = env('LINE_CHANNEL_SECRET');
  if (channelSecret && safeEqual(await hmacBase64(channelSecret, body), signature)) return 'line';
  const testSecret = env('WEBHOOK_TEST_SECRET');
  if (testSecret && safeEqual(await hmacBase64(testSecret, body), signature)) return 'test';
  return null;
}

// ============================================================
// DB（PostgREST をサービスロールで直接呼ぶ）
// ============================================================

async function db(path: string, init: RequestInit = {}): Promise<unknown> {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(`${env('SUPABASE_URL')}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`DB ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

interface BusData {
  rows: TimetableRow[];
  specialDays: SpecialDay[];
  holidays: Set<number>;
}

/** 時刻表・特別ダイヤ・祝日は年に数回しか変わらないので、この Function の中に10分覚えておく */
const BUS_DATA_TTL_MS = 10 * 60 * 1000;
let busDataCache: { at: number; data: BusData } | null = null;

async function loadBusData(): Promise<BusData> {
  if (busDataCache && Date.now() - busDataCache.at < BUS_DATA_TTL_MS) return busDataCache.data;
  const [rows, specials, holidays] = await Promise.all([
    db('bus_timetable?select=direction,day_type,stop_name,times&order=row_order.asc') as Promise<
      { direction: string; day_type: string; stop_name: string; times: string[] }[]
    >,
    db('bus_special_days?select=start_date,end_date,day_type') as Promise<
      { start_date: string; end_date: string; day_type: '平日' | '土休日' }[]
    >,
    db('bus_holidays?select=date') as Promise<{ date: string }[]>,
  ]);
  const data: BusData = {
    rows: rows.map((r) => ({ direction: r.direction, dayType: r.day_type, stopName: r.stop_name, times: r.times })),
    specialDays: specials.map((s) => ({ start: isoToNum(s.start_date), end: isoToNum(s.end_date), dayType: s.day_type })),
    holidays: new Set(holidays.map((h) => isoToNum(h.date))),
  };
  if (data.rows.length === 0) throw new Error('バス時刻表が空です（名簿GASの syncBusToSupabase を実行）');
  busDataCache = { at: Date.now(), data };
  return data;
}

async function getSettings(userId: string): Promise<BusSetting[]> {
  const rows = await db(
    `bus_user_settings?select=pattern_name,direction,stop_name&user_id=eq.${encodeURIComponent(userId)}&order=id.asc`,
  ) as { pattern_name: string; direction: string; stop_name: string }[];
  return rows.map((r) => ({ patternName: r.pattern_name, direction: r.direction, stopName: r.stop_name }));
}

const eqUser = (userId: string) => `user_id=eq.${encodeURIComponent(userId)}`;
const eqName = (name: string) => `pattern_name=eq.${encodeURIComponent(name)}`;

// ============================================================
// LINE への返信
// ============================================================

type LineMessage = Record<string, unknown>;

const flex = (altText: string, contents: unknown): LineMessage => ({ type: 'flex', altText, contents });
const textMsg = (text: string): LineMessage => ({ type: 'text', text });

/** 試験用の署名のときは返信せず、ここに貯めて検証 API にかける */
interface Ctx {
  test: boolean;
  sent: { replyToken: string; messages: LineMessage[] }[];
}

async function reply(ctx: Ctx, replyToken: string, messages: LineMessage[]) {
  if (ctx.test) {
    ctx.sent.push({ replyToken, messages });
    return;
  }
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env('LINE_CHANNEL_ACCESS_TOKEN')}` },
    body: JSON.stringify({ replyToken, messages }),
  });
  if (!res.ok) throw new Error(`LINE reply ${res.status}: ${await res.text()}`);
}

// ============================================================
// バス
// ============================================================

// deno-lint-ignore no-explicit-any
type LineEvent = any;

function busTargetUsers(): Set<string> {
  const list = env('BUS_TEST_USER_IDS') || env('LINE_TEST_USER_ID');
  return new Set(list.split(',').map((s) => s.trim()).filter(Boolean));
}

/** この人のバスをここで答えるか */
function busEnabledFor(userId: string | undefined, test: boolean): boolean {
  if (!userId) return false;
  const mode = env('BUS_EDGE_MODE') || 'off';
  if (test) return busTargetUsers().has(userId); // 試験の署名は試験対象の人だけ
  if (mode === 'live') return true;
  if (mode === 'test') return busTargetUsers().has(userId);
  return false;
}

async function timetableReply(ctx: Ctx, replyToken: string, direction: string, stopName: string, dayType: string | null,
  isSaved: boolean, isSwitched: boolean, others: BusSetting[] | null) {
  const data = await loadBusData();
  const now = new Date();
  const today = getDayType(now, data.specialDays, data.holidays);
  const tomorrow = getDayType(new Date(now.getTime() + 24 * 60 * 60 * 1000), data.specialDays, data.holidays);
  const dt = dayType ?? today;
  const times = getBusTimetable(data.rows, direction, dt, stopName);
  // 今日のダイヤに戻したときは、切り替えではなくふつうの表示（日付と次のバス）にする
  const isOtherDay = isSwitched && dt !== today;
  await reply(ctx, replyToken, [flex('バス時刻表', buildTimetableFlex(direction, stopName, dt, times, isSaved, isOtherDay, others, now, tomorrow))]);
}

/**
 * バスのイベントならここで答えて true。バスでなければ false（GAS へ渡す）
 */
async function handleBus(ctx: Ctx, event: LineEvent): Promise<boolean> {
  const userId: string = event.source?.userId;
  const replyToken: string = event.replyToken;

  if (event.type === 'message' && event.message?.type === 'text') {
    const text = String(event.message.text).trim();

    // 名前変更の入力待ち（GAS と同じく、バスの言葉より先に見る）
    const pending = await db(
      `bus_rename_pending?select=old_name,expires_at&${eqUser(userId)}`,
    ) as { old_name: string; expires_at: string }[];
    if (pending.length > 0) {
      await db(`bus_rename_pending?${eqUser(userId)}`, { method: 'DELETE' });
      if (new Date(pending[0].expires_at).getTime() > Date.now()) {
        const oldName = pending[0].old_name;
        const settings = await getSettings(userId);
        if (text !== oldName && settings.some((s) => s.patternName === text)) {
          await reply(ctx, replyToken, [textMsg('「' + text + '」はもう使っています。\n「マイバス設定」と送って、別の名前でつけ直してください。')]);
          return true;
        }
        await db(`bus_user_settings?${eqUser(userId)}&${eqName(oldName)}`, {
          method: 'PATCH',
          body: JSON.stringify({ pattern_name: text }),
        });
        await reply(ctx, replyToken, [textMsg('「' + oldName + '」→「' + text + '」に変更しました。\n次回からメニューの「バス時刻表」ボタンですぐ表示されます。')]);
        return true;
      }
    }

    if (!BUS_TEXTS.includes(text)) return false;

    if (text === 'バス') {
      const settings = await getSettings(userId);
      if (settings.length === 0) {
        await reply(ctx, replyToken, [flex('バス時刻表', buildDirectionSelectFlex())]);
      } else {
        // 常に1件目を即表示
        const s = settings[0];
        await timetableReply(ctx, replyToken, s.direction, s.stopName, null, true, false, getOtherRoutes(settings, s.direction, s.stopName));
      }
      return true;
    }
    if (text === 'バス検索') {
      await reply(ctx, replyToken, [flex('バス時刻表', buildDirectionSelectFlex())]);
      return true;
    }
    // バス設定・マイバス設定・マイバス
    await reply(ctx, replyToken, [flex('マイバス設定', buildSettingsListFlex(await getSettings(userId)))]);
    return true;
  }

  if (event.type !== 'postback') return false;
  const data: string = event.postback?.data ?? '';
  if (!data.startsWith('bus_')) return false;
  const after = (prefix: string) => data.slice(prefix.length);

  if (data.startsWith('bus_dir=')) {
    const direction = after('bus_dir=');
    const { rows } = await loadBusData();
    await reply(ctx, replyToken, [flex('停留所選択', buildStopSelectFlex(direction, getStopNames(rows)))]);
    return true;
  }

  if (data.startsWith('bus_stop=')) {
    const [direction, stopName] = after('bus_stop=').split(',');
    await timetableReply(ctx, replyToken, direction, stopName, null, false, false, null);
    return true;
  }

  if (data.startsWith('bus_save_ask=')) {
    const [saveDir, saveStop] = after('bus_save_ask=').split(',');
    const settings = await getSettings(userId);
    const duplicate = settings.find((s) => s.direction === saveDir && s.stopName === saveStop);
    if (duplicate) {
      await reply(ctx, replyToken, [textMsg('この行き方は「' + duplicate.patternName + '」として保存済みです。')]);
    } else if (settings.length >= BUS_MAX_PATTERNS) {
      await reply(ctx, replyToken, [textMsg('保存できる行き方は' + BUS_MAX_PATTERNS + 'つまでです。\n「マイバス設定」と送って不要な行き方を削除してください。')]);
    } else {
      const patternName = nextPatternName(settings, saveDir);
      await db('bus_user_settings', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, pattern_name: patternName, direction: saveDir, stop_name: saveStop }),
      });
      const isFirst = settings.length === 0;
      await reply(ctx, replyToken, [flex('保存完了', buildSavedFlex(patternName, saveDir, saveStop, isFirst, isFirst ? '' : settings[0].patternName))]);
    }
    return true;
  }

  if (data.startsWith('bus_show=')) {
    const patternName = after('bus_show=');
    const settings = await getSettings(userId);
    const s = settings.find((x) => x.patternName === patternName);
    if (s) {
      await timetableReply(ctx, replyToken, s.direction, s.stopName, null, true, false, getOtherRoutes(settings, s.direction, s.stopName));
    } else {
      await reply(ctx, replyToken, [textMsg('設定が見つかりませんでした。')]);
    }
    return true;
  }

  if (data.startsWith('bus_rename_ask=')) {
    const oldName = after('bus_rename_ask=');
    await db('bus_rename_pending', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ user_id: userId, old_name: oldName, expires_at: new Date(Date.now() + 30 * 1000).toISOString() }),
    });
    await reply(ctx, replyToken, [textMsg('「' + oldName + '」の新しい名前を入力してください')]);
    return true;
  }

  if (data.startsWith('bus_del_confirm=')) {
    await reply(ctx, replyToken, [flex('削除確認', buildDeleteConfirmFlex(after('bus_del_confirm=')))]);
    return true;
  }

  if (data.startsWith('bus_del=')) {
    const patternName = after('bus_del=');
    await db(`bus_user_settings?${eqUser(userId)}&${eqName(patternName)}`, { method: 'DELETE' });
    await reply(ctx, replyToken, [textMsg('「' + patternName + '」を削除しました。\n\n再登録は「マイバス設定」→「新しい行き方を追加」から行えます。')]);
    return true;
  }

  if (data.startsWith('bus_keep=')) {
    await reply(ctx, replyToken, [textMsg('「' + after('bus_keep=') + '」として保存されました。\n次回からメニューの「バス時刻表」ボタンですぐ表示されます。')]);
    return true;
  }

  if (data === 'bus_cancel') {
    await reply(ctx, replyToken, [textMsg('キャンセルしました。')]);
    return true;
  }

  if (data.startsWith('bus_switch=')) {
    const parts = after('bus_switch=').split(',');
    const [direction, stopName, dayType] = parts;
    const isSaved = parts.length > 3 && parts[3] === 'saved';
    const others = isSaved ? getOtherRoutes(await getSettings(userId), direction, stopName) : null;
    await timetableReply(ctx, replyToken, direction, stopName, dayType, isSaved, true, others);
    return true;
  }

  if (data === 'bus_new') {
    await reply(ctx, replyToken, [flex('バス時刻表', buildDirectionSelectFlex())]);
    return true;
  }

  if (data === 'bus_settings') {
    await reply(ctx, replyToken, [flex('マイバス管理', buildSettingsListFlex(await getSettings(userId)))]);
    return true;
  }

  return false;
}

// ============================================================
// GAS への受け渡し
// ============================================================

async function forwardToGas(payload: Record<string, unknown>): Promise<{ status: number; ms: number }> {
  const t = Date.now();
  const url = env('GAS_WEBHOOK_URL');
  if (!url) throw new Error('GAS_WEBHOOK_URL がありません');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    redirect: 'follow',
  });
  await res.text();
  return { status: res.status, ms: Date.now() - t };
}

// ============================================================
// 時刻表データの同期（名簿GAS から）
// ============================================================

interface SyncBody {
  timetable: { direction: string; dayType: string; stopName: string; times: string[] }[];
  specialDays: { start: string; end: string; dayType: string; memo?: string }[];
  holidays: { date: string; name?: string }[];
  settings?: { userId: string; patternName: string; direction: string; stopName: string }[];
}

async function sync(body: SyncBody) {
  if (!Array.isArray(body.timetable) || body.timetable.length === 0) throw new Error('timetable が空です');

  // 時刻表: 行の順で上書きし、余った行を消す
  await db('bus_timetable', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(body.timetable.map((r, i) => ({
      row_order: i, direction: r.direction, day_type: r.dayType, stop_name: r.stopName, times: r.times, synced_at: new Date().toISOString(),
    }))),
  });
  await db(`bus_timetable?row_order=gte.${body.timetable.length}`, { method: 'DELETE' });

  // 特別ダイヤ: 全部入れ替え（数行）
  await db('bus_special_days?id=gte.0', { method: 'DELETE' });
  if (body.specialDays.length > 0) {
    await db('bus_special_days', {
      method: 'POST',
      body: JSON.stringify(body.specialDays.map((s) => ({ start_date: s.start, end_date: s.end, day_type: s.dayType, memo: s.memo ?? null }))),
    });
  }

  // 祝日: 送られてきた期間を入れ替え
  if (body.holidays.length > 0) {
    await db('bus_holidays', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(body.holidays.map((h) => ({ date: h.date, name: h.name ?? null }))),
    });
    const dates = body.holidays.map((h) => h.date).sort();
    const keep = dates.map((d) => `"${d}"`).join(',');
    await db(`bus_holidays?date=gte.${dates[0]}&date=lte.${dates[dates.length - 1]}&date=not.in.(${encodeURIComponent(keep)})`, { method: 'DELETE' });
  }

  // 各人のバス設定（切り替えのときだけ）: 全部入れ替え。シートの行の順を保つ
  let settingsCount: number | null = null;
  if (Array.isArray(body.settings)) {
    await db('bus_user_settings?id=gte.0', { method: 'DELETE' });
    if (body.settings.length > 0) {
      // シートに同じ人・同じ名前が2行あれば先の行を残す
      await db('bus_user_settings?on_conflict=user_id,pattern_name', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates' },
        body: JSON.stringify(body.settings.map((s) => ({ user_id: s.userId, pattern_name: s.patternName, direction: s.direction, stop_name: s.stopName }))),
      });
    }
    settingsCount = body.settings.length;
  }

  busDataCache = null;
  return { timetable: body.timetable.length, specialDays: body.specialDays.length, holidays: body.holidays.length, settings: settingsCount };
}

// ============================================================
// 入口
// ============================================================

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('ok');
  const url = new URL(req.url);
  const raw = await req.text();

  // 時刻表データの同期
  if (url.searchParams.get('op') === 'sync') {
    const secret = env('BUS_SYNC_SECRET');
    if (!secret || !safeEqual(req.headers.get('x-sync-secret') ?? '', secret)) return json({ error: 'forbidden' }, 403);
    try {
      return json({ ok: true, ...(await sync(JSON.parse(raw))) });
    } catch (e) {
      console.error('sync', e);
      return json({ ok: false, error: String(e) }, 500);
    }
  }

  // LINE からの通知
  const kind = await checkSignature(raw, req.headers.get('x-line-signature'));
  if (!kind) return json({ error: 'bad signature' }, 401);

  const payload = JSON.parse(raw);
  const events: LineEvent[] = Array.isArray(payload.events) ? payload.events : [];
  const test = kind === 'test';
  if (test && events.some((e) => !busTargetUsers().has(e.source?.userId))) {
    return json({ error: '試験の署名は試験対象の人のイベントだけ' }, 403);
  }

  const ctx: Ctx = { test, sent: [] };
  const toGas: LineEvent[] = [];
  const timings: { event: string; ms: number; handled: boolean; error?: string }[] = [];

  for (const event of events) {
    const t = Date.now();
    const label = event.type === 'postback' ? `postback:${event.postback?.data}` : `${event.type}:${event.message?.text ?? ''}`;
    let handled = false;
    let error: string | undefined;
    if (busEnabledFor(event.source?.userId, test)) {
      try {
        handled = await handleBus(ctx, event);
      } catch (e) {
        // 失敗したら GAS に任せる（GAS にもバスの処理が残っている）
        console.error('bus', label, e);
        error = String(e);
        handled = false;
      }
    }
    if (!handled) toGas.push(event);
    timings.push({ event: label, ms: Date.now() - t, handled, ...(error ? { error } : {}) });
  }

  const gasPayload = { ...payload, events: toGas };

  if (test) {
    // 試験: 返すはずのメッセージを LINE の検証 API にかけて返す
    const validated = await Promise.all(ctx.sent.map(async (s) => {
      const res = await fetch('https://api.line.me/v2/bot/message/validate/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env('LINE_CHANNEL_ACCESS_TOKEN')}` },
        body: JSON.stringify({ messages: s.messages }),
      });
      return { status: res.status, body: await res.text() };
    }));
    const forward = toGas.length > 0 && req.headers.get('x-test-forward') === '1' ? await forwardToGas(gasPayload) : null;
    return json({ timings, toGas: toGas.length, sent: ctx.sent, validated, forward });
  }

  // 本番: LINE にはすぐ 200 を返し、GAS への受け渡しは後ろで続ける
  if (toGas.length > 0) {
    const p = forwardToGas(gasPayload).catch((e) => console.error('forward', e));
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(p);
    else await p;
  }
  return json({ ok: true });
});
