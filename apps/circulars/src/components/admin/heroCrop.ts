/**
 * 一押しカードの画像（チラシPDFの1ページ目、または記事の写真）から正方形を切り出す
 *
 * crop = { x, y, scale }
 *   scale … 拡大率（1 = 短辺いっぱい、3 = 短辺の1/3 を拡大）
 *   x, y  … 切り出し窓の位置（0 = 左端/上端、1 = 右端/下端。動かせる範囲に対する割合）
 */

export interface HeroCrop {
  x: number;
  y: number;
  scale: number;
}

export const DEFAULT_CROP: HeroCrop = { x: 0, y: 0, scale: 1 };
export const MIN_SCALE = 1;
export const MAX_SCALE = 3;

const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));

export function normalizeCrop(c?: Partial<HeroCrop> | null, legacyY?: number | null): HeroCrop {
  if (c && typeof c === 'object') {
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(c.scale) || 1));
    return { x: clamp01(Number(c.x)), y: clamp01(Number(c.y)), scale };
  }
  // 旧データ（位置だけ）
  if (typeof legacyY === 'number') return { x: 0, y: clamp01(legacyY), scale: 1 };
  return DEFAULT_CROP;
}

/** 元画像に対する切り出し矩形（正方形） */
export function cropRect(w: number, h: number, crop: HeroCrop): { sx: number; sy: number; side: number } {
  const side = Math.min(w, h) / crop.scale;
  return { sx: (w - side) * clamp01(crop.x), sy: (h - side) * clamp01(crop.y), side };
}

/** 切り出して size×size の canvas にする */
export function drawCropped(src: HTMLCanvasElement | HTMLImageElement, crop: HeroCrop, size = 1040): HTMLCanvasElement {
  const w = src instanceof HTMLImageElement ? src.naturalWidth : src.width;
  const h = src instanceof HTMLImageElement ? src.naturalHeight : src.height;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  const { sx, sy, side } = cropRect(w, h, crop);
  ctx.drawImage(src, sx, sy, side, side, 0, 0, size, size);
  return c;
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
