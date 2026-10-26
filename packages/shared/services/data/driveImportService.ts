/**
 * Drive 自動取り込みの取込記録（drive_imports）を管理画面から読む
 *
 * 書くのは scripts/drive-import（GitHub Actions）だけ。管理画面は「今月の流れ」で
 * 「自動で取り込んだ記事を確認」を出すために読む。
 */
import { getSupabaseClient } from '../supabaseClient.js';

export interface DriveImport {
  id: string;
  drive_file_id: string;
  drive_name: string;
  drive_md5: string | null;
  drive_modified_at: string | null;
  /** 月フォルダ名 '202611' */
  month_folder: string;
  /** '関ヶ谷だより' / '会報ふれあい' */
  media: string | null;
  kind: 'source' | 'attachment' | 'image';
  newsletter_id: string | null;
  pdf_url: string | null;
  pdf_label: string | null;
  articles_created: number;
  /** imported / updated（取込後に Drive 側で差し替え）/ failed / skipped */
  status: 'imported' | 'updated' | 'failed' | 'skipped';
  error: string | null;
  imported_at: string;
}

/** その号に自動で取り込んだ記録（新しい順）。テーブルが無い・読めないときは空 */
export async function getDriveImportsByNewsletterId(newsletterId: string): Promise<DriveImport[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('drive_imports')
    .select('*')
    .eq('newsletter_id', newsletterId)
    .order('imported_at', { ascending: false });
  if (error) {
    console.warn('Drive 取込記録を読めませんでした（テーブル未作成の可能性）:', error.message);
    return [];
  }
  return (data as DriveImport[]) ?? [];
}
