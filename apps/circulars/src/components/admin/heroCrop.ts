/**
 * 一押しカードの画像（チラシPDFの1ページ目、または記事の写真）から、カード用の枠を切り出す
 *
 * crop = { x, y, scale, aspect }
 *   aspect … 枠の形。'1:1'（正方形）/ '4:3' / '16:9'（横長）/ '210:297'・'297:210'（縦長・横長 A4。チラシ1ページを全面で）。未指定なら元画像の向きから決める（横長の写真は 4:3、それ以外は 1:1）
 *            「自由」（2026-10-27）: 上の5つ以外の '幅:高さ'（整数。例 '1000:623'）。紙面の上で枠をなぞって決めた形。
 *            LINE の Flex の aspectRatio がそのまま受け付ける書き方（1〜100000 の整数、高さは幅の3倍まで）に合わせている
 *   scale  … 拡大率（1 = 枠が元画像に収まる最大、3 = その1/3 を拡大。自由な形のときは 6 まで）
 *   x, y   … 枠の位置（0 = 左端/上端、1 = 右端/下端。動かせる範囲に対する割合）
 */

import { PDFJS_DOC_OPTIONS } from '@/lib/pdfConfig';

export type PresetAspect = '1:1' | '4:3' | '16:9' | '210:297' | '297:210';
/** 自由な形は '幅:高さ'（整数）の文字列。Flex の aspectRatio と同じ書き方 */
export type CropAspect = PresetAspect | `${number}:${number}`;
export const ASPECTS: Array<{ key: PresetAspect; label: string; ratio: number }> = [
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
/** 自由な形のときの拡大の上限。紙面の小さな記事（幅の1/6）までなぞれるように。元の描画が最大1400pxなので、これ以上は粗くなる */
export const MAX_SCALE_FREE = 6;
/** 自由な形の縦横比の範囲（これより細長い枠はカードが読みにくいので止める。LINE の上限「高さは幅の3倍まで」にも収まる） */
const FREE_RATIO_MIN = 1 / 3;
const FREE_RATIO_MAX = 3;

const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
export const isPresetAspect = (a: unknown): a is PresetAspect => ASPECTS.some((x) => x.key === a);
/** 自由な形（'幅:高さ' の整数。5つの決まった形は含まない） */
export const isFreeAspect = (a: unknown): a is CropAspect => {
  if (typeof a !== 'string' || isPresetAspect(a)) return false;
  const m = /^(\d{1,6}):(\d{1,6})$/.exec(a);
  if (!m) return false;
  const w = Number(m[1]);
  const h = Number(m[2]);
  return w >= 1 && h >= 1 && w <= 100000 && h <= 100000 && w / h >= FREE_RATIO_MIN && w / h <= FREE_RATIO_MAX;
};
const isAspect = (a: unknown): a is CropAspect => isPresetAspect(a) || isFreeAspect(a);
/** この形のときの拡大の上限 */
export const maxScaleFor = (aspect?: CropAspect | null) => (isFreeAspect(aspect) ? MAX_SCALE_FREE : MAX_SCALE);

/**
 * 枠の大きさ（px）から自由な形の文字列を作る（例 537×312 → 縦横比 1.72 → '172:100' を約分して '43:25'）。
 * 縦横比は FREE_RATIO_MIN〜MAX に収め、短い方を 100 にして 1% 刻みに丸める（LINE の aspectRatio に渡すので桁を小さく）
 */
export function freeAspectFromSize(w: number, h: number): CropAspect {
  const ratio = Math.min(FREE_RATIO_MAX, Math.max(FREE_RATIO_MIN, w / Math.max(1, h)));
  let a = ratio >= 1 ? Math.round(ratio * 100) : 100;
  let b = ratio >= 1 ? 100 : Math.round(100 / ratio);
  const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
  const g = gcd(a, b);
  a /= g;
  b /= g;
  // 約分の結果が決まった形（'4:3' など）と同じ文字になると「自由」と見分けられなくなるので、そのときは約分しない形で返す（'8:6'。LINE はこれも受け付ける）
  if (isPresetAspect(`${a}:${b}`)) return `${a * 2}:${b * 2}` as CropAspect;
  return `${a}:${b}` as CropAspect;
}

export function normalizeCrop(c?: Partial<HeroCrop> | null, legacyY?: number | null): HeroCrop {
  if (c && typeof c === 'object') {
    const aspect = isAspect(c.aspect) ? c.aspect : undefined;
    const scale = Math.min(maxScaleFor(aspect), Math.max(MIN_SCALE, Number(c.scale) || 1));
    return { x: clamp01(Number(c.x)), y: clamp01(Number(c.y)), scale, ...(aspect ? { aspect } : {}) };
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

export const aspectRatioOf = (a: CropAspect): number => {
  const preset = ASPECTS.find((x) => x.key === a);
  if (preset) return preset.ratio;
  const m = /^(\d+):(\d+)$/.exec(a);
  return m ? Number(m[1]) / Math.max(1, Number(m[2])) : 1;
};

/** 元画像に対する切り出し矩形 */
export function cropRect(w: number, h: number, crop: HeroCrop): { sx: number; sy: number; sw: number; sh: number } {
  const r = aspectRatioOf(resolveCrop(crop, w, h).aspect);
  // 枠が元画像に収まる最大の大きさ → scale で縮める（＝拡大）
  const baseW = Math.min(w, h * r);
  const sw = baseW / crop.scale;
  const sh = sw / r;
  return { sx: (w - sw) * clamp01(crop.x), sy: (h - sh) * clamp01(crop.y), sw, sh };
}

/**
 * 紙面の中の矩形（割合 0〜1）を、それを含む切り抜き（枠の形・位置・拡大）にする。
 * AI が見つけた記事の範囲から、切り抜きの初期値を作るのに使う（2026-10-27）。
 * - 枠の形は、矩形の縦横比に近いもの（正方形／横長 4:3／横長 16:9）
 * - 拡大は矩形がちょうど収まる大きさ（少し余白を足す）。上限 MAX_SCALE
 * - 位置は矩形の中心に合わせる
 */
export function cropFromBox(w: number, h: number, box: { xmin: number; ymin: number; xmax: number; ymax: number }, padding = 0.04): HeroCrop {
  const pad = padding;
  const bx = Math.max(0, (box.xmin - pad) * w);
  const by = Math.max(0, (box.ymin - pad) * h);
  const bw = Math.min(w, (box.xmax + pad) * w) - bx;
  const bh = Math.min(h, (box.ymax + pad) * h) - by;
  // 2026-10-27: 決まった形に寄せると縦長の記事の上下が切れていたので、矩形の形そのまま（自由な形）にする
  return cropFromRect(w, h, { sx: bx, sy: by, sw: bw, sh: bh });
}

/**
 * 元画像の上の矩形（px）を、その形そのままの切り抜き（自由な形）にする。
 * 「自由」で枠をなぞったときと、AI が見つけた範囲から使う（2026-10-27）。
 * 枠の形は矩形の縦横比（FREE_RATIO_MIN〜MAX に収める）、拡大は矩形がちょうど収まる大きさ（上限 MAX_SCALE_FREE）、位置は矩形の中心
 */
export function cropFromRect(w: number, h: number, rect: { sx: number; sy: number; sw: number; sh: number }): HeroCrop {
  const bw = Math.max(1, rect.sw);
  const bh = Math.max(1, rect.sh);
  const aspect = freeAspectFromSize(bw, bh);
  const r = aspectRatioOf(aspect);
  const baseW = Math.min(w, h * r); // 枠が元画像に収まる最大の幅（scale=1）
  const needW = Math.max(bw, bh * r); // 矩形を含むのに必要な枠の幅（比率を丸めた分のずれも含める）
  const scale = Math.min(MAX_SCALE_FREE, Math.max(MIN_SCALE, baseW / needW));
  const sw = baseW / scale;
  const sh = sw / r;
  const cx = rect.sx + bw / 2;
  const cy = rect.sy + bh / 2;
  const sx = Math.min(Math.max(0, cx - sw / 2), w - sw);
  const sy = Math.min(Math.max(0, cy - sh / 2), h - sh);
  return {
    x: w - sw > 1 ? clamp01(sx / (w - sw)) : 0,
    y: h - sh > 1 ? clamp01(sy / (h - sh)) : 0,
    scale: Math.round(scale * 1000) / 1000,
    aspect,
  };
}

/** canvas を長辺 maxSide px の JPEG（base64 本体）にする。AI に渡す用 */
export function canvasToJpegBase64(src: HTMLCanvasElement, maxSide = 1000, quality = 0.8): string {
  const scale = Math.min(1, maxSide / Math.max(src.width, src.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(src.width * scale));
  c.height = Math.max(1, Math.round(src.height * scale));
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality).split(',')[1];
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
