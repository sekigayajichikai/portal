/**
 * 本番のプロンプト生成コード（packages/shared/services/ai/eventExtractionPrompt.ts）を
 * esbuild で ESM にバンドルして、テストスクリプトから読み込めるようにする。
 * あわせて prompt.md（人が読む用・本番と同内容）を生成する。
 *
 * 使い方（リポジトリ直下で）:
 *   node scripts/schedule-test/build-prompt.mjs        … バンドル生成 + prompt.md 更新
 *
 * 他スクリプトからは loadPromptModule() を import して使う。
 */

import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const ENTRY = resolve(ROOT, 'packages/shared/services/ai/eventExtractionPrompt.ts');
const OUT = resolve(__dirname, '.prompt-bundle.mjs');

/** 本番のプロンプトモジュールをバンドルして import する */
export async function loadPromptModule() {
  await build({
    entryPoints: [ENTRY],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    outfile: OUT,
    logLevel: 'silent',
  });
  // キャッシュ回避のためクエリを付けて import
  return import(`${pathToFileURL(OUT).href}?t=${Date.now()}`);
}

/** prompt.md を本番コードから生成する */
export async function writePromptMd() {
  const mod = await loadPromptModule();
  const pdfPrompt = mod.buildPdfEventPrompt({
    referenceDate: '{ISSUE_DATE}',
    cutoffDate: '{TODAY}',
    isJichikai: false,
    organizerNames: [],
  });
  const md = `# スケジュール抽出プロンプト（本番と同内容・自動生成）

このファイルは \`node scripts/schedule-test/build-prompt.mjs\` で
\`packages/shared/services/ai/eventExtractionPrompt.ts\`（本番のプロンプト生成コード）から生成されます。
**直接編集せず、本番コード側を直してから再生成してください。**

- 下記は「PDF・自治会以外（地域のお知らせ）」向けの内容。自治会関連PDFでは締切系（〆切）も抽出対象になる
- 記事テキスト向けは buildArticleEventPrompt を参照（ルールは共通）
- Claude Code のサブエージェントに渡すときは {ISSUE_DATE} {TODAY} を実際の日付に置き換える

---
${pdfPrompt}
`;
  writeFileSync(resolve(__dirname, 'prompt.md'), md, 'utf8');
  return md;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const md = await writePromptMd();
  console.log(`prompt.md を更新しました（${md.length} 文字）`);
}
