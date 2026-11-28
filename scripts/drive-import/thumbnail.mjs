/**
 * PDF の1ページ目からサムネイル（JPEG）を作る。Node 用（ブラウザなしで動く）。
 *
 * 管理画面の「サムネイル生成」（CircularBoard.tsx の generatePdfThumbnail）と同じことを、
 * pdfjs-dist の Node 向けビルドと @napi-rs/canvas（pdfjs-dist が一緒に入れる描画部品）で行う。
 * 文字マップ・標準フォント・画像デコーダーは node_modules の中のものを読む（ネットには出ない）。
 *
 * フォントが埋め込まれていない PDF は、動かしている機械に入っている日本語フォントで描く。
 * GitHub Actions では workflow で Noto CJK を入れている（無いと文字が四角になる）。
 */
import { createRequire } from 'node:module';
import { dirname } from 'node:path';

const require = createRequire(import.meta.url);

/** サムネイルの幅の上限（管理画面でアップロードするときの圧縮と同じ 1200px） */
const MAX_WIDTH = 1200;

/**
 * @param {Buffer|Uint8Array} pdf PDF の中身
 * @returns {Promise<Buffer>} JPEG（品質 80%）
 */
export async function renderPdfThumbnail(pdf) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { createCanvas } = await import('@napi-rs/canvas');
  // pdf.js は「/」で終わる場所の指定しか受け付けない（Windows の「\」は不可）
  const base = dirname(require.resolve('pdfjs-dist/package.json')).split('\\').join('/') + '/';
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(pdf), // pdf.js が中身を持っていくので写しを渡す
    cMapUrl: `${base}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}standard_fonts/`,
    wasmUrl: `${base}wasm/`,
    useSystemFonts: true,
    verbosity: 0,
  }).promise;
  try {
    const page = await doc.getPage(1);
    const natural = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(2, MAX_WIDTH / natural.width) });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext('2d');
    // JPEG にするので下地を白で塗る（透過部分が黒くなるのを防ぐ）
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    return canvas.toBuffer('image/jpeg', 80);
  } finally {
    await doc.destroy();
  }
}
