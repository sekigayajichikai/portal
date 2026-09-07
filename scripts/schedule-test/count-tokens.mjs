/**
 * 本番と同じリクエスト形式（PDF base64 + プロンプト）で count_tokens を叩き、
 * 入力トークン数と概算コストを出す。count_tokens は無料。
 *
 * 使い方（リポジトリ直下で）:
 *   node scripts/schedule-test/count-tokens.mjs "<pdfsフォルダ名>" [prompt-v3.md] [results/xxx.json]
 *
 * - .env.development.local の VITE_ANTHROPIC_API_KEY を使う
 * - results の JSON を渡すと、その抽出結果を出力トークン数として測る
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const MODEL = 'claude-haiku-4-5';
const PRICE = { input: 1.0, output: 5.0 }; // $/1M tokens（Haiku 4.5）
const USD_JPY = 150;

const [folder, promptFile = 'prompt-v3.md', resultsFile] = process.argv.slice(2);
if (!folder) {
  console.error('使い方: node scripts/schedule-test/count-tokens.mjs "<pdfsフォルダ名>" [prompt.md] [results.json]');
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
const client = new Anthropic({ apiKey: env.VITE_ANTHROPIC_API_KEY });

// プロンプト本文（--- 以降）を取り出してパラメータを埋める
const promptMd = readFileSync(resolve(__dirname, promptFile), 'utf8');
const body = promptMd.split(/^---$/m).slice(1).join('---').trim();
const promptText = body
  .replace('{ISSUE_DATE}', '2026-08-29')
  .replace('{TODAY}', '2026-09-07')
  .replace('{JICHIKAI ? "自治会関連" : "自治会以外（地域のお知らせ）"}', '自治会以外（地域のお知らせ）');

const results = resultsFile ? JSON.parse(readFileSync(resolve(__dirname, resultsFile), 'utf8')).results : null;

const dir = resolve(__dirname, 'pdfs', folder);
const pdfs = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.pdf'));

// プロンプト単体のトークン数
const promptOnly = await client.messages.countTokens({
  model: MODEL,
  messages: [{ role: 'user', content: promptText }],
});
console.log(`プロンプト単体: ${promptOnly.input_tokens} tokens\n`);

let totalIn = 0;
let totalOut = 0;
const rows = [];
for (const f of pdfs) {
  const data = readFileSync(join(dir, f)).toString('base64');
  const res = await client.messages.countTokens({
    model: MODEL,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } },
          { type: 'text', text: promptText },
        ],
      },
    ],
  });
  const inTok = res.input_tokens;
  let outTok = 0;
  if (results) {
    const r = results.find((x) => x.file === f);
    if (r) {
      const json = JSON.stringify({ events: r.events });
      const o = await client.messages.countTokens({ model: MODEL, messages: [{ role: 'user', content: json }] });
      outTok = o.input_tokens;
    }
  }
  totalIn += inTok;
  totalOut += outTok;
  const sizeMB = (readFileSync(join(dir, f)).length / 1024 / 1024).toFixed(2);
  rows.push({ file: f, sizeMB, inTok, outTok });
}

const cost = (i, o) => (i * PRICE.input + o * PRICE.output) / 1e6;
console.log('| PDF | MB | 入力tokens | 出力tokens | 概算$ | 概算¥ |');
console.log('|---|---|---|---|---|---|');
for (const r of rows) {
  const c = cost(r.inTok, r.outTok);
  console.log(`| ${r.file} | ${r.sizeMB} | ${r.inTok.toLocaleString()} | ${r.outTok.toLocaleString()} | $${c.toFixed(4)} | ¥${(c * USD_JPY).toFixed(1)} |`);
}
const c = cost(totalIn, totalOut);
console.log(`| **合計** | | **${totalIn.toLocaleString()}** | **${totalOut.toLocaleString()}** | **$${c.toFixed(4)}** | **¥${(c * USD_JPY).toFixed(1)}** |`);
