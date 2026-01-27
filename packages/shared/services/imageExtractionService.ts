/**
 * 画像抽出サービス
 *
 * pdfjs-distを使用してPDFから画像を物理的に抽出します。
 * Claude APIが検出した画像情報と組み合わせて、完全な画像データを提供します。
 *
 * @module services/imageExtractionService
 */

import * as pdfjsLib from 'pdfjs-dist';
import type { ImageDetectionResult, ImageWithContext } from '../types/index.js';

// pdfjs-distのWorkerを設定（ブラウザ環境用）
if (typeof window !== 'undefined') {
  // CDN経由でWorkerを読み込み（バージョンを指定）
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.js`;
}

/**
 * PDFから画像を抽出
 *
 * Claude APIが検出した画像情報をもとに、pdfjs-distを使用して実際の画像データを抽出します。
 * 各ページをレンダリングし、Canvasから画像をBlob化します。
 *
 * @param pdfBase64 - Base64エンコードされたPDFデータ
 * @param imageDetections - Claude APIが検出した画像情報の配列
 * @returns 抽出された画像データと詳細情報
 */
export async function extractImagesFromPDF(
  pdfBase64: string,
  imageDetections: ImageDetectionResult[]
): Promise<ImageWithContext[]> {
  const startTime = Date.now();
  console.log('🖼️ PDFから画像を抽出中...', imageDetections.length, '件の画像情報');

  try {
    // Base64をUint8Arrayに変換
    const binaryString = atob(pdfBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // PDFドキュメントを読み込み
    const loadingTask = pdfjsLib.getDocument({ data: bytes });
    const pdfDocument = await loadingTask.promise;

    console.log('📄 PDF読み込み完了:', pdfDocument.numPages, 'ページ');

    const extractedImages: ImageWithContext[] = [];

    // 各検出された画像について処理
    for (const detection of imageDetections) {
      try {
        // ページ番号が有効な範囲かチェック
        if (detection.pageNumber < 1 || detection.pageNumber > pdfDocument.numPages) {
          console.warn(`⚠️ 無効なページ番号: ${detection.pageNumber}`);
          continue;
        }

        // 該当ページを取得
        const page = await pdfDocument.getPage(detection.pageNumber);

        // ページをCanvasにレンダリング
        const scale = 2.0; // 高解像度で抽出
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) {
          console.warn('⚠️ Canvas context取得失敗');
          continue;
        }

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // ページをレンダリング
        await page.render({
          canvasContext: context,
          viewport: viewport,
        }).promise;

        // CanvasをBlobに変換
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('Blob変換失敗'));
              }
            },
            'image/png',
            0.95
          );
        });

        // 抽出された画像データを追加
        extractedImages.push({
          imageData: blob,
          pageNumber: detection.pageNumber,
          caption: detection.caption,
          detectedContext: detection.detectedContext,
          suggestedArticleIndex: detection.suggestedArticleIndex,
          confidenceScore: detection.confidenceScore,
        });

        console.log(`✅ 画像抽出成功: Page ${detection.pageNumber}`);
      } catch (error) {
        console.error(`❌ 画像抽出エラー (Page ${detection.pageNumber}):`, error);
        // エラーがあっても他の画像は処理を続行
      }
    }

    const processingTime = Date.now() - startTime;
    console.log(`🎉 画像抽出完了: ${extractedImages.length}/${imageDetections.length}件 (${processingTime}ms)`);

    return extractedImages;
  } catch (error) {
    console.error('❌ PDF画像抽出エラー:', error);
    throw new Error(`PDFから画像を抽出できませんでした: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 単一ページから全画像を抽出（高度な方法）
 *
 * ページ内の画像オブジェクトを直接抽出します。
 * より正確ですが、実装が複雑なため現在は未使用です。
 *
 * @param page - PDFページオブジェクト
 * @returns 抽出された画像Blobの配列
 */
async function extractImageObjectsFromPage(page: any): Promise<Blob[]> {
  const images: Blob[] = [];

  try {
    // ページのオペレーターリストを取得
    const operatorList = await page.getOperatorList();

    // 画像オブジェクトを探す
    for (let i = 0; i < operatorList.fnArray.length; i++) {
      const fn = operatorList.fnArray[i];

      // 画像描画命令をチェック
      if (fn === pdfjsLib.OPS.paintImageXObject || fn === pdfjsLib.OPS.paintInlineImageXObject) {
        try {
          const imageName = operatorList.argsArray[i][0];

          // 画像データを取得
          const imageObj = await page.objs.get(imageName);

          if (imageObj && imageObj.data) {
            // ImageDataをBlobに変換
            const canvas = document.createElement('canvas');
            canvas.width = imageObj.width;
            canvas.height = imageObj.height;
            const ctx = canvas.getContext('2d');

            if (ctx) {
              const imageData = new ImageData(
                new Uint8ClampedArray(imageObj.data),
                imageObj.width,
                imageObj.height
              );
              ctx.putImageData(imageData, 0, 0);

              const blob = await new Promise<Blob>((resolve, reject) => {
                canvas.toBlob(
                  (blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error('Blob変換失敗'));
                  },
                  'image/png'
                );
              });

              images.push(blob);
            }
          }
        } catch (error) {
          console.warn('画像オブジェクト取得エラー:', error);
          // エラーがあっても次の画像は処理を続行
        }
      }
    }
  } catch (error) {
    console.error('オペレーターリスト取得エラー:', error);
  }

  return images;
}

/**
 * 画像のリサイズ（容量削減用）
 *
 * 大きな画像をリサイズして、Storage容量を節約します。
 * オプション機能として使用できます。
 *
 * @param blob - 元の画像Blob
 * @param maxWidth - 最大幅（ピクセル）
 * @param maxHeight - 最大高さ（ピクセル）
 * @returns リサイズされた画像Blob
 */
export async function resizeImage(
  blob: Blob,
  maxWidth: number = 1200,
  maxHeight: number = 1200
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // アスペクト比を保持してリサイズ
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      if (height > maxHeight) {
        width = (width * maxHeight) / height;
        height = maxHeight;
      }

      // Canvas にリサイズして描画
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Canvas context取得失敗'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (resizedBlob) => {
          if (resizedBlob) {
            resolve(resizedBlob);
          } else {
            reject(new Error('リサイズBLob生成失敗'));
          }
        },
        'image/png',
        0.9
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('画像読み込み失敗'));
    };

    img.src = url;
  });
}
