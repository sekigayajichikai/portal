/**
 * Google Drive の月フォルダから「関ヶ谷だより」「会報ふれあい」の PDF を取り込み、
 * その月の号（下書き）に PDF と記事を入れる（docs/Drive取り込み-計画.md の第1段階）
 *
 * 使い方（リポジトリ直下で）:
 *   node scripts/drive-import/index.mjs                 … 今月と来月の月フォルダを見る
 *   MONTHS=202611 node scripts/drive-import/index.mjs   … 月を指定
 *   DRY_RUN=1 node scripts/drive-import/index.mjs       … 何をするかを表示するだけ（AI・保存・アップロードはしない）
 *
 * 必要な環境変数（GitHub Actions では Secrets から渡す。手元では .env.drive-import.local に書いてもよい）:
 *   GDRIVE_SA_KEY               サービスアカウントの鍵（JSON 文字列）
 *   GDRIVE_ROOT_FOLDER_ID       共有フォルダ「回覧板Data」の ID（省略時は既定値）
 *   SUPABASE_URL                本番 Supabase の URL
 *   SUPABASE_ANON_KEY           service_role キー（名前は共有コードの都合。RLS を通すため service_role を入れる）
 *   ANTHROPIC_API_KEY           Claude のキー（記事化・題名の読み取り）
 *   DEFAULT_ORGANIZATION_ID     号を新しく作るときの organization_id（省略可）
 *   SUMMARY_FILE                結果（Markdown）を書き出す先（省略可。GitHub Actions のメール本文に使う）
 *
 * それ以外の PDF（学校だより・チラシなど）は、記事にはせず「PDFのまま」その月の下書きの号に登録する（2026-11-28 から。
 * 題名と発行元は AI の提案。IMPORT_OTHER_PDFS=0 で止められる）。
 *
 * 人が握るところ: 作るのは「下書きの号」と「記事の下書き」だけ。公開・承認・削除はしない。
 * 同じファイル（Drive のファイルID＋md5）は二度取り込まない。同じ号・同じ媒体の2本目（修正版など）は取り込まず知らせるだけ。
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { getAccessToken, listChildren, downloadFile, isFolder, isPdf } from './drive.mjs';
import { loadShared } from './build.mjs';
import { renderPdfThumbnail } from './thumbnail.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

// ---- 設定 ----
/** 自動で記事にする媒体（ファイル名にこの文字が入っている PDF だけ）。順番は表示順 */
const MEDIA = ['関ヶ谷だより', '会報ふれあい'];
const DEFAULT_ROOT_FOLDER_ID = '1LMPmgHN-s1EUoEpmDD8BTQ5QHu1wk0rA';
/** 月フォルダ名（6桁の年月）と年フォルダ名（4桁） */
const MONTH_RE = /^(\d{4})(\d{2})$/;
const YEAR_RE = /^\d{4}$/;

// 手元で動かすとき用: .env.drive-import.local があれば読む（GitHub Actions では env で渡る）
const localEnv = resolve(ROOT, '.env.drive-import.local');
if (existsSync(localEnv)) {
  for (const line of readFileSync(localEnv, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}

const DRY_RUN = process.env.DRY_RUN === '1';
/** 関ヶ谷だより・会報ふれあい以外の PDF も「PDFのまま」号に登録するか（'0' で止める） */
const IMPORT_OTHER_PDFS = process.env.IMPORT_OTHER_PDFS !== '0';
const env = (name, required = true) => {
  const v = process.env[name];
  if (!v && required) throw new Error(`環境変数 ${name} がありません`);
  return v;
};

/** 日本時間の今日（YYYY-MM-DD）と月（YYYYMM） */
const jstNow = () => new Date(Date.now() + 9 * 60 * 60 * 1000);
const ymdJst = () => jstNow().toISOString().slice(0, 10);
const yyyymm = (d) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
const targetMonths = () => {
  if (process.env.MONTHS) return process.env.MONTHS.split(',').map((s) => s.trim()).filter(Boolean);
  const now = jstNow();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return [yyyymm(now), yyyymm(next)];
};
const monthTitle = (month) => {
  const m = month.match(MONTH_RE);
  return `${m[1]}年${Number(m[2])}月号`;
};
const mediaOf = (name) => MEDIA.find((k) => (name ?? '').replace(/[\s　]/g, '').includes(k)) ?? null;
const md5 = (buf) => createHash('md5').update(buf).digest('hex');
/** 号に登録済みの PDF（source_pdf_urls は文字列かオブジェクトの配列） */
const pdfEntriesOf = (newsletter) =>
  (newsletter.source_pdf_urls || []).map((e) => (typeof e === 'string' ? { url: e, label: '' } : { url: e.url, label: e.label || '' }));
/** 「対象外」を取込記録に残す（次回から静かに飛ばすため） */
async function recordSkip(supabase, file, month, media, reason) {
  if (DRY_RUN) return;
  const { error } = await supabase.from('drive_imports').upsert(
    { drive_file_id: file.id, drive_name: file.name, drive_md5: file.md5Checksum ?? null, drive_modified_at: file.modifiedTime, month_folder: month, media, kind: 'source', status: 'skipped', error: reason },
    { onConflict: 'drive_file_id' }
  );
  if (error) console.warn('対象外の記録に失敗:', error.message);
}

// ---- 結果のまとめ（メール本文・ログ） ----
const report = { months: {}, failed: 0, imported: 0, attached: 0, updated: 0, skipped: 0, quiet: 0, images: 0, thumbFailed: 0 };
/**
 * PDF の1ページ目からサムネイルを作って Storage に置き、URL を返す（2026-11-28。それまでは管理画面の「サムネイル生成」で後から作っていた）。
 * 作れなかったときは '' を返す（取り込みは止めない。管理画面で後から作れる）
 */
async function makeThumbnail(supabase, buf, month, name) {
  try {
    const jpg = await renderPdfThumbnail(buf);
    const path = `drive/${month}/thumb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error } = await supabase.storage.from('newsletter-images').upload(path, jpg, { contentType: 'image/jpeg', cacheControl: '3600', upsert: false });
    if (error) throw new Error(error.message);
    return supabase.storage.from('newsletter-images').getPublicUrl(path).data.publicUrl;
  } catch (e) {
    report.thumbFailed++;
    console.warn(`サムネイルを作れませんでした: ${name}: ${e?.message ?? e}`);
    return '';
  }
}
/** 題名の突き合わせ用（空白と全角・半角の違いを無視） */
const normLabel = (v) => (v ?? '').normalize('NFKC').replace(/[\s　]/g, '').toLowerCase();
/** 号に登録済みの PDF の指紋（md5）。同じ中身を手で登録済みかを確かめる。1回の実行の中では覚えておく */
const registeredMd5 = new Map();
async function md5OfUrl(url) {
  if (!registeredMd5.has(url)) {
    try {
      const res = await fetch(url);
      registeredMd5.set(url, res.ok ? md5(Buffer.from(await res.arrayBuffer())) : null);
    } catch {
      registeredMd5.set(url, null);
    }
  }
  return registeredMd5.get(url);
}
/** pic フォルダの画像として扱う種類 */
const isImage = (f) => /^image\/(jpeg|png|webp)$/.test(f.mimeType ?? '') || /\.(jpe?g|png|webp)$/i.test(f.name ?? '');
const extOf = (f) => (/\.(jpe?g|png|webp)$/i.exec(f.name ?? '')?.[1] ?? 'jpg').toLowerCase().replace('jpeg', 'jpg');
const mimeOfExt = (ext) => (ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg');
const note = (month, line) => {
  (report.months[month] ??= []).push(line);
  console.log(`[${month}] ${line}`);
};
/** 前回までに処理済み（取込済み・対象外）のもの。ログには出すがメールの本文には件数だけ */
const quiet = (month, line) => {
  report.quiet++;
  console.log(`[${month}] （処理済み）${line}`);
};

async function main() {
  const months = targetMonths();
  const saKey = env('GDRIVE_SA_KEY');
  const rootId = process.env.GDRIVE_ROOT_FOLDER_ID || DEFAULT_ROOT_FOLDER_ID;
  env('SUPABASE_URL');
  env('SUPABASE_ANON_KEY');
  if (!DRY_RUN) env('ANTHROPIC_API_KEY');

  console.log(`対象の月: ${months.join(', ')}${DRY_RUN ? '（DRY RUN: 何も変更しない）' : ''}`);
  const token = await getAccessToken(saKey);
  const shared = await loadShared();
  const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'));

  // 取込記録（対象の月のぶん）
  const { data: importRows, error: importErr } = await supabase.from('drive_imports').select('*').in('month_folder', months);
  if (importErr) throw new Error(`取込記録（drive_imports）を読めません。sql/migrations/2026-10-26-drive-imports.sql は適用済みですか: ${importErr.message}`);
  const imports = importRows ?? [];

  // 年フォルダ → 月フォルダ
  const rootChildren = await listChildren(token, rootId);
  const yearFolders = rootChildren.filter((f) => isFolder(f) && YEAR_RE.test(f.name));

  let publisherNames = [];
  let newsletters = null; // 必要になったら読む

  for (const month of months) {
    const year = month.slice(0, 4);
    const yearFolder = yearFolders.find((f) => f.name === year);
    if (!yearFolder) {
      note(month, `年フォルダ「${year}」が見つかりません（Drive の「回覧板Data」直下に ${year} フォルダが要ります）`);
      continue;
    }
    const monthFolder = (await listChildren(token, yearFolder.id)).find((f) => isFolder(f) && f.name === month);
    if (!monthFolder) {
      note(month, `月フォルダ「${month}」はまだありません`);
      continue;
    }
    const files = await listChildren(token, monthFolder.id);
    const candidates = files.filter((f) => isPdf(f) && mediaOf(f.name));
    if (candidates.length === 0 && !IMPORT_OTHER_PDFS) {
      note(month, `関ヶ谷だより・会報ふれあいの PDF はまだありません（フォルダ内 ${files.length} 件）`);
    }

    for (const file of candidates) {
      const media = mediaOf(file.name);
      const prev = imports.find((r) => r.drive_file_id === file.id);
      try {
        // 1) 同じファイルを処理済み（取込済み・対象外として記録済み）
        if (prev && prev.status !== 'failed') {
          if (prev.drive_md5 === file.md5Checksum) {
            quiet(month, `${prev.status === 'skipped' ? '対象外' : '取込済み'}: ${file.name}`);
            continue;
          }
          if (prev.status === 'skipped') {
            quiet(month, `対象外（Drive 側で更新あり）: ${file.name}`);
            continue;
          }
          // Drive 側で差し替えられた: 自動ではやり直さず「更新あり」にして知らせる
          if (prev.status !== 'updated') {
            note(month, `⚠ 更新あり: ${file.name} は取り込んだ後に Drive 側で差し替えられています（記事は前の版のまま。直すかは人が決める）`);
            report.updated++;
            if (!DRY_RUN) await supabase.from('drive_imports').update({ status: 'updated', drive_name: file.name, drive_modified_at: file.modifiedTime }).eq('id', prev.id);
          } else {
            quiet(month, `更新あり（通知済み）: ${file.name}`);
          }
          continue;
        }
        // 2) 同じ号・同じ媒体をもう取り込んでいる（修正版が別ファイルで置かれた等）: 取り込まず知らせる
        const sameMedia = imports.find((r) => r.month_folder === month && r.media === media && r.status === 'imported' && r.drive_file_id !== file.id);
        if (sameMedia) {
          note(month, `⚠ 取り込まず: ${file.name} は「${media}」の2本目です（取込済み: ${sameMedia.drive_name}）。差し替えるなら管理画面で手で行ってください`);
          report.skipped++;
          if (!DRY_RUN && !imports.some((r) => r.drive_file_id === file.id)) {
            await supabase.from('drive_imports').insert({
              drive_file_id: file.id, drive_name: file.name, drive_md5: file.md5Checksum ?? null, drive_modified_at: file.modifiedTime,
              month_folder: month, media, kind: 'source', status: 'skipped', error: `同じ媒体を取込済み: ${sameMedia.drive_name}`,
            });
          }
          continue;
        }

        // 3) 号を決めて止め具を通す（DRY RUN でもここまでは同じ判定をする）
        //    同じ題名が下書きと公開版の両方にあれば下書き（編集中のコピー）を選ぶ
        newsletters ??= await shared.getNewsletters();
        const title = monthTitle(month);
        const sameTitle = newsletters.filter((n) => n.status !== 'archived' && n.title.replace(/\s/g, '') === title);
        let newsletter = sameTitle.find((n) => n.status === 'draft') ?? sameTitle[0];

        // 止め具1: 公開済みの号には自動で足さない（人が入れた記事と二重になるため）
        if (newsletter && newsletter.status !== 'draft') {
          note(month, `対象外: ${file.name} → 号「${newsletter.title}」は公開済みなので自動では足しません（直すなら管理画面の「その場で直す」から手で）`);
          report.skipped++;
          await recordSkip(supabase, file, month, media, `号「${newsletter.title}」は公開済み`);
          continue;
        }
        // 止め具2: 下書きの号に、同じ媒体の PDF が手で登録済みなら足さない
        const manual = newsletter ? pdfEntriesOf(newsletter).find((e) => mediaOf(e.label) === media || mediaOf(decodeURIComponent(e.url ?? '')) === media) : null;
        if (manual) {
          note(month, `対象外: ${file.name} → 号「${newsletter.title}」には「${manual.label || media}」が手で登録済みです（二重になるので足しません）`);
          report.skipped++;
          await recordSkip(supabase, file, month, media, `手で登録済み: ${manual.label || media}`);
          continue;
        }

        // 4) 取り込む
        note(month, `取り込み開始: ${file.name}（${Math.round((Number(file.size) || 0) / 1024)} KB）`);
        if (!newsletter) {
          if (DRY_RUN) {
            note(month, `  → DRY RUN: 号「${title}」を下書きで作り、PDF を登録して記事化します`);
            report.imported++;
            continue;
          }
          const saved = await shared.saveNewsletter(
            {
              organization_id: process.env.DEFAULT_ORGANIZATION_ID || null,
              title,
              issue_date: ymdJst(),
              source_pdf_url: null,
              status: 'draft',
              created_by: null,
              published_at: null,
              parent_id: null,
            },
            []
          );
          newsletter = saved.newsletter;
          newsletters.push(newsletter);
          note(month, `  号「${title}」を下書きで作りました`);
        } else {
          if (DRY_RUN) {
            note(month, `  → DRY RUN: 下書きの号「${newsletter.title}」に PDF を登録して記事化します`);
            report.imported++;
            continue;
          }
          note(month, `  下書きの号「${newsletter.title}」に足します`);
        }

        // PDF をダウンロードして Storage に保存
        const buf = await downloadFile(token, file.id);
        const hash = md5(buf);
        const pdfFile = new File([buf], file.name, { type: 'application/pdf' });
        const fallbackTitle = file.name.replace(/\.pdf$/i, '');
        const uploaded = await shared.uploadPDF(pdfFile, fallbackTitle);
        const base64 = buf.toString('base64');

        // 題名・号数・発行元（人が「PDF情報を入力」で確認していたもの。ここでは AI の提案をそのまま使い、あとで直せる）
        let label = fallbackTitle;
        let publisher = '';
        try {
          if (publisherNames.length === 0) publisherNames = await shared.getPublisherNames().catch(() => []);
          const meta = await shared.extractPDFMetadata(base64, publisherNames);
          if (meta.suggestedTitle) label = meta.suggestedIssueNumber ? `${meta.suggestedTitle} ${meta.suggestedIssueNumber}` : meta.suggestedTitle;
          publisher = meta.suggestedPublisher || '';
        } catch (e) {
          note(month, `  題名の読み取りに失敗（ファイル名を使います）: ${e?.message ?? e}`);
        }
        const thumbUrl = await makeThumbnail(supabase, buf, month, file.name);
        Object.assign(newsletter, await shared.addPdfUrlToNewsletter(newsletter.id, uploaded.url, label, publisher, 'source', thumbUrl));
        registeredMd5.set(uploaded.url, hash);

        // 記事化（本番の「確定して記事を抽出」と同じ）
        const result = await shared.extractArticlesFromPDF(base64, shared.MOCK_CATEGORIES);
        const articles = result.articles.map((a) => ({
          organization_id: 'org1',
          ...a,
          article_type: 'official',
          source: label,
          thumbnail_url: null,
        }));
        const savedArticles = articles.length > 0 ? await shared.addArticlesToNewsletter(newsletter.id, articles) : [];

        await supabase.from('drive_imports').insert({
          drive_file_id: file.id, drive_name: file.name, drive_md5: file.md5Checksum ?? hash, drive_modified_at: file.modifiedTime,
          month_folder: month, media, kind: 'source', newsletter_id: newsletter.id, pdf_url: uploaded.url, pdf_label: label,
          articles_created: savedArticles.length, status: 'imported',
        });
        imports.push({ drive_file_id: file.id, drive_name: file.name, drive_md5: file.md5Checksum ?? hash, month_folder: month, media, kind: 'source', status: 'imported' });
        report.imported++;
        note(month, `  ✅ 「${label}」を登録し、記事を ${savedArticles.length} 件作りました（${Math.round(result.processingTime / 1000)} 秒）`);
      } catch (e) {
        report.failed++;
        const msg = e?.message ?? String(e);
        note(month, `❌ 失敗: ${file.name}: ${msg}`);
        if (!DRY_RUN) {
          await supabase.from('drive_imports').upsert(
            { drive_file_id: file.id, drive_name: file.name, drive_md5: file.md5Checksum ?? null, drive_modified_at: file.modifiedTime, month_folder: month, media, kind: 'source', status: 'failed', error: msg.slice(0, 1000) },
            { onConflict: 'drive_file_id' }
          ).then(({ error }) => error && console.warn('失敗の記録に失敗:', error.message));
        }
      }
    }

    // ---- それ以外の PDF（学校だより・チラシなど）→ 記事にはせず「PDFのまま」その月の下書きの号に登録（2026-11-28） ----
    // 止め具: 公開済みの号には足さない／同じ中身（md5）は1回だけ／同じ題名が登録済みなら足さない／Drive 側の差し替えは知らせるだけ
    const others = IMPORT_OTHER_PDFS ? files.filter((f) => isPdf(f) && !mediaOf(f.name)) : [];
    for (const file of others) {
      const prev = imports.find((r) => r.drive_file_id === file.id);
      const rec = { drive_file_id: file.id, drive_name: file.name, drive_md5: file.md5Checksum ?? null, drive_modified_at: file.modifiedTime, month_folder: month, media: null, kind: 'attachment' };
      const skip = async (line, reason) => {
        note(month, line);
        report.skipped++;
        if (!DRY_RUN) {
          const { error } = await supabase.from('drive_imports').upsert({ ...rec, status: 'skipped', error: reason }, { onConflict: 'drive_file_id' });
          if (error) console.warn('対象外の記録に失敗:', error.message);
        }
        imports.push({ ...rec, status: 'skipped' });
      };
      try {
        // 1) 同じファイルを処理済み
        if (prev && prev.status !== 'failed') {
          if (prev.drive_md5 === file.md5Checksum || prev.status === 'skipped') {
            quiet(month, `${prev.status === 'skipped' ? '対象外' : '登録済み'}: ${file.name}`);
          } else if (prev.status !== 'updated') {
            note(month, `⚠ 更新あり: ${file.name} は登録した後に Drive 側で差し替えられています（号の PDF は前の版のまま。差し替えるなら管理画面で手で）`);
            report.updated++;
            if (!DRY_RUN) await supabase.from('drive_imports').update({ status: 'updated', drive_name: file.name, drive_modified_at: file.modifiedTime }).eq('id', prev.id);
          } else {
            quiet(month, `更新あり（通知済み）: ${file.name}`);
          }
          continue;
        }
        // 2) 同じ中身の PDF を、この月にもう登録している（別名で重ねて置かれた等）
        const twin = file.md5Checksum ? imports.find((r) => r.month_folder === month && r.status === 'imported' && r.drive_md5 === file.md5Checksum && r.drive_file_id !== file.id) : null;
        if (twin) {
          await skip(`取り込まず: ${file.name} は「${twin.drive_name}」と同じ中身です（重複）`, `同じ中身を登録済み: ${twin.drive_name}`);
          continue;
        }
        // 3) 号を決める（下書きを優先。公開済みの号には足さない）
        newsletters ??= await shared.getNewsletters();
        const title = monthTitle(month);
        const sameTitle = newsletters.filter((n) => n.status !== 'archived' && n.title.replace(/\s/g, '') === title);
        let newsletter = sameTitle.find((n) => n.status === 'draft') ?? sameTitle[0];
        if (newsletter && newsletter.status !== 'draft') {
          await skip(`対象外: ${file.name} → 号「${newsletter.title}」は公開済みなので自動では足しません`, `号「${newsletter.title}」は公開済み`);
          continue;
        }
        if (DRY_RUN) {
          note(month, `PDFのまま登録: ${file.name} → DRY RUN: ${newsletter ? `下書きの号「${newsletter.title}」` : `号「${title}」を下書きで作って`}に登録します（記事にはしません）`);
          report.attached++;
          continue;
        }

        // 4) ダウンロードして、同じ中身が手で登録済みでないかを確かめる
        const buf = await downloadFile(token, file.id);
        const hash = md5(buf);
        rec.drive_md5 = file.md5Checksum ?? hash;
        const entries = newsletter ? pdfEntriesOf(newsletter) : [];
        let sameBody = null;
        for (const e of entries) {
          if (e.url && (await md5OfUrl(e.url)) === hash) {
            sameBody = e;
            break;
          }
        }
        if (sameBody) {
          await skip(`対象外: ${file.name} → 号「${newsletter.title}」に同じ PDF（${sameBody.label || '題名なし'}）が登録済みです`, `同じ中身が登録済み: ${sameBody.label || ''}`);
          continue;
        }

        // 5) 題名・発行元（AI の提案。あとで管理画面で直せる）。同じ題名が登録済みなら足さない（修正版が別ファイルで置かれた等）
        const fallbackTitle = file.name.replace(/\.pdf$/i, '');
        let label = fallbackTitle;
        let publisher = '';
        try {
          if (publisherNames.length === 0) publisherNames = await shared.getPublisherNames().catch(() => []);
          const meta = await shared.extractPDFMetadata(buf.toString('base64'), publisherNames);
          if (meta.suggestedTitle) label = meta.suggestedIssueNumber ? `${meta.suggestedTitle} ${meta.suggestedIssueNumber}` : meta.suggestedTitle;
          publisher = meta.suggestedPublisher || '';
        } catch (e) {
          note(month, `題名の読み取りに失敗（ファイル名を使います）: ${file.name}: ${e?.message ?? e}`);
        }
        const sameLabel = entries.find((e) => e.label && normLabel(e.label) === normLabel(label));
        if (sameLabel) {
          await skip(`⚠ 取り込まず: ${file.name} → 号「${newsletter.title}」に同じ題名の PDF（${sameLabel.label}）が登録済みです。差し替えるなら管理画面で手で行ってください`, `同じ題名が登録済み: ${sameLabel.label}`);
          continue;
        }

        // 6) 号が無ければ下書きで作り、PDF を「PDFのまま」（attachment）で登録する
        if (!newsletter) {
          const saved = await shared.saveNewsletter(
            { organization_id: process.env.DEFAULT_ORGANIZATION_ID || null, title, issue_date: ymdJst(), source_pdf_url: null, status: 'draft', created_by: null, published_at: null, parent_id: null },
            []
          );
          newsletter = saved.newsletter;
          newsletters.push(newsletter);
          note(month, `号「${title}」を下書きで作りました`);
        }
        const uploaded = await shared.uploadPDF(new File([buf], file.name, { type: 'application/pdf' }), fallbackTitle);
        registeredMd5.set(uploaded.url, hash);
        const thumbUrl = await makeThumbnail(supabase, buf, month, file.name);
        Object.assign(newsletter, await shared.addPdfUrlToNewsletter(newsletter.id, uploaded.url, label, publisher, 'attachment', thumbUrl));
        const { error: recErr } = await supabase.from('drive_imports').upsert(
          { ...rec, newsletter_id: newsletter.id, pdf_url: uploaded.url, pdf_label: label, articles_created: 0, status: 'imported', error: null },
          { onConflict: 'drive_file_id' }
        );
        if (recErr) console.warn('取込記録の保存に失敗:', recErr.message);
        imports.push({ ...rec, status: 'imported' });
        report.attached++;
        note(month, `✅ PDFのまま登録: 「${label}」${publisher ? `（${publisher}）` : '（発行元は未設定）'} ← ${file.name}`);
      } catch (e) {
        report.failed++;
        const msg = e?.message ?? String(e);
        note(month, `❌ 失敗: ${file.name}: ${msg}`);
        if (!DRY_RUN) {
          await supabase
            .from('drive_imports')
            .upsert({ ...rec, status: 'failed', error: msg.slice(0, 1000) }, { onConflict: 'drive_file_id' })
            .then(({ error }) => error && console.warn('失敗の記録に失敗:', error.message));
        }
      }
    }

    // ---- pic フォルダの写真 → その号の「保留画像」（管理画面の「Drive の写真を記事に付ける」で記事に付ける） ----
    const picFolder = files.find((f) => isFolder(f) && f.name.toLowerCase() === 'pic');
    if (picFolder) {
      const pics = (await listChildren(token, picFolder.id)).filter(isImage);
      for (const file of pics) {
        const prev = imports.find((r) => r.drive_file_id === file.id);
        if (prev && prev.status !== 'failed') {
          quiet(month, `写真は処理済み: ${file.name}`);
          continue;
        }
        try {
          newsletters ??= await shared.getNewsletters();
          const title = monthTitle(month);
          const sameTitle = newsletters.filter((n) => n.status !== 'archived' && n.title.replace(/\s/g, '') === title);
          const newsletter = sameTitle.find((n) => n.status === 'draft');
          if (!newsletter) {
            note(month, `写真はあとで: ${file.name} → 号「${title}」の下書きがまだ無い${sameTitle.length > 0 ? '（公開済みの号には自動では入れません）' : ''}ので、下書きができてから入れます`);
            continue;
          }
          note(month, `写真を取り込み: ${file.name}（${Math.round((Number(file.size) || 0) / 1024)} KB）→ 号「${newsletter.title}」の保留画像`);
          if (DRY_RUN) {
            report.images++;
            continue;
          }
          const buf = await downloadFile(token, file.id);
          const ext = extOf(file);
          const path = `drive/${month}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
          const { error: upErr } = await supabase.storage.from('newsletter-images').upload(path, buf, { contentType: mimeOfExt(ext), cacheControl: '3600', upsert: false });
          if (upErr) throw new Error(`画像の保存に失敗: ${upErr.message}`);
          const { data: pub } = supabase.storage.from('newsletter-images').getPublicUrl(path);
          const { error: insErr } = await supabase.from('pending_images').insert({
            newsletter_id: newsletter.id,
            organization_id: null,
            image_url: pub.publicUrl,
            storage_path: path,
            caption: file.name.replace(/\.[^.]+$/, ''),
            page_number: 0,
            position_info: null,
            detected_context: 'Google Drive の pic フォルダから自動取り込み',
            suggested_article_ids: [],
            confidence_score: 0,
            status: 'pending',
            assigned_to_article_id: null,
          });
          if (insErr) throw new Error(`保留画像の登録に失敗: ${insErr.message}`);
          await supabase.from('drive_imports').upsert(
            { drive_file_id: file.id, drive_name: file.name, drive_md5: file.md5Checksum ?? null, drive_modified_at: file.modifiedTime, month_folder: month, media: null, kind: 'image', newsletter_id: newsletter.id, pdf_url: pub.publicUrl, pdf_label: file.name, status: 'imported' },
            { onConflict: 'drive_file_id' }
          );
          report.images++;
          note(month, `  ✅ 保留画像に入れました。管理画面の号の画面「Drive の写真を記事に付ける」から記事に付けられます`);
        } catch (e) {
          report.failed++;
          const msg = e?.message ?? String(e);
          note(month, `❌ 写真の取り込みに失敗: ${file.name}: ${msg}`);
          if (!DRY_RUN) {
            await supabase.from('drive_imports').upsert(
              { drive_file_id: file.id, drive_name: file.name, drive_md5: file.md5Checksum ?? null, drive_modified_at: file.modifiedTime, month_folder: month, media: null, kind: 'image', status: 'failed', error: msg.slice(0, 1000) },
              { onConflict: 'drive_file_id' }
            ).then(({ error }) => error && console.warn('失敗の記録に失敗:', error.message));
          }
        }
      }
    }
  }

  // ---- まとめ ----
  const lines = [];
  const anyChange = report.imported + report.attached + report.images + report.updated + report.skipped + report.failed > 0;
  const head = [report.imported > 0 ? `記事にした PDF ${report.imported} 本` : null, report.attached > 0 ? `PDFのまま ${report.attached} 本` : null, report.images > 0 ? `写真 ${report.images} 枚` : null].filter(Boolean).join('・');
  lines.push(
    report.failed > 0 ? `❌ 失敗 ${report.failed} 件があります` : head ? `✅ 取り込み: ${head}` : anyChange ? '取り込みはありません（お知らせがあります）' : '新着はありませんでした'
  );
  if (report.quiet > 0) lines.push(`（処理済みで飛ばしたもの ${report.quiet} 件）`);
  for (const [month, ls] of Object.entries(report.months)) {
    lines.push('', `## ${monthTitle(month)}（フォルダ ${month}）`, ...ls.map((l) => `- ${l}`));
  }
  if (report.attached > 0) lines.push('', '「PDFのまま登録」した PDF は、題名と発行元が AI の提案です。号の画面で確かめ、要らないものは削除してください。');
  if (report.thumbFailed > 0) lines.push('', `サムネイルを作れなかった PDF が ${report.thumbFailed} 本あります。号の画面の「サムネイル生成」で作れます。`);
  lines.push('', '管理画面: https://sekigayajichikai.vercel.app/admin（回覧板タブ → その号を開いて記事を確認。公開は人が行います）');
  const summary = lines.join('\n');
  console.log('\n' + summary);
  if (process.env.SUMMARY_FILE) writeFileSync(process.env.SUMMARY_FILE, summary, 'utf8');

  // GitHub Actions 向け: メールを送るか（変化があったとき、または 25日〜月末は「新着なし」でも送って動いていることを知らせる）
  const day = jstNow().getUTCDate();
  const notify = anyChange || day >= 25;
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `notify=${notify}\nsubject=${DRY_RUN ? '【試し】' : ''}${report.failed > 0 ? '【要確認】' : ''}回覧板ポータル Drive 取り込み: ${lines[0]}\n`);
  }
  if (report.failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error('❌ 取り込み全体が失敗しました:', e);
  const msg = `❌ 取り込み全体が失敗しました: ${e?.message ?? e}`;
  if (process.env.SUMMARY_FILE) writeFileSync(process.env.SUMMARY_FILE, msg, 'utf8');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `notify=true\nsubject=【要確認】回覧板ポータル Drive 取り込みが失敗\n`);
  process.exitCode = 1;
});
