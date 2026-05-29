/**
 * PDFサムネイルコンポーネント
 *
 * 画面に表示された時だけPDFをダウンロード→1ページ目を画像化。
 * IntersectionObserverで遅延読み込み。
 */

import React, { useState, useEffect, useRef } from 'react';
import { FileText } from 'lucide-react';

// キャッシュ（同じURLは再処理しない）
const thumbnailCache = new Map<string, string>();

// 同時処理数を制限するキュー
let activeCount = 0;
const queue: (() => void)[] = [];
const MAX_CONCURRENT = 2;

function enqueue(fn: () => Promise<void>) {
  return new Promise<void>((resolve) => {
    const run = async () => {
      activeCount++;
      try { await fn(); } finally {
        activeCount--;
        resolve();
        if (queue.length > 0) queue.shift()!();
      }
    };
    if (activeCount < MAX_CONCURRENT) run();
    else queue.push(run);
  });
}

interface PdfThumbnailProps {
  url: string;
  className?: string;
}

export const PdfThumbnail: React.FC<PdfThumbnailProps> = ({ url, className }) => {
  const [dataUrl, setDataUrl] = useState<string | null>(thumbnailCache.get(url) || null);
  const [isLoading, setIsLoading] = useState(!thumbnailCache.has(url));
  const [hasError, setHasError] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 画面に入ったら読み込み開始
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setIsVisible(true); observer.disconnect(); } },
      { rootMargin: '200px' } // 200px手前から開始
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  // 表示されたらPDFを処理
  useEffect(() => {
    if (!isVisible || thumbnailCache.has(url)) {
      if (thumbnailCache.has(url)) { setDataUrl(thumbnailCache.get(url)!); setIsLoading(false); }
      return;
    }

    let cancelled = false;

    enqueue(async () => {
      try {
        // pdfjs-distを動的インポート（初回のみ読み込み）
        const pdfjsLib = await import('pdfjs-dist');
        const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const page = await doc.getPage(1);

        const scale = 1.0; // 軽量化のためscale下げる
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas failed');

        await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
        const result = canvas.toDataURL('image/jpeg', 0.7);

        if (!cancelled) {
          thumbnailCache.set(url, result);
          setDataUrl(result);
        }

        // メモリ解放
        doc.destroy();
      } catch {
        if (!cancelled) setHasError(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [isVisible, url]);

  if (hasError) {
    return (
      <div ref={ref} className={`bg-slate-100 flex items-center justify-center ${className || ''}`}>
        <FileText size={32} className="text-slate-400" />
      </div>
    );
  }

  if (!isVisible || isLoading) {
    return (
      <div ref={ref} className={`bg-slate-100 ${isVisible ? 'animate-pulse' : ''} ${className || ''}`} />
    );
  }

  return (
    <div ref={ref}>
      <img src={dataUrl!} alt="PDF" className={`object-cover ${className || ''}`} />
    </div>
  );
};
