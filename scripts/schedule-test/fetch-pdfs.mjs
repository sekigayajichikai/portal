/**
 * テスト用: 指定した号の添付PDF(地域のお知らせ=attachment)をローカルに落とす。
 * API課金なしでClaude CodeのHaikuサブエージェントに読ませて抽出テストするための準備。
 *
 * 使い方:
 *   node scripts/schedule-test/fetch-pdfs.mjs "2026年8月号"
 *   （引数なしなら最新の下書きを対象）
 *
 * .env.development.local の VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY を使用（読み取りのみ）。
 * 落としたPDFは scripts/schedule-test/pdfs/ に保存し、manifest.json に一覧(発行元・種別・基準日)を書く。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const OUT = path.join(HERE, 'pdfs');

function readEnv() {
  const txt = fs.readFileSync(path.join(ROOT, '.env.development.local'), 'utf8');
  const get = (k) =>
    (txt.split(/\r?\n/).find((l) => l.startsWith(k + '=')) || '').slice(k.length + 1).trim().replace(/^"|"$/g, '');
  return { url: get('VITE_SUPABASE_URL'), key: get('VITE_SUPABASE_ANON_KEY') };
}

async function sb(env, pathAndQuery) {
  const res = await fetch(`${env.url}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: env.key, authorization: `Bearer ${env.key}` },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

const titleArg = process.argv[2];

const env = readEnv();

// 対象号を決める
let rows;
if (titleArg) {
  rows = await sb(env, `newsletters?select=id,title,issue_date,status,source_pdf_urls&title=eq.${encodeURIComponent(titleArg)}`);
} else {
  rows = await sb(env, `newsletters?select=id,title,issue_date,status,source_pdf_urls&status=eq.draft&order=issue_date.desc&limit=1`);
}
if (!rows.length) {
  console.error('対象の号が見つかりません:', titleArg || '(最新下書き)');
  process.exit(1);
}
const nl = rows[0];
console.log(`対象: ${nl.title} (${nl.status}) 発行日=${nl.issue_date}`);

// attachment(地域のお知らせ)のみ。source(自治会=記事化済み)は除外
const entries = Array.isArray(nl.source_pdf_urls) ? nl.source_pdf_urls : [];
const targets = entries
  .map((e) => (typeof e === 'string' ? { url: e, label: '', publisher: '', type: 'attachment' } : e))
  .filter((e) => e?.url && e.type !== 'source');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const manifest = { newsletter: nl.title, issue_date: nl.issue_date, pdfs: [] };
let i = 0;
for (const t of targets) {
  i++;
  const res = await fetch(t.url);
  if (!res.ok) {
    console.warn(`  skip(${res.status}): ${t.label || t.url}`);
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const name = `${String(i).padStart(2, '0')}.pdf`;
  fs.writeFileSync(path.join(OUT, name), buf);
  manifest.pdfs.push({
    file: name,
    label: t.label || '',
    publisher: t.publisher || '',
    isJichikai: t.type === 'source',
    sizeMB: +(buf.length / 1024 / 1024).toFixed(2),
  });
  console.log(`  saved ${name}  ${t.label || '(no label)'}  ${(buf.length / 1024 / 1024).toFixed(1)}MB`);
}

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\n${manifest.pdfs.length}件を ${path.relative(ROOT, OUT)} に保存。manifest.json に一覧を書きました。`);
