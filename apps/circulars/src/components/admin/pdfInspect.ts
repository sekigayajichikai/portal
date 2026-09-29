/**
 * PDFの中身を抽出前に調べる（ブラウザ内の pdf.js。AIは呼ばないので費用ゼロ）
 *
 * 目的は2つ。
 * 1. **スキャン画像のPDFを見つける**。文字データを持たないPDFは、AIが目で見て読む（OCR）ことになり、
 *    表の日付と項目の対応を取り違えることがある（2026-09-29に「全地区長共通の仕事」で発生。
 *    合同会議 10/25→10/11、公園一斉清掃 11/22→11/1 と誤読）。
 *    抽出プロンプトの誤読よけ（原文の一節を書き写させる）も、照合する原文が無いため働かない。
 * 2. **元のページを見比べられるようにする**。どうしても画像PDFを読ませるときのために、
 *    抽出結果の横にページ画像を出して人が確かめられるようにする。
 */

import { PDFJS_DOC_OPTIONS } from '@/lib/pdfConfig';

export interface PdfInfo {
  /** ページ数 */
  pages: number;
  /** 取り出せた文字数（空白を除く） */
  chars: number;
  /** 文字データがほとんど無い＝スキャン画像のPDF */
  isScan: boolean;
}

/** 1ページあたりこの文字数に満たなければスキャン画像とみなす（見出しだけ文字になっている場合も拾う） */
const SCAN_CHARS_PER_PAGE = 30;

const infoCache = new Map<string, PdfInfo>();
const infoInflight = new Map<string, Promise<PdfInfo>>();

async function loadPdfjs() {
  const pdfjsLib = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjsLib;
}

/** PDFのページ数と文字量を調べる（URLごとにキャッシュ） */
export function inspectPdf(url: string): Promise<PdfInfo> {
  const cached = infoCache.get(url);
  if (cached) return Promise.resolve(cached);
  const inflight = infoInflight.get(url);
  if (inflight) return inflight;
  const p = inspectPdfUncached(url).finally(() => infoInflight.delete(url));
  infoInflight.set(url, p);
  return p;
}

async function inspectPdfUncached(url: string): Promise<PdfInfo> {
  const pdfjsLib = await loadPdfjs();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const doc = await pdfjsLib.getDocument({ data: await res.arrayBuffer(), ...PDFJS_DOC_OPTIONS }).promise;
  try {
    let chars = 0;
    for (let i = 1; i <= doc.numPages; i++) {
      const tc = await (await doc.getPage(i)).getTextContent();
      chars += tc.items.map((it: any) => it.str ?? '').join('').replace(/\s/g, '').length;
    }
    const info: PdfInfo = { pages: doc.numPages, chars, isScan: chars < doc.numPages * SCAN_CHARS_PER_PAGE };
    infoCache.set(url, info);
    return info;
  } finally {
    doc.destroy();
  }
}

const pageCache = new Map<string, HTMLCanvasElement>();
const pageInflight = new Map<string, Promise<HTMLCanvasElement>>();

/** PDFの指定ページを canvas に描く（見比べ用。URL＋ページごとにキャッシュ） */
export function renderPdfPage(url: string, pageNo: number, maxSide = 1200): Promise<HTMLCanvasElement> {
  const key = `${url}#${pageNo}@${maxSide}`;
  const cached = pageCache.get(key);
  if (cached) return Promise.resolve(cached);
  const inflight = pageInflight.get(key);
  if (inflight) return inflight;
  const p = renderPdfPageUncached(url, pageNo, maxSide)
    .then((c) => {
      pageCache.set(key, c);
      return c;
    })
    .finally(() => pageInflight.delete(key));
  pageInflight.set(key, p);
  return p;
}

async function renderPdfPageUncached(url: string, pageNo: number, maxSide: number): Promise<HTMLCanvasElement> {
  const pdfjsLib = await loadPdfjs();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const doc = await pdfjsLib.getDocument({ data: await res.arrayBuffer(), ...PDFJS_DOC_OPTIONS }).promise;
  try {
    const page = await doc.getPage(Math.min(Math.max(1, pageNo), doc.numPages));
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: maxSide / Math.max(base.width, base.height) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context を取得できません');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
    return canvas;
  } finally {
    doc.destroy();
  }
}

/**
 * 班長・地区長向けの事務連絡PDFか（ラベルで判定）
 *
 * 「全地区長共通の仕事」「班長の仕事」「前期班長さんへ」など、役員の作業一覧。
 * 住民向けカレンダーに載せる催しではないうえ、表形式のスキャンで誤読しやすいので、
 * 抽出の選択から既定で外す（一覧には残すので、必要なら人が選べる）。
 */
export function isOfficeNoticePdf(label: string, publisher = ''): boolean {
  const s = `${label} ${publisher}`;
  return /班長|地区長|お渡し下さい|お渡しください|役員の仕事/.test(s);
}
