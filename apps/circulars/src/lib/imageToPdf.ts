/**
 * 写真（JPG / PNG / WebP）を PDF に変換する（ブラウザ内で完結。ライブラリ不要）
 *
 * 回覧板の「PDFを追加」で写真を選べるようにするためのもの（2026-10-26）。
 * あとの処理（サムネイル・AI読み取り・切り抜き・公開側の表示）はすべて PDF 前提なので、
 * 入口で PDF に変換してしまえば、そのまま今まで通りに動く。
 *
 * 流れ: 画像を読み込む（スマホ写真の向きも直す）→ 長辺 MAX_SIDE px に縮小 → JPEG にする
 *       → 1枚＝1ページの PDF に包む（JPEG は PDF にそのまま入れられる DCTDecode 形式）
 */

/* global ImageBitmap, createImageBitmap, Image, TextEncoder */

/** 長辺の上限（px）。スマホ写真は 4000px 以上あり、容量と AI 読み取りの速さのため縮める */
const MAX_SIDE = 2000;
/** JPEG の画質（0〜1） */
const JPEG_QUALITY = 0.85;

export const isPdfFile = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
export const isImageFile = (f: File) => /^image\/(jpeg|png|webp)$/.test(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name);

/** 1ページぶんの JPEG データ */
export interface JpegPage {
  data: Uint8Array;
  width: number;
  height: number;
}

/**
 * 画像ファイルを読み込み、縮小して JPEG にする。
 * createImageBitmap の imageOrientation で、スマホ写真の「横向きで保存されているが正しくは縦」を直す。
 * PNG の透明部分は白で塗る（JPEG に透明は無いため）。
 */
export async function imageFileToJpeg(file: File): Promise<JpegPage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // 古いブラウザ向け: <img> で読む（向きの補正は無し）
    bitmap = await new Promise<ImageBitmap>((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        createImageBitmap(img).then(resolve, reject);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('画像を読み込めませんでした'));
      };
      img.src = url;
    });
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('画像を描画できませんでした');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  if (!blob) throw new Error('JPEG に変換できませんでした');
  return { data: new Uint8Array(await blob.arrayBuffer()), width, height };
}

/**
 * JPEG を 1枚＝1ページで並べた PDF を組み立てる（純粋関数。テストしやすいように DOM を使わない）。
 * ページの大きさは A4 の幅（縦なら 595pt、横なら 842pt）に合わせ、高さは画像の縦横比から決める。
 */
export function buildJpegPdf(pages: JpegPage[]): Uint8Array {
  if (pages.length === 0) throw new Error('ページがありません');
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (part: Uint8Array | string) => {
    const bytes = typeof part === 'string' ? enc.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  /** オブジェクトを書き出す（位置を xref 用に記録） */
  const writeObject = (num: number, head: string, stream?: Uint8Array) => {
    offsets[num] = length;
    push(`${num} 0 obj\n${head}\n`);
    if (stream) {
      push('stream\n');
      push(stream);
      push('\nendstream\n');
    }
    push('endobj\n');
  };

  // オブジェクト番号: 1=カタログ, 2=ページ一覧, 以降 ページごとに [ページ, 画像, 描画命令] の3つ
  const pageObjNums = pages.map((_, i) => 3 + i * 3);
  push('%PDF-1.4\n%âãÏÓ\n');
  writeObject(1, '<< /Type /Catalog /Pages 2 0 R >>');
  writeObject(2, `<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${pages.length} >>`);

  pages.forEach((p, i) => {
    const pageNum = pageObjNums[i];
    const imageNum = pageNum + 1;
    const contentNum = pageNum + 2;
    const pageWidth = p.width >= p.height ? 842 : 595;
    const pageHeight = Math.round((pageWidth * p.height) / p.width);
    writeObject(
      pageNum,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 ${imageNum} 0 R >> >> /Contents ${contentNum} 0 R >>`
    );
    writeObject(
      imageNum,
      `<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.data.length} >>`,
      p.data
    );
    const content = enc.encode(`q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im0 Do Q`);
    writeObject(contentNum, `<< /Length ${content.length} >>`, content);
  });

  const objectCount = 3 + pages.length * 3;
  const xrefOffset = length;
  push(`xref\n0 ${objectCount}\n0000000000 65535 f \n`);
  for (let n = 1; n < objectCount; n++) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${objectCount} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

/**
 * 写真ファイル（1枚以上）を 1つの PDF ファイルにする（1枚＝1ページ）。
 * ファイル名は最初の写真の名前の拡張子を .pdf に変えたもの
 */
export async function imagesToPdfFile(files: File[]): Promise<File> {
  const pages: JpegPage[] = [];
  for (const f of files) pages.push(await imageFileToJpeg(f));
  const pdf = buildJpegPdf(pages);
  const name = files[0].name.replace(/\.[^.]+$/, '') + '.pdf';
  return new File([pdf], name, { type: 'application/pdf' });
}
