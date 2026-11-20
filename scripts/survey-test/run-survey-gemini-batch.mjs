/**
 * アンケート回答用紙を「複数枚まとめて 1 回」で Gemini に読ませる試し（2026-11-20、要件定義の試し読み用。本番コードではない）
 *
 * 使い方（CC-SaaS 直下で）:
 *   node scripts/survey-test/run-survey-gemini-batch.mjs "<画像フォルダ>" "<プロンプト.md>" "<出力フォルダ>" [model] [ラベル] [ファイル名の絞り込み] [1回あたりの枚数=5]
 *
 * - 1 回の呼び出しに N 枚の画像を「【票 k: ファイル名】」のラベル付きで並べ、票ごとの配列で返してもらう
 * - 返ってきた件数・票名が送った順と一致するかを機械的に確かめ、ずれていれば error にする
 * - 出力は run-survey-gemini.mjs と同じ形（results[].sheet / result）なので compare.py がそのまま使える
 * - 1 回の呼び出し = 無料枠 1 回。N 枚でも 1 回しか消費しない
 */

import { GoogleGenAI, Type } from '@google/genai';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const [imgDir, promptPath, outDir, model = 'gemini-3.8-flash', label = `batch-${model}`, only = '', batchArg = '5'] = process.argv.slice(2);
if (!imgDir || !promptPath || !outDir) {
  console.error('使い方: node scripts/survey-test/run-survey-gemini-batch.mjs "<画像フォルダ>" "<プロンプト.md>" "<出力フォルダ>" [model] [label] [only] [batch]');
  process.exit(1);
}
const BATCH = Math.max(1, Number(batchArg) || 5);

const env = Object.fromEntries(
  readFileSync(resolve(ROOT, '.env.development.local'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);
if (!env.VITE_GEMINI_API_KEY) {
  console.error('.env.development.local に VITE_GEMINI_API_KEY がありません');
  process.exit(1);
}
const ai = new GoogleGenAI({ apiKey: env.VITE_GEMINI_API_KEY });

const basePrompt = readFileSync(promptPath, 'utf8');

const Q = Array.from({ length: 16 }, (_, i) => `q${i + 1}`);
const answersProps = Object.fromEntries(
  Q.map((q) => [q, q === 'q16' ? { type: Type.STRING } : { type: Type.ARRAY, items: { type: Type.INTEGER } }])
);
const confProps = Object.fromEntries(Q.map((q) => [q, { type: Type.STRING, enum: ['high', 'mid', 'low'] }]));
const sheetSchema = {
  type: Type.OBJECT,
  properties: {
    sheet: { type: Type.STRING, description: '画像の前に付けたラベルの票名（例: scan1_p01）' },
    answers: { type: Type.OBJECT, properties: answersProps, required: Q },
    confidence: { type: Type.OBJECT, properties: confProps, required: Q },
    flags: { type: Type.ARRAY, items: { type: Type.STRING } },
    blank: { type: Type.BOOLEAN },
  },
  required: ['sheet', 'answers', 'confidence', 'flags', 'blank'],
};
const responseSchema = {
  type: Type.OBJECT,
  properties: { sheets: { type: Type.ARRAY, items: sheetSchema } },
  required: ['sheets'],
};

const onlySet = only ? new Set(only.split(',').map((s) => s.trim()).filter(Boolean)) : null;
const files = readdirSync(imgDir)
  .filter((f) => /\.(png|jpe?g)$/i.test(f))
  .filter((f) => !onlySet || onlySet.has(f.replace(/\.(png|jpe?g)$/i, '')))
  .sort();
if (files.length === 0) {
  console.error('対象の画像がありません');
  process.exit(1);
}
console.log(`${files.length} 枚を ${model} で ${BATCH} 枚ずつまとめて読み取り（${label}）`);

const MIN_GAP_MS = Number(process.env.GEMINI_MIN_GAP_MS ?? 13000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function generateWithRetry(request, maxAttempts = 4) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await ai.models.generateContent(request);
    } catch (e) {
      lastErr = e;
      const msg = String(e?.message ?? e);
      const retryable = /429|503|RESOURCE_EXHAUSTED|UNAVAILABLE|high demand|quota/i.test(msg);
      if (!retryable || attempt === maxAttempts) throw e;
      const m = msg.match(/retry in ([\d.]+)s/i) ?? msg.match(/"retryDelay":"(\d+)s"/);
      const wait = m ? Math.ceil(Number(m[1]) * 1000) + 1000 : 15000 * attempt;
      console.log(`   ↻ ${/503|UNAVAILABLE|high demand/i.test(msg) ? '高負荷(503)' : 'レート制限(429)'} → ${Math.round(wait / 1000)}秒待って再試行 (${attempt}/${maxAttempts - 1})`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

mkdirSync(outDir, { recursive: true });
const outJson = resolve(outDir, `${label}.json`);
const results = [];
let totalIn = 0, totalOut = 0, totalThink = 0, calls = 0;

function save() {
  const out = { label, model, prompt: basename(promptPath), batch: BATCH, calls, run_at: new Date().toISOString(), usage_total: { input: totalIn, output: totalOut, thinking: totalThink }, results };
  writeFileSync(outJson, JSON.stringify(out, null, 2), 'utf8');
  const csvRows = [['票ID', ...Q, 'blank', '要確認', 'flags', 'error'].join(',')];
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  for (const r of results) {
    const a = r.result?.answers ?? {};
    const c = r.result?.confidence ?? {};
    const lows = Object.entries(c).filter(([, v]) => v !== 'high').map(([k, v]) => `${k}:${v}`).join(' ');
    csvRows.push([
      r.sheet,
      ...Q.map((q) => (q === 'q16' ? cell(a.q16) : cell((a[q] ?? []).join(',')))),
      r.result ? String(r.result.blank) : '',
      cell(lows),
      cell((r.result?.flags ?? []).join(' / ')),
      cell(r.error ?? ''),
    ].join(','));
  }
  writeFileSync(resolve(outDir, `${label}.csv`), '﻿' + csvRows.join('\r\n'), 'utf8');
}

// 1 票用の指示文を「複数票」用に書き換える: 冒頭の 1 文を差し替え、末尾に配列で返す指示を足す
const batchPrompt =
  basePrompt.replace(/^これは自治会アンケートの回答用紙を1枚スキャンした画像です。/m, 'これは自治会アンケートの回答用紙を複数枚スキャンした画像です。画像の直前に「【票 k: 票名】」というラベルを付けてあります。') +
  `

複数票の返し方
- 票ごとに 1 要素とし、送った順番どおりに sheets 配列で返す。要素数は送った枚数と必ず同じにする。
- 各要素の sheet には、その画像の直前のラベルにある票名（例: scan1_p01）をそのまま書く。
- 票どうしで答えを混ぜない。1 枚ずつ独立に読み、迷ったらその票の confidence を下げる。`;

let lastStart = 0;
for (let i = 0; i < files.length; i += BATCH) {
  const group = files.slice(i, i + BATCH);
  const sheets = group.map((f) => f.replace(/\.(png|jpe?g)$/i, ''));
  const parts = [];
  group.forEach((f, k) => {
    const mimeType = /\.png$/i.test(f) ? 'image/png' : 'image/jpeg';
    parts.push({ text: `【票 ${k + 1}: ${sheets[k]}】` });
    parts.push({ inlineData: { mimeType, data: readFileSync(join(imgDir, f)).toString('base64') } });
  });
  parts.push({ text: batchPrompt });

  const gap = MIN_GAP_MS - (Date.now() - lastStart);
  if (lastStart && gap > 0) await sleep(gap);
  lastStart = Date.now();
  const t0 = Date.now();
  let parsed = null, usage = {}, error = null, raw = '';
  try {
    calls++;
    const res = await generateWithRetry({
      model,
      contents: [{ role: 'user', parts }],
      config: { responseMimeType: 'application/json', responseSchema, temperature: 0 },
    });
    raw = res.text ?? '';
    const m = raw.match(/\{[\s\S]*\}/);
    parsed = m ? JSON.parse(m[0]) : null;
    const u = res.usageMetadata ?? {};
    usage = { input: u.promptTokenCount ?? 0, output: u.candidatesTokenCount ?? 0, thinking: u.thoughtsTokenCount ?? 0 };
    totalIn += usage.input; totalOut += usage.output; totalThink += usage.thinking;
  } catch (e) {
    error = String(e?.message ?? e);
  }
  const ms = Date.now() - t0;
  console.log(`${error ? '❌' : '✅'} 呼び出し ${calls}: ${sheets.join(', ')} | in ${usage.input ?? '-'} / out ${usage.output ?? '-'} / think ${usage.thinking ?? '-'} | ${(ms / 1000).toFixed(1)}s${error ? ' | ' + error : ''}`);

  const got = parsed?.sheets ?? [];
  if (!error && got.length !== sheets.length) {
    console.log(`   ⚠ 件数ずれ: 送った ${sheets.length} 票、返ってきた ${got.length} 票`);
  }
  // 票名で突き合わせる（順番ずれも検出）。名前が合わなければ順番で当てて flag を付ける
  sheets.forEach((sheet, k) => {
    const byName = got.find((g) => g.sheet === sheet);
    const byOrder = got[k];
    let result = byName ?? null;
    let err = error;
    const flags = [];
    if (!error) {
      if (byName && got.indexOf(byName) !== k) flags.push(`順番ずれ(返答 ${got.indexOf(byName) + 1} 番目)`);
      if (!byName && byOrder) { result = byOrder; flags.push(`票名不一致(返答は ${byOrder.sheet || '無名'})`); }
      if (!byName && !byOrder) err = '返答にこの票が無い';
    }
    const { sheet: _s, ...rest } = result ?? {};
    const r = result ? { ...rest, flags: [...(rest.flags ?? []), ...flags] } : null;
    const lows = r ? Object.entries(r.confidence ?? {}).filter(([, v]) => v !== 'high').map(([a, b]) => `${a}:${b}`) : [];
    console.log(`   ${err ? '❌' : flags.length ? '⚠' : '✅'} ${sheet} | ${lows.length ? '要確認 ' + lows.join(' ') : '全問 high'} | flags ${r?.flags?.length ?? '-'}${err ? ' | ' + err : ''}`);
    // トークンは 1 回ぶんを票数で等分して記録（費用比較用）
    const share = (v) => Math.round((v ?? 0) / sheets.length);
    results.push({ sheet, file: group[k], call: calls, result: r, raw: r ? undefined : raw, usage: { input: share(usage.input), output: share(usage.output), thinking: share(usage.thinking) }, error: err, ms });
  });
  save();
}

console.log(`
呼び出し ${calls} 回 / 合計 tokens: in ${totalIn} / out ${totalOut} / thinking ${totalThink}`);
console.log(`保存: ${outJson} と .csv`);
