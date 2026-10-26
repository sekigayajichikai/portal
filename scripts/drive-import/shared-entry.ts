/**
 * 本番の共有コード（packages/shared）のうち、Drive 取り込みで使うものだけを1つにまとめる入口。
 * build.mjs が esbuild で Node 用にバンドルして、index.mjs から import する。
 *
 * ここに並べたものは管理画面の「PDFを追加」が使っているのと同じ関数。
 * つまり自動取り込みの結果は、人が「PDFを追加」したときと同じ形になる。
 */
export { extractArticlesFromPDF, extractPDFMetadata } from '../../packages/shared/services/ai/claudeService';
export { getNewsletters, saveNewsletter, addArticlesToNewsletter, addPdfUrlToNewsletter } from '../../packages/shared/services/data/newsletterService';
export { uploadPDF } from '../../packages/shared/services/data/storageService';
export { getPublisherNames } from '../../packages/shared/services/data/publisherService';
export { MOCK_CATEGORIES } from '../../packages/shared/constants';
