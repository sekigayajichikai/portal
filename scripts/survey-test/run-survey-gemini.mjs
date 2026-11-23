/**
 * アンケート回答用紙（画像）を Gemini で読み取る試し読みスクリプト（2026-11-20、要件定義の試し読み用。本番コードではない）
 *
 * 使い方（CC-SaaS 直下で）:
 *   node scripts/survey-test/run-survey-gemini.mjs "<画像フォルダ>" "<プロンプト.md>" "<出力フォルダ>" [model] [ラベル] [ファイル名の絞り込み(カンマ区切り)]
 *   例: node scripts/survey-test/run-survey-gemini.mjs "D:/.../send" "D:/.../prompt_v1.md" "D:/.../results" gemini-3.6-flash v1 scan1_p01,scan1_p02
 *
 * - 鍵は .env.development.local の VITE_GEMINI_API_KEY（無料枠）。run-gemini.mjs と同じ
 * - 画像は1枚ずつ inlineData で送り、responseSchema で JSON を受け取る
 * - 無料枠は 1分5回・1日20回（Flash 系）。13秒間隔＋429/503 再試行
 * - 結果は <出力フォルダ>/<ラベル>.json と <ラベル>.csv。画像や結果はリポジトリに入れない（_private 側に置く）
 */

import { GoogleGenAI, Type } from '@google/genai';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const [imgDir, promptPath, outDir, model = 'gemini-3.6-flash', label = `v1-${model}`, only = ''] = process.argv.slice(2);
if (!imgDir || !promptPath || !outDir) {
  console.error('使い方: node scripts/survey-test/run-survey-gemini.mjs "<画像フォルダ>" "<プロンプト.md>" "<出力フォルダ>" [model] [label] [only]');
  process.exit(1);
}

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

const prompt = readFileSync(promptPath, 'utf8');

const Q = Array.from({ length: 16 }, (_, i) => `q${i + 1}`);
const answersProps = Object.fromEntries(
  Q.map((q) => [q, q === 'q16' ? { type: Type.STRING } : { type: Type.ARRAY, items: { type: Type.INTEGER } }])
);
const confProps = Object.fromEntries(Q.map((q) => [q, { type: Type.STRING, enum: ['high', 'mid', 'low'] }]));
const responseSchema = {
  type: Type.OBJECT,
  properties: {
    answers: { type: Type.OBJECT, properties: answersProps, required: Q },
    confidence: { type: Type.OBJECT, properties: confProps, required: Q },
    flags: { type: Type.ARRAY, items: { type: Type.STRING } },
    blank: { type: Type.BOOLEAN },
  },
  required: ['answers', 'confidence', 'flags', 'blank'],
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
console.log(`${files.length} 枚を ${model} で読み取り（${label}）`);

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

// 既に結果がある票は飛ばす（429 で止まったあとの再開用）。1票ごとに保存するので途中で止めても結果は残る
mkdirSync(outDir, { recursive: true });
const outJson = resolve(outDir, `${label}.json`);
let results = [];
try {
  const prev = JSON.parse(readFileSync(outJson, 'utf8'));
  results = (prev.results ?? []).filter((r) => r.result && !r.error);
  if (results.length) console.log(`前回の結果 ${results.length} 票を引き継ぎ`);
} catch {}
const doneSet = new Set(results.map((r) => r.sheet));
let totalIn = 0, totalOut = 0, totalThink = 0;
for (const r of results) { totalIn += r.usage?.input ?? 0; totalOut += r.usage?.output ?? 0; totalThink += r.usage?.thinking ?? 0; }

function save() {
  const out = { label, model, prompt: basename(promptPath), run_at: new Date().toISOString(), usage_total: { input: totalIn, output: totalOut, thinking: totalThink }, results };
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

let lastStart = 0;
for (const f of files) {
  const sheet = f.replace(/\.(png|jpe?g)$/i, '');
  if (doneSet.has(sheet)) continue;
  const mimeType = /\.png$/i.test(f) ? 'image/png' : 'image/jpeg';
  const data = readFileSync(join(imgDir, f)).toString('base64');
  const gap = MIN_GAP_MS - (Date.now() - lastStart);
  if (lastStart && gap > 0) await sleep(gap);
  lastStart = Date.now();
  const t0 = Date.now();
  let parsed = null, usage = {}, error = null, raw = '';
  try {
    const res = await generateWithRetry({
      model,
      contents: [{ role: 'user', parts: [{ inlineData: { mimeType, data } }, { text: prompt }] }],
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
  const lows = parsed ? Object.entries(parsed.confidence ?? {}).filter(([, v]) => v !== 'high').map(([k, v]) => `${k}:${v}`) : [];
  console.log(`${error ? '❌' : '✅'} ${sheet} | ${lows.length ? '要確認 ' + lows.join(' ') : '全問 high'} | flags ${parsed?.flags?.length ?? '-'} | in ${usage.input ?? '-'} / out ${usage.output ?? '-'} / think ${usage.thinking ?? '-'} | ${(ms / 1000).toFixed(1)}s${error ? ' | ' + error : ''}`);
  results.push({ sheet, file: f, result: parsed, raw: parsed ? undefined : raw, usage, error, ms });
  save();
  // 1日の無料枠を使い切った（retry が10分超）ときは待たずに終了し、翌日に同じコマンドで再開する（済んだ票は飛ばす）
  const m429 = error && /429|RESOURCE_EXHAUSTED/.test(error) ? error.match(/retry in ([\d.]+)s/i) ?? error.match(/"retryDelay":"(\d+)s"/) : null;
  if (m429 && Number(m429[1]) > 600) {
    console.log('1日の無料枠を使い切ったので中断。同じコマンドで再開できます');
    break;
  }
}

console.log(`
合計 tokens: in ${totalIn} / out ${totalOut} / thinking ${totalThink}`);
console.log(`保存: ${outJson} と .csv`);
