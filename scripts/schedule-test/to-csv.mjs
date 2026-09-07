/**
 * 抽出テスト結果(results/*.json)を1つの比較CSV(Excelで開ける)にまとめる。
 * プロンプトを変えて何度か抽出→結果を results/<プロンプト名>.json に保存→本スクリプトでCSV化。
 * promptLabel 列でプロンプト版を区別できるので、Excelのフィルタ/ピボットで差分を比較できる。
 *
 * 使い方:
 *   node scripts/schedule-test/to-csv.mjs                 # results/*.json 全部 → results/compare.csv
 *   node scripts/schedule-test/to-csv.mjs A.json B.json   # 指定ファイルのみ
 *
 * results/<name>.json の形式（Claude Codeが抽出結果を書き出す想定）:
 * {
 *   "promptLabel": "v1-baseline",     // プロンプト版の名前（列に入る）
 *   "folder": "2026-08",              // 任意
 *   "results": [
 *     { "file": "15.pdf", "label": "にしかぜ 第208号",
 *       "events": [ { "title": "...", "event_date": "2026-09-10", "event_time": "...",
 *                     "event_location": "...", "organizer": "...", "category": "open", "has_details": true } ] }
 *   ]
 * }
 * ※ events を直接持つ簡易形（{promptLabel, events:[...]}）にも対応。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(HERE, 'results');

const args = process.argv.slice(2);
let files;
if (args.length) {
  files = args.map((a) => (path.isAbsolute(a) ? a : path.join(RESULTS_DIR, a)));
} else {
  if (!fs.existsSync(RESULTS_DIR)) {
    console.error(`results フォルダがありません: ${path.relative(path.resolve(HERE, '../..'), RESULTS_DIR)}`);
    console.error('先に抽出結果を results/<プロンプト名>.json として保存してください。');
    process.exit(1);
  }
  files = fs.readdirSync(RESULTS_DIR).filter((f) => f.endsWith('.json')).map((f) => path.join(RESULTS_DIR, f));
}
if (!files.length) {
  console.error('対象のjsonがありません。');
  process.exit(1);
}

const COLS = ['promptLabel', 'file', 'source_label', 'title', 'event_date', 'event_time', 'event_location', 'organizer', 'category', 'has_details'];

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const rows = [];
for (const fp of files) {
  let json;
  try {
    json = JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch (e) {
    console.warn(`skip(壊れたJSON): ${path.basename(fp)} ${e.message}`);
    continue;
  }
  const promptLabel = json.promptLabel || path.basename(fp, '.json');
  const perFile = json.results
    ? json.results
    : Array.isArray(json.events)
      ? [{ file: json.file || '', label: json.label || '', events: json.events }]
      : [];
  for (const r of perFile) {
    for (const e of r.events || []) {
      rows.push([
        promptLabel,
        r.file || '',
        r.label || '',
        e.title ?? '',
        e.event_date ?? '',
        e.event_time ?? '',
        e.event_location ?? '',
        e.organizer ?? '',
        e.category ?? '',
        e.has_details === undefined ? '' : e.has_details,
      ]);
    }
  }
}

// 見やすいよう promptLabel→file→date で並べる
rows.sort((a, b) =>
  (a[0] + a[1] + a[4]).localeCompare(b[0] + b[1] + b[4], 'ja')
);

const csv = [COLS.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\r\n');
const out = path.join(RESULTS_DIR, 'compare.csv');
fs.mkdirSync(RESULTS_DIR, { recursive: true });
// ExcelでUTF-8を正しく開くためBOMを付与
fs.writeFileSync(out, '﻿' + csv, 'utf8');
console.log(`CSVを書き出しました: ${path.relative(path.resolve(HERE, '../..'), out)}  （${rows.length}行）`);
console.log('Excelでそのまま開けます（promptLabel列でプロンプト版を比較）。');
