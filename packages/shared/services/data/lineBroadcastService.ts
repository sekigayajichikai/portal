/**
 * LINE 配信（週次配信）のクライアント側サービス
 *
 * - sendLineMessages: Edge Function line-broadcast 経由で LINE Messaging API に送る
 *   （チャネルアクセストークンはサーバー側にだけ置く）
 * - uploadWeeklyImage: 配信画像（チラシPNG等）を Storage に置いて https URL を得る
 *   （Flex のヒーロー画像は https の画像URLが必要なため）
 * - recordWeeklyDigestSend / getWeeklyDigestSends: 配信履歴（何をいつ送ったか）
 *
 * 仕様: docs/週次配信.md
 */

import { getSupabaseClient } from '../supabaseClient.js';
import { getStoredAppToken, requireRelogin, RELOGIN_MESSAGE } from '../ai/aiProxyClient.js';

/** LINE Messaging API のメッセージ（text / flex / image）。中身の型はゆるく持つ */
export type LineMessage = { type: 'text'; text: string } | { type: 'flex'; altText: string; contents: unknown } | { type: 'image'; originalContentUrl: string; previewImageUrl: string };

export type LineSendMode = 'validate' | 'test' | 'admins' | 'broadcast';

export interface LineSendResult {
  ok: boolean;
  status: number;
  mode: LineSendMode;
  line: unknown;
}

/**
 * LINE にメッセージを送る（validate: 形式チェックのみ / test: 自分にだけ / admins: 管理者（LINE_ADMIN_USER_IDS）だけ / broadcast: 全員）
 */
export async function sendLineMessages(mode: LineSendMode, messages: LineMessage[]): Promise<LineSendResult> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続');

  const { data, error } = await supabase.functions.invoke('line-broadcast', {
    body: { mode, messages },
    headers: { 'x-app-token': getStoredAppToken() ?? '' },
  });

  if (error) {
    let detail = error.message ?? String(error);
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === 'function') {
      try {
        const errBody = await context.json();
        // LINE 側のエラー（{ message, details[] }）はできるだけそのまま見せる
        const line = errBody?.line;
        if (line?.message) {
          const details = Array.isArray(line.details) ? line.details.map((d: any) => `${d.property ?? ''}: ${d.message ?? ''}`).join(' / ') : '';
          detail = `${line.message}${details ? `（${details}）` : ''}`;
        } else {
          detail = errBody?.error ?? detail;
        }
        if (typeof detail !== 'string') detail = JSON.stringify(detail);
      } catch {
        /* JSONでない */
      }
    }
    if (context?.status === 401 || detail === 'Unauthorized') {
      requireRelogin();
      throw new Error(RELOGIN_MESSAGE);
    }
    throw new Error(`LINE への送信に失敗しました: ${detail}`);
  }
  return data as LineSendResult;
}

/**
 * 配信画像を Storage（newsletter-images/weekly/）に置いて公開URLを返す。
 * 同じ配信日・名前なら上書きする（毎週の作り直しに対応）。
 */
export async function uploadWeeklyImage(blob: Blob, baseDate: string, name: string): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続');
  const ext = blob.type === 'image/png' ? 'png' : 'jpg';
  const path = `weekly/${baseDate}-${name}.${ext}`;
  const { error } = await supabase.storage.from('newsletter-images').upload(path, blob, {
    contentType: blob.type,
    cacheControl: '300',
    upsert: true,
  });
  if (error) throw new Error(`配信画像のアップロードに失敗しました: ${error.message}`);
  const { data } = supabase.storage.from('newsletter-images').getPublicUrl(path);
  // 上書き時に LINE 側のキャッシュを避けるため、クエリでバージョンを付ける
  return `${data.publicUrl}?v=${Date.now()}`;
}

/** 配信履歴の1件 */
export interface WeeklyDigestSend {
  id: string;
  base_date: string;
  mode: LineSendMode;
  text: string | null;
  messages: unknown;
  line_status: number | null;
  /** 送信元の下書き（weekly_digest_drafts.id。無ければ null） */
  draft_id?: string | null;
  sent_at: string;
}

/** 配信履歴を保存する（テーブル未作成なら黙って諦める。送信自体は成功しているため） */
export async function recordWeeklyDigestSend(entry: Omit<WeeklyDigestSend, 'id' | 'sent_at'>): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const { error } = await supabase.from('weekly_digest_sends').insert(entry);
  if (error) console.warn('配信履歴の保存に失敗（テーブル未作成の可能性）:', error.message);
}

/** 直近の配信履歴 */
export async function getWeeklyDigestSends(limit = 10): Promise<WeeklyDigestSend[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('weekly_digest_sends')
    .select('*')
    .order('sent_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return data || [];
}

// ---------------------------------------------------------------------------
// 予約配信（weekly_digest_schedules）。送るのは pg_cron → Edge Function line-broadcast（run-scheduled）
// ---------------------------------------------------------------------------

export type WeeklyDigestScheduleStatus = 'scheduled' | 'sending' | 'sent' | 'failed' | 'canceled';

/** 予約の1件 */
export interface WeeklyDigestSchedule {
  id: string;
  base_date: string;
  /** 送る日時（ISO）。実際は最大5分遅れ */
  send_at: string;
  messages: unknown;
  text: string | null;
  /** 予約した時点の画面の内容（予約後に変わったかの判定用） */
  content_key: string | null;
  draft_id: string | null;
  status: WeeklyDigestScheduleStatus;
  line_status: number | null;
  error: string | null;
  sent_at: string | null;
  created_at: string;
}

/** 予約する（id は画面側で作る。画像のファイル名と LINE の二重送信防止キーにも使うため） */
export async function createWeeklyDigestSchedule(
  entry: Pick<WeeklyDigestSchedule, 'id' | 'base_date' | 'send_at' | 'messages' | 'text' | 'content_key' | 'draft_id'>
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続');
  const { error } = await supabase.from('weekly_digest_schedules').insert(entry);
  if (error) {
    throw new Error(
      /does not exist|schema cache/.test(error.message)
        ? '予約の表がまだありません（sql/migrations/2026-10-05-weekly-digest-schedules.sql を SQL Editor で実行してください）'
        : `予約できませんでした: ${error.message}`
    );
  }
}

/** 予約の一覧（送る日時の新しい順）。テーブル未作成なら空 */
export async function getWeeklyDigestSchedules(limit = 10): Promise<WeeklyDigestSchedule[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('weekly_digest_schedules').select('*').order('send_at', { ascending: false }).limit(limit);
  if (error) return [];
  return (data as WeeklyDigestSchedule[]) ?? [];
}

/** 予約を取り消す（まだ送っていないものだけ）。取り消せたら true */
export async function cancelWeeklyDigestSchedule(id: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続');
  const { data, error } = await supabase.from('weekly_digest_schedules').update({ status: 'canceled' }).eq('id', id).eq('status', 'scheduled').select('id');
  if (error) throw new Error(`取り消せませんでした: ${error.message}`);
  return (data ?? []).length > 0;
}

// ---------------------------------------------------------------------------
// 今月の通数（LINE の上限と、API で送った分も含めて使った数）
// ---------------------------------------------------------------------------

export interface LineQuota {
  /** limited = 上限あり / none = 上限なし（有料プランの従量など） */
  type: 'limited' | 'none';
  limit: number | null;
  used: number;
}

/** 今月の通数を取る。Edge Function が古い版・未設定などで取れなければ null（画面は表示を出さないだけ） */
export async function getLineQuota(): Promise<LineQuota | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.functions.invoke('line-broadcast', {
    body: { mode: 'quota' },
    headers: { 'x-app-token': getStoredAppToken() ?? '' },
  });
  if (error || !data || typeof data.used !== 'number') return null;
  return data as LineQuota;
}
