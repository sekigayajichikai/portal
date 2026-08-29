/**
 * pdf.js（pdfjs-dist）の共通読み込みオプション
 *
 * - cMapUrl: 日本語などの文字マップ（無いと一部の文字が描画されない）
 * - wasmUrl: JPEG2000等の画像デコーダー（無いとスキャンPDFが真っ白に描画される）
 *
 * バージョンを上げるときは package.json の pdfjs-dist と URLの数字を揃えること。
 */
export const PDFJS_DOC_OPTIONS = {
  cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.7.284/cmaps/',
  cMapPacked: true,
  useSystemFonts: true,
  wasmUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.7.284/wasm/',
} as const;
