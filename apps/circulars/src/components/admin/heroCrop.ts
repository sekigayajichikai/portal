/**
 * 一押しカードの画像（チラシPDFの1ページ目、または記事の写真）から、カード用の枠を切り出す
 *
 * crop = { x, y, scale, aspect }
 *   aspect … 枠の形。'1:1'（正方形）/ '4:3' / '16:9'（横長）/ '210:297'・'297:210'（縦長・横長 A4。チラシ1ページを全面で）。未指定なら元画像の向きから決める（横長の写真は 4:3、それ以外は 1:1）
 *   scale  … 拡大率（1 = 枠が元画像に収まる最大、3 = その1/3 を拡大）
 *   x, y   … 枠の位置（0 = 左端/上端、1 = 右端/下端。動かせる範囲に対する割合）
 */

import { PDFJS_DOC_OPTIONS } from '@/lib/pdfConfig';

export type CropAspect = '1:1' | '4:3' | '16:9' | '210:297' | '297:210';
export const ASPECTS: Array<{ key: CropAspect; label: string; ratio: number }> = [
  { key: '1:1', label: '正方形', ratio: 1 },
  { key: '4:3', label: '横長 4:3', ratio: 4 / 3 },
  { key: '16:9', label: '横長 16:9', ratio: 16 / 9 },
  // チラシ（A4）を切らずにページ全体で載せる。LINE の aspectRatio は整数の「幅:高さ」なので 210:297 / 297:210
  { key: '210:297', label: '縦長 A4（全面）', ratio: 210 / 297 },
  { key: '297:210', label: '横長 A4（全面）', ratio: 297 / 210 },
];

export interface HeroCrop {
  x: number;
  y: number;
  scale: number;
  aspect?: CropAspect;
}

export const DEFAULT_CROP: HeroCrop = { x: 0, y: 0, scale: 1 };
export const MIN_SCALE = 1;
export const MAX_SCALE = 3;

const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
const isAspect = (a: unknown): a is CropAspect => ASPECTS.some((x) => x.key === a);

export function normalizeCrop(c?: Partial<HeroCrop> | null, legacyY?: number | null): HeroCrop {
  if (c && typeof c === 'object') {
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(c.scale) || 1));
    return { x: clamp01(Number(c.x)), y: clamp01(Number(c.y)), scale, ...(isAspect(c.aspect) ? { aspect: c.aspect } : {}) };
  }
  // 旧データ（位置だけ）
  if (typeof legacyY === 'number') return { x: 0, y: clamp01(legacyY), scale: 1 };
  return DEFAULT_CROP;
}

/** 元画像の向きから既定の枠を決める（横長の写真は 4:3、縦長のチラシなどは正方形） */
export function defaultAspectFor(w: number, h: number): CropAspect {
  return w / h >= 1.2 ? '4:3' : '1:1';
}

/** aspect が未指定なら元画像の向きで決めた値を入れて返す */
export function resolveCrop(crop: HeroCrop, w: number, h: number): HeroCrop & { aspect: CropAspect } {
  return { ...crop, aspect: crop.aspect ?? defaultAspectFor(w, h) };
}

export const aspectRatioOf = (a: CropAspect) => ASPECTS.find((x) => x.key === a)!.ratio;

/** 元画像に対する切り出し矩形 */
export function cropRect(w: number, h: number, crop: HeroCrop): { sx: number; sy: number; sw: number; sh: number } {
  const r = aspectRatioOf(resolveCrop(crop, w, h).aspect);
  // 枠が元画像に収まる最大の大きさ → scale で縮める（＝拡大）
  const baseW = Math.min(w, h * r);
  const sw = baseW / crop.scale;
  const sh = sw / r;
  return { sx: (w - sw) * clamp01(crop.x), sy: (h - sh) * clamp01(crop.y), sw, sh };
}

/** 切り出して width × (width/比率) の canvas にする */
export function drawCropped(src: HTMLCanvasElement | HTMLImageElement, crop: HeroCrop, width = 1040): HTMLCanvasElement {
  const w = src instanceof HTMLImageElement ? src.naturalWidth : src.width;
  const h = src instanceof HTMLImageElement ? src.naturalHeight : src.height;
  const r = aspectRatioOf(resolveCrop(crop, w, h).aspect);
  const c = document.createElement('canvas');
  c.width = Math.round(width);
  c.height = Math.round(width / r);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  const { sx, sy, sw, sh } = cropRect(w, h, crop);
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}

/** PDFの1ページ目を canvas に描いたもの（URLごとにキャッシュ。週次配信と予定の編集ダイアログで共有） */
const flyerCache = new Map<string, HTMLCanvasElement>();
/** 読み込み中の Promise（同じPDFを同時に2回描かないため。開発モードの二重実行やメモリ節約） */
const flyerInflight = new Map<string, Promise<HTMLCanvasElement>>();

/** PDF 1ページ目を最大 1400px の canvas にレンダリングする（PdfThumbnail と同じ pdf.js 設定） */
export function renderPdfFirstPage(url: string): Promise<HTMLCanvasElement> {
  const cached = flyerCache.get(url);
  if (cached) return Promise.resolve(cached);
  const inflight = flyerInflight.get(url);
  if (inflight) return inflight;
  const p = renderPdfFirstPageUncached(url).finally(() => flyerInflight.delete(url));
  flyerInflight.set(url, p);
  return p;
}

async function renderPdfFirstPageUncached(url: string): Promise<HTMLCanvasElement> {
  const pdfjsLib = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const doc = await pdfjsLib.getDocument({ data: await res.arrayBuffer(), ...PDFJS_DOC_OPTIONS }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = 1400 / Math.max(base.width, base.height);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context を取得できません');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
    flyerCache.set(url, canvas);
    return canvas;
  } finally {
    doc.destroy();
  }
}

/** 画像URLを canvas に読み込む（Storage の公開URL。CORS 対応でないと canvas から取り出せないので crossOrigin を付ける） */
export function loadImageCanvas(url: string, maxSide = 1400): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve(c);
    };
    img.onerror = () => reject(new Error('画像を読み込めませんでした'));
    img.src = url;
  });
}
