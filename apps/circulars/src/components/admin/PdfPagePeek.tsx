/**
 * 元のPDFのページを開いて見比べるための部品
 *
 * スキャン画像のPDF（文字データが無い）は、AIが目で見て読む（OCR）ため日付などを取り違えることがある。
 * 抽出結果の横にこれを置き、人が元のページと見比べられるようにする（2026-09-29 追加）。
 * 画像はブラウザ内で pdf.js が描く。AIもサーバーも使わない。
 */

import React, { useEffect, useState } from 'react';
import { FileSearch, X, Loader2 } from 'lucide-react';
import { renderPdfPage } from './pdfInspect';

interface PdfPagePeekProps {
  /** 見るPDFのURL */
  url: string;
  /** PDFの名前（ボタンの説明に出す） */
  label: string;
  /** ページ数（不明なら1） */
  pages: number;
  /** 一度に描くページ数の上限（多いと重いので） */
  maxPages?: number;
}

export const PdfPagePeek: React.FC<PdfPagePeekProps> = ({ url, label, pages, maxPages = 6 }) => {
  const [open, setOpen] = useState(false);
  const [srcs, setSrcs] = useState<Record<number, string>>({});
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState<number | null>(null);
  const shown = Math.min(Math.max(1, pages), maxPages);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      for (let p = 1; p <= shown; p++) {
        if (cancelled) return;
        try {
          const canvas = await renderPdfPage(url, p, 900);
          if (cancelled) return;
          setSrcs((prev) => ({ ...prev, [p]: canvas.toDataURL('image/jpeg', 0.85) }));
        } catch (e) {
          console.warn('PDFのページを描けませんでした:', url, p, e);
          if (!cancelled) setFailed(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, url, shown]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
        title={`${label} のページを開いて、読み取った内容と見比べます`}
      >
        <FileSearch size={11} />
        {open ? '元のページを閉じる' : '元のページと見比べる'}
      </button>

      {open && (
        <div className="mt-1.5 p-2 rounded-lg border border-amber-200 bg-amber-50/50">
          <p className="text-[11px] text-amber-800 mb-1.5">
            {label}（{pages}ページ{pages > shown ? `・先頭${shown}ページのみ表示` : ''}）。画像をクリックすると大きく見られます。
            <strong>日付と行事名の対応がずれていないか確かめてください。</strong>
          </p>
          {failed && <p className="text-[11px] text-red-600 mb-1">ページを描けませんでした。PDFを直接開いて確認してください。</p>}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {Array.from({ length: shown }, (_, i) => i + 1).map((p) => (
              <div key={p} className="shrink-0">
                {srcs[p] ? (
                  <img
                    src={srcs[p]}
                    alt={`${label} ${p}ページ目`}
                    onClick={() => setZoom(p)}
                    className="h-56 w-auto rounded border border-slate-300 bg-white cursor-zoom-in hover:border-amber-400"
                  />
                ) : (
                  <div className="h-56 w-40 rounded border border-slate-200 bg-white flex items-center justify-center text-slate-300">
                    <Loader2 size={16} className="animate-spin" />
                  </div>
                )}
                <p className="text-[10px] text-slate-400 text-center mt-0.5">{p}ページ目</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 拡大表示 */}
      {zoom !== null && srcs[zoom] && (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" onClick={() => setZoom(null)}>
          <button className="absolute top-4 right-4 text-white/80 hover:text-white" onClick={() => setZoom(null)} title="閉じる">
            <X size={28} />
          </button>
          <img
            src={srcs[zoom]}
            alt={`${label} ${zoom}ページ目`}
            className="max-h-full max-w-full rounded shadow-2xl bg-white"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
};
