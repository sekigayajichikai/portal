/**
 * 画像関連の型定義
 *
 * PDFから抽出された画像の管理に関する型を定義します。
 */

/**
 * 保留画像
 *
 * PDFから抽出された画像で、記事への紐付けが保留中のもの。
 * Newsletterごとに管理され、管理画面で記事に手動で紐付けることができます。
 */
export interface PendingImage {
  /** 保留画像のUUID */
  id: string;

  /** 画像が属するNewsletterのID */
  newsletter_id: string;

  /** 組織ID */
  organization_id: string;

  /** 画像の公開URL */
  image_url: string;

  /** Storageバケット内の相対パス */
  storage_path: string;

  /** 画像のキャプション（Claude AIが検出） */
  caption: string | null;

  /** PDFのページ番号 */
  page_number: number;

  /** 画像の位置情報（座標、サイズなど） */
  position_info: { x: number; y: number; width: number; height: number } | null;

  /** 画像周辺のテキスト（前後3行程度、Claude AIが検出） */
  detected_context: string | null;

  /** AIが推奨する記事IDの配列 */
  suggested_article_ids: string[];

  /** 記事との関連性の確信度（0.0-1.0） */
  confidence_score: number;

  /** ステータス: pending=保留中, assigned=紐付け完了, rejected=却下 */
  status: 'pending' | 'assigned' | 'rejected';

  /** 紐付けられた記事のID */
  assigned_to_article_id: string | null;

  /** 作成日時 */
  created_at: string;

  /** 紐付け完了日時 */
  assigned_at: string | null;
}

/**
 * 保留画像の入力データ（新規作成時）
 *
 * データベースに保存する前のデータ形式。
 * idやcreated_atなどの自動生成フィールドは含まれません。
 */
export type PendingImageInput = Omit<PendingImage, 'id' | 'created_at' | 'assigned_at'>;

/**
 * AI検出画像情報
 *
 * Claude APIがPDFから検出した画像のメタデータ。
 * 実際の画像データ（Blob）とともに返されます。
 */
export interface ImageWithContext {
  /** 画像データ（PNG/JPEG形式のBlob） */
  imageData: Blob;

  /** 画像が含まれるページ番号 */
  pageNumber: number;

  /** 画像のキャプション（近くにあれば） */
  caption: string | null;

  /** 画像周辺のテキスト（Claude AIが検出） */
  detectedContext: string;

  /** この画像が関連すると思われる記事のインデックス（0始まり、不明ならnull） */
  suggestedArticleIndex: number | null;

  /** 記事との関連性の確信度（0.0-1.0） */
  confidenceScore: number;

  /** 画像の位置情報（オプション） */
  positionInfo?: { x: number; y: number; width: number; height: number };
}

/**
 * Claude APIの画像検出結果
 *
 * PDFを解析した際にClaude APIが返す画像情報。
 * 実際の画像データはまだ含まれていません（メタデータのみ）。
 */
export interface ImageDetectionResult {
  /** 画像が含まれるページ番号 */
  pageNumber: number;

  /** 画像のキャプション */
  caption: string | null;

  /** 画像周辺のテキスト */
  detectedContext: string;

  /** 推奨する記事のインデックス（0始まり） */
  suggestedArticleIndex: number | null;

  /** 確信度（0.0-1.0） */
  confidenceScore: number;
}

/**
 * 画像抽出結果
 *
 * PDFから画像を抽出した結果。
 * 画像データとメタデータの両方を含みます。
 */
export interface ImageExtractionResult {
  /** 抽出された画像の配列 */
  images: ImageWithContext[];

  /** 処理時間（ミリ秒） */
  processingTime: number;
}

/**
 * 画像アップロード結果
 */
export interface ImageUploadResult {
  /** 画像の公開URL */
  url: string;

  /** Storageバケット内の相対パス */
  path: string;

  /** ファイル名 */
  filename: string;
}
