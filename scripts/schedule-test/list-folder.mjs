/**
 * 指定フォルダ内のPDFを一覧化する（手動で置いたPDFの検証準備）。
 * 使い方:  node scripts/schedule-test/list-folder.mjs 2026-08
 *   → scripts/schedule-test/pdfs/2026-08/ 内の *.pdf を列挙し、
 *     manifest.json が無ければ雛形を作る（発行元・種別・基準日は空欄で吐くので必要なら手で埋める）。
 *
 * 検証自体は Claude Code(Haiku) が Read で行うため、このスクリプトは課金なし・準備専用。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const sub = process.argv[2];
if (!sub) {
  console.error('使い方: node scripts/schedule-test/list-folder.mjs <フォルダ名>  (例: 2026-08)');
  process.exit(1);
}
const dir = path.join(HERE, 'pdfs', sub);
if (!fs.existsSync(dir)) {
  console.error('フォルダが見つかりません:', path.relative(path.resolve(HERE, '../..'), dir));
  process.exit(1);
}

const pdfs = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.pdf')).sort();
console.log(`フォルダ: pdfs/${sub}  PDF ${pdfs.length}件`);
for (const f of pdfs) {
  const mb = (fs.statSync(path.join(dir, f)).size / 1024 / 1024).toFixed(1);
  console.log(`  ${f}  ${mb}MB`);
}

const mfPath = path.join(dir, 'manifest.json');
if (!fs.existsSync(mfPath)) {
  const mf = {
    folder: sub,
    issue_date: '',          // 発行日 YYYY-MM-DD（分かれば手で埋める）
    today: '',               // 本日 YYYY-MM-DD（空なら実行時に指定）
    pdfs: pdfs.map((f) => ({ file: f, label: '', publisher: '', isJichikai: false })),
  };
  fs.writeFileSync(mfPath, JSON.stringify(mf, null, 2));
  console.log(`\nmanifest.json の雛形を作りました（issue_date / isJichikai は必要なら編集）。`);
} else {
  console.log(`\nmanifest.json は既にあります。`);
}
