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
const report = { months: {}, failed: 0, imported: 0, updated: 0, skipped: 0, quiet: 0 };
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
    if (candidates.length === 0) {
      note(month, `関ヶ谷だより・会報ふれあいの PDF はまだありません（フォルダ内 ${files.length} 件）`);
      continue;
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

        // 3) 取り込む
        note(month, `取り込み開始: ${file.name}（${Math.round((Number(file.size) || 0) / 1024)} KB）`);
        if (DRY_RUN) {
          note(month, `  → DRY RUN: 「${monthTitle(month)}」に PDF を登録し、記事化します`);
          report.imported++;
          continue;
        }

        // 号（無ければ下書きで作る）。同じ題名が下書きと公開版の両方にあれば下書き（編集中のコピー）を選ぶ
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

        if (!newsletter) {
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
          note(month, `  号「${newsletter.title}」（${newsletter.status === 'draft' ? '下書き' : newsletter.status}）に足します`);
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
        await shared.addPdfUrlToNewsletter(newsletter.id, uploaded.url, label, publisher, 'source');

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
  }

  // ---- まとめ ----
  const lines = [];
  const anyChange = report.imported + report.updated + report.skipped + report.failed > 0;
  lines.push(
    report.failed > 0 ? `❌ 失敗 ${report.failed} 件があります` : report.imported > 0 ? `✅ 取り込み ${report.imported} 件` : anyChange ? '取り込みはありません（お知らせがあります）' : '新着はありませんでした'
  );
  if (report.quiet > 0) lines.push(`（処理済みで飛ばしたもの ${report.quiet} 件）`);
  for (const [month, ls] of Object.entries(report.months)) {
    lines.push('', `## ${monthTitle(month)}（フォルダ ${month}）`, ...ls.map((l) => `- ${l}`));
  }
  lines.push('', '管理画面: https://sekigayajichikai.vercel.app/admin（回覧板タブ → その号を開いて記事を確認。公開は人が行います）');
  const summary = lines.join('\n');
  console.log('\n' + summary);
  if (process.env.SUMMARY_FILE) writeFileSync(process.env.SUMMARY_FILE, summary, 'utf8');

  // GitHub Actions 向け: メールを送るか（変化があったとき、または 25日〜月末は「新着なし」でも送って動いていることを知らせる）
  const day = jstNow().getUTCDate();
  const notify = anyChange || day >= 25;
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `notify=${notify}\nsubject=${report.failed > 0 ? '【要確認】' : ''}回覧板ポータル Drive 取り込み: ${lines[0]}\n`);
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
