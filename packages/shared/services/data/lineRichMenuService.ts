/**
 * LINE リッチメニュー（クライアント側）
 *
 * - richMenuApi: Edge Function line-richmenu 経由で Messaging API を操作
 * - line_rich_menus テーブル: 管理画面で作ったメニューの定義（レイアウト・タイル・画像）を保存し、あとから編集・再登録できるようにする
 *
 * 仕様: docs/リッチメニュー.md
 */

import { getSupabaseClient } from '../supabaseClient.js';
import { getStoredAppToken, AUTH_TOKEN_STORAGE_KEY } from '../ai/aiProxyClient.js';

export type RichMenuOp =
  | 'list'
  | 'get_default'
  | 'create'
  | 'upload_image'
  | 'set_default'
  | 'clear_default'
  | 'delete'
  | 'link_test'
  | 'unlink_test'
  | 'link_users'
  | 'unlink_users'
  | 'alias_list'
  | 'alias_set'
  | 'alias_delete';

export interface RichMenuApiResult<T = any> {
  ok: boolean;
  status: number;
  op: RichMenuOp;
  line: T;
}

/** LINE 側のリッチメニュー（一覧の1件） */
export interface LineRichMenu {
  richMenuId: string;
  name: string;
  chatBarText: string;
  selected: boolean;
  size: { width: number; height: number };
  areas: Array<{ bounds: { x: number; y: number; width: number; height: number }; action: Record<string, unknown> }>;
}

/** Edge Function 経由で LINE のリッチメニューAPIを呼ぶ */
export async function richMenuApi<T = any>(op: RichMenuOp, params: Record<string, unknown> = {}): Promise<RichMenuApiResult<T>> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続');
  const { data, error } = await supabase.functions.invoke('line-richmenu', {
    body: { op, ...params },
    headers: { 'x-app-token': getStoredAppToken() ?? '' },
  });
  if (error) {
    let detail = error.message ?? String(error);
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === 'function') {
      try {
        const errBody = await context.json();
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
      const hadToken = typeof localStorage !== 'undefined' && !!localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
      if (typeof localStorage !== 'undefined') localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
      throw new Error(
        hadToken
          ? 'ログインの有効期限が切れました。ページを再読み込みして、もう一度ログインしてください。'
          : 'サーバーのログイン情報がありません。いったんログアウトして、もう一度ログインしてください。'
      );
    }
    throw new Error(`LINE の操作に失敗しました（${op}）: ${detail}`);
  }
  return data as RichMenuApiResult<T>;
}

// ---------------------------------------------------------------------------
// 保存したメニュー定義（line_rich_menus）
// ---------------------------------------------------------------------------

export interface SavedRichMenu {
  id: string;
  name: string;
  /** 管理画面のエディタの定義（RichMenuDef の JSON。中身はアプリ側で解釈） */
  definition: unknown;
  /** 生成またはアップロードした画像の公開URL */
  image_url: string | null;
  /** LINE に登録したときの richMenuId（未登録なら null） */
  line_rich_menu_id: string | null;
  /** タブ切替用のエイリアス（無ければ null） */
  alias_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function getSavedRichMenus(): Promise<SavedRichMenu[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('line_rich_menus').select('*').order('updated_at', { ascending: false });
  if (error) {
    console.warn('line_rich_menus の取得に失敗（テーブル未作成の可能性）:', error.message);
    return [];
  }
  return data || [];
}

export async function saveRichMenu(
  menu: Partial<SavedRichMenu> & { name: string; definition: unknown }
): Promise<SavedRichMenu> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続');
  const payload = { ...menu, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('line_rich_menus').upsert(payload).select().single();
  if (error) throw new Error(`メニューの保存に失敗しました: ${error.message}`);
  return data;
}

export async function deleteSavedRichMenu(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続');
  const { error } = await supabase.from('line_rich_menus').delete().eq('id', id);
  if (error) throw new Error(`メニューの削除に失敗しました: ${error.message}`);
}

/** リッチメニュー画像を Storage（newsletter-images/richmenu/）に置いて公開URLを返す */
export async function uploadRichMenuImage(blob: Blob, key: string): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase未接続');
  const ext = blob.type === 'image/png' ? 'png' : 'jpg';
  const path = `richmenu/${key}.${ext}`;
  const { error } = await supabase.storage.from('newsletter-images').upload(path, blob, { contentType: blob.type, cacheControl: '300', upsert: true });
  if (error) throw new Error(`画像のアップロードに失敗しました: ${error.message}`);
  const { data } = supabase.storage.from('newsletter-images').getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}
