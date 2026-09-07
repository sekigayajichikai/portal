/**
 * Gemini でスケジュール抽出テスト（本番と同じプロンプト・同じリクエスト形式）
 *
 * 使い方（リポジトリ直下で）:
 *   node scripts/schedule-test/run-gemini.mjs "<pdfsフォルダ名>" [prompt] [model] [出力ラベル]（model 既定 gemini-3.6-flash）
 *   例: node scripts/schedule-test/run-gemini.mjs "202609_01 - コピー"
 *       node scripts/schedule-test/run-gemini.mjs "202609_01 - コピー" prod gemini-2.5-flash v4-gemini
 *       node scripts/schedule-test/run-gemini.mjs "202609_01 - コピー" prompt-v3.md gemini-2.5-flash v3-gemini
 *
 * - prompt に "prod"（既定）を指定すると、本番コード（eventExtractionPrompt.ts）から
 *   プロンプトを生成して使う（自治会/地域の切替も本番どおり）。
 *   .md ファイル名を指定すると、そのファイルの --- 以降を使う（過去バージョンとの比較用）。
 * - .env.development.local の VITE_GEMINI_API_KEY を使う（無料枠なら費用ゼロ）
 * - 各PDFを inlineData で送り、構造化出力（responseSchema）で JSON を受け取る
 * - 結果は results/<ラベル>.json に README の形式で保存。usageMetadata（トークン数）も記録
 * - 種別（自治会関連か）はファイル名で判定: 「会員向け」「防災だより」を含めば自治会関連
 */

import { GoogleGenAI } from '@google/genai';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPromptModule } from './build-prompt.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const [folder, promptSpec = 'prod', model = 'gemini-3.6-flash', label = `${promptSpec === 'prod' ? 'prod' : promptSpec.replace(/\.md$/, '')}-${model}`] =
  process.argv.slice(2);
if (!folder) {
  console.error('使い方: node scripts/schedule-test/run-gemini.mjs "<pdfsフォルダ名>" [prod|prompt.md] [model] [label]');
  process.exit(1);
}
const ISSUE_DATE = '2026-08-29';
const TODAY = new Date().toISOString().slice(0, 10);
const JICHIKAI_HINTS = ['会員向け', '防災だより'];

const env = Object.fromEntries(
  readFileSync(resolve(ROOT, '.env.development.local'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);
const ai = new GoogleGenAI({ apiKey: env.VITE_GEMINI_API_KEY });

// ---------- プロンプト ----------
let buildPrompt;
let parseEvents = null;
if (promptSpec === 'prod') {
  const mod = await loadPromptModule();
  buildPrompt = (isJichikai) =>
    mod.buildPdfEventPrompt({ referenceDate: ISSUE_DATE, cutoffDate: TODAY, isJichikai, organizerNames: [] });
  parseEvents = (text) => mod.parseEventCandidatesFromResponse(text, 0);
} else {
  const promptMd = readFileSync(resolve(__dirname, promptSpec), 'utf8');
  const body = promptMd.split(/^---$/m).slice(1).join('---').trim();
  buildPrompt = (isJichikai) =>
    body
      .replace('{ISSUE_DATE}', ISSUE_DATE)
      .replace('{TODAY}', TODAY)
      .replace('{JICHIKAI ? "自治会関連" : "自治会以外（地域のお知らせ）"}', isJichikai ? '自治会関連' : '自治会以外（地域のお知らせ）');
}

const dir = resolve(__dirname, 'pdfs', folder);
const pdfs = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.pdf'));

// 無料枠は 1分あたり5リクエスト（モデル別）なので、リクエスト間隔を空ける（GEMINI_MIN_GAP_MS で変更可）
const MIN_GAP_MS = Number(process.env.GEMINI_MIN_GAP_MS ?? 13000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 429（レート制限）/ 503（高負荷）は待って再試行する。retryDelay があればそれに従う */
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

const results = [];
let totalIn = 0, totalOut = 0, totalThink = 0;
let lastStart = 0;
for (const f of pdfs) {
  const isJichikai = JICHIKAI_HINTS.some((h) => f.includes(h));
  const data = readFileSync(join(dir, f)).toString('base64');
  // 前のリクエスト開始から MIN_GAP_MS 空ける
  const gap = MIN_GAP_MS - (Date.now() - lastStart);
  if (lastStart && gap > 0) await sleep(gap);
  lastStart = Date.now();
  const t0 = Date.now();
  let events = [];
  let usage = {};
  let error = null;
  try {
    const res = await generateWithRetry({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'application/pdf', data } },
            { text: buildPrompt(isJichikai) },
          ],
        },
      ],
      config: { responseMimeType: 'application/json', temperature: 0 },
    });
    const text = res.text ?? '';
    if (parseEvents) {
      events = parseEvents(text);
    } else {
      const m = text.match(/\{[\s\S]*\}/);
      events = m ? (JSON.parse(m[0]).events ?? []) : [];
    }
    const u = res.usageMetadata ?? {};
    usage = {
      input: u.promptTokenCount ?? 0,
      output: u.candidatesTokenCount ?? 0,
      thinking: u.thoughtsTokenCount ?? 0,
    };
    totalIn += usage.input; totalOut += usage.output; totalThink += usage.thinking;
  } catch (e) {
    error = String(e?.message ?? e);
  }
  const ms = Date.now() - t0;
  console.log(`${error ? '❌' : '✅'} ${f} | ${events.length}件 | in ${usage.input ?? '-'} / out ${usage.output ?? '-'} / think ${usage.thinking ?? '-'} | ${(ms / 1000).toFixed(1)}s${error ? ' | ' + error : ''}`);
  results.push({ file: f, label: f.replace(/^\d+_?/, '').replace(/\.pdf$/i, ''), isJichikai, events, usage, error });
}

const out = {
  promptLabel: label,
  folder,
  model,
  prompt: promptSpec,
  issue_date: ISSUE_DATE,
  today: TODAY,
  usage_total: { input: totalIn, output: totalOut, thinking: totalThink },
  results,
};
const outPath = resolve(__dirname, 'results', `${label}.json`);
writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
console.log(`\n合計 tokens: in ${totalIn} / out ${totalOut} / thinking ${totalThink}`);
console.log(`保存: ${outPath}`);
