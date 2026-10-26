/**
 * shared-entry.ts（本番の共有コードの入口）を esbuild で Node 用 ESM にバンドルして import する。
 * scripts/schedule-test/build-prompt.mjs と同じやり方。
 */
import { build } from 'esbuild';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '.shared-bundle.mjs');

export async function loadShared() {
  await build({
    entryPoints: [resolve(__dirname, 'shared-entry.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    packages: 'external', // node_modules はバンドルせず実行時に読む（@anthropic-ai/sdk, @supabase/supabase-js）
    outfile: OUT,
    logLevel: 'silent',
  });
  return import(`${pathToFileURL(OUT).href}?t=${Date.now()}`);
}
