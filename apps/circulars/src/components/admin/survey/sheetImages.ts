/**
 * 回答用紙の画像づくり（PDF の各ページ・写真 → AI に送る PNG と、確認画面用の小さな JPEG）
 *
 * - PDF は pdf.js で1ページずつ描く。A4 で幅 1,200px 前後（150dpi 相当）にする。
 *   試し読み（2026-11-20）はこの大きさの白黒で 5票77設問すべて一致した
 * - 写真も同じ幅に縮める（スマホ写真は 4,000px あるので、そのまま送ると無駄に大きい）
 * - 向きの判定: 用紙は上に題名と注意書きの帯、下に自由記述の空き枠があるので、
 *   「上の帯より下の帯のほうが黒い」なら上下逆さまとみなして 180度回す
 *   （2026-11-17 のスキャンでは 22枚中2枚が逆さまだった）
 */
/* global HTMLCanvasElement, HTMLImageElement, Image */
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFJS_DOC_OPTIONS } from '@/lib/pdfConfig';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/** AI に送る画像の幅（px） */
export const SHEET_IMAGE_WIDTH = 1240;
/** 確認画面に残す縮小画像の幅（px） */
export const SHEET_THUMB_WIDTH = 700;

export interface SheetImage {
  /** 元ファイル名 */
  sourceName: string;
  /** PDF のページ番号（画像は 1） */
  sourcePage: number;
  /** AI に送る PNG（base64、前置きなし） */
  pngBase64: string;
  /** 確認画面用の JPEG data URL */
  thumbDataUrl: string;
  /** 向きを自動で直したか */
  rotated: boolean;
}

/** canvas の上下の帯の黒さを比べて、逆さまなら true */
function looksUpsideDown(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  const band = Math.floor(canvas.height * 0.12);
  const dark = (y: number) => {
    const d = ctx.getImageData(0, y, canvas.width, band).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 16) if (d[i] < 128) n++; // 4px おきに見る
    return n;
  };
  const top = dark(0);
  const bottom = dark(canvas.height - band);
  return bottom > top * 1.4 && bottom > 50;
}

function rotate180(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext('2d')!;
  ctx.translate(out.width, out.height);
  ctx.rotate(Math.PI);
  ctx.drawImage(src, 0, 0);
  return out;
}

function scaled(src: HTMLCanvasElement, width: number): HTMLCanvasElement {
  if (src.width <= width) return src;
  const out = document.createElement('canvas');
  const r = width / src.width;
  out.width = width;
  out.height = Math.round(src.height * r);
  out.getContext('2d')!.drawImage(src, 0, 0, out.width, out.height);
  return out;
}

function finish(canvas: HTMLCanvasElement, sourceName: string, sourcePage: number, autoRotate: boolean): SheetImage {
  let c = scaled(canvas, SHEET_IMAGE_WIDTH);
  const rotated = autoRotate && looksUpsideDown(c);
  if (rotated) c = rotate180(c);
  return {
    sourceName,
    sourcePage,
    pngBase64: c.toDataURL('image/png').split(',')[1],
    thumbDataUrl: scaled(c, SHEET_THUMB_WIDTH).toDataURL('image/jpeg', 0.7),
    rotated,
  };
}

/** PDF の全ページを画像にする */
export async function pdfToSheetImages(file: File, autoRotate = true, onPage?: (done: number, total: number) => void): Promise<SheetImage[]> {
  const doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer(), ...PDFJS_DOC_OPTIONS }).promise;
  const out: SheetImage[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const scale = SHEET_IMAGE_WIDTH / base.width;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
      out.push(finish(canvas, file.name, i, autoRotate));
      onPage?.(i, doc.numPages);
    }
  } finally {
    await doc.destroy();
  }
  return out;
}

/** 写真（JPEG/PNG）1枚を画像にする */
export async function imageFileToSheetImage(file: File, autoRotate = true): Promise<SheetImage> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`画像を読めませんでした: ${file.name}`));
      el.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d')!.drawImage(img, 0, 0);
    return finish(canvas, file.name, 1, autoRotate);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** ファイル群（PDF と画像の混在可）をまとめて画像にする */
export async function filesToSheetImages(files: File[], onProgress?: (label: string) => void): Promise<SheetImage[]> {
  const out: SheetImage[] = [];
  for (const f of files) {
    if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
      const pages = await pdfToSheetImages(f, true, (d, t) => onProgress?.(`${f.name} ${d}/${t} ページ`));
      out.push(...pages);
    } else if (/^image\//.test(f.type)) {
      onProgress?.(f.name);
      out.push(await imageFileToSheetImage(f));
    }
  }
  return out;
}

/** 手で 180度回す（自動判定が外れたとき用） */
export async function rotateSheetImage(img: SheetImage): Promise<SheetImage> {
  const el = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('画像を回せませんでした'));
    i.src = `data:image/png;base64,${img.pngBase64}`;
  });
  const canvas = document.createElement('canvas');
  canvas.width = el.naturalWidth;
  canvas.height = el.naturalHeight;
  canvas.getContext('2d')!.drawImage(el, 0, 0);
  const r = rotate180(canvas);
  return { ...img, pngBase64: r.toDataURL('image/png').split(',')[1], thumbDataUrl: scaled(r, SHEET_THUMB_WIDTH).toDataURL('image/jpeg', 0.7), rotated: !img.rotated };
}
