/**
 * Claude AI サービス
 *
 * PDFから記事を抽出するためのClaude API統合機能を提供します。
 *
 * @module services/claudeService
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Article, Category, ExtractionResult } from '../types/index.js';
import { MOCK_ARTICLES } from '../constants/mockData.js';

/**
 * Claude APIクライアントを取得
 * APIキーは環境変数から取得します。
 */
function getClaudeClient(): Anthropic | null {
  // Viteの環境変数または通常の環境変数から取得
  const apiKey =
    (typeof process !== 'undefined' && process.env?.ANTHROPIC_API_KEY) ||
    (import.meta as any).env?.VITE_ANTHROPIC_API_KEY ||
    (import.meta as any).env?.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.warn('Claude APIキーが設定されていません。モックデータを使用します。');
    return null;
  }

  return new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true, // ブラウザ環境で使用
  });
}

/**
 * PDFから記事を抽出
 *
 * Claude Sonnet 4.5を使用してPDFを解析し、記事を構造化して抽出します。
 * APIキーが未設定の場合は、モックデータを返します。
 *
 * @param pdfBase64 - Base64エンコードされたPDFデータ
 * @param categories - 組織のカテゴリ設定
 * @returns 抽出された記事のリストと処理時間
 */
export async function extractArticlesFromPDF(
  pdfBase64: string,
  categories: Category[]
): Promise<ExtractionResult> {
  const client = getClaudeClient();

  if (!client) {
    // APIキーがない場合はモックデータを返す
    return mockExtractArticles();
  }

  const startTime = Date.now();

  // プロンプト生成
  const prompt = generateExtractionPrompt(categories);

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfBase64,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
    });

    // レスポンスからテキストを抽出
    const textContent = response.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('テキストレスポンスが見つかりません');
    }

    // JSONを抽出して解析
    const articles = parseArticlesFromResponse(textContent.text);

    return {
      articles,
      processingTime: Date.now() - startTime,
    };
  } catch (error) {
    console.error('Claude API エラー:', error);
    throw error;
  }
}

/**
 * プロンプト生成
 *
 * 実装ガイドの詳細なプロンプトを使用して、Claude AIに記事抽出を指示します。
 *
 * @param categories - 組織のカテゴリ設定
 * @returns プロンプト文字列
 */
function generateExtractionPrompt(categories: Category[]): string {
  return `
あなたは自治会の広報誌を分析する専門家です。
以下の広報誌から記事を抽出し、構造化してください。

【抽出ルール】
1. 記事の区切り判断基準：
   - 見出し（大きな文字、太字）
   - 枠線や罫線で区切られたセクション
   - 明確な空白やレイアウトの変化
   - トピックの変化

2. 各記事に以下を付与：

**title（20文字以内）**: 記事の見出し。わかりやすく簡潔に。

**category**: 以下から選択
${categories.map((c) => `- ${c.id}: ${c.label}`).join('\n')}

**priority**: 
- high: 締切あり、要対応、全会員が必ず確認すべき情報
  例：施設休館、ゴミ収集変更、重要イベント、アンケート締切
- medium: 確認推奨のお知らせ、イベント告知
  例：コンサート、講座、一般的なイベント
- low: 参考情報、読み物、報告
  例：会議報告、募金結果、サークル活動

**deadline**: 締切日があれば YYYY-MM-DD 形式（なければnull）

**4段階要約**:
- headline: 5文字以内（例：どんど焼き、会館休館）
- brief: 15文字程度（例：1/10どんど焼き開催）
- summary: 40文字程度（いつ・どこで・何を が全部入る）
- content: 記事の本文全体を正確に

**tags**: 関連キーワード3-5個（配列）

**visibility**: 
- public: 地域全体に公開してOKな情報
- members-only: 会員限定（デフォルト）
- board-only: 役員のみ

**source**: この記事の出典（例：関ヶ谷だより、会報ふれあい）

**attachments**: PDFへのリンクが必要な場合のみ（基本的には空配列）

3. 特殊な扱い：

**合同会議議事録**:
- 重要な決定事項は個別記事として抽出
- 議事録全文は1つの記事として、attachmentsにPDFリンク

**文化欄（俳句・図書など）**:
- category: "culture"
- priority: "low"
- すべて含める（省略しない）

4. 出力形式：
必ずJSON形式で返してください。前後の説明文は不要です。

{
  "articles": [
    {
      "title": "...",
      "category": "event",
      "priority": "high",
      "deadline": "2026-01-10",
      "headline": "どんど焼き",
      "brief": "1/10どんど焼き開催",
      "summary": "1月10日（土）11時～奥座公園でどんど焼き。お焚き上げ、豚汁振る舞い、餅つき体験",
      "content": "...",
      "tags": ["正月", "イベント", "奥座公園"],
      "visibility": "public",
      "source": "関ヶ谷だより",
      "attachments": []
    }
  ]
}
`;
}

/**
 * レスポンスから記事を解析
 *
 * Claude APIのレスポンステキストからJSON形式の記事データを抽出します。
 *
 * @param responseText - Claude APIからのレスポンステキスト
 * @returns 記事データの配列
 */
function parseArticlesFromResponse(
  responseText: string
): Omit<Article, 'id' | 'newsletter_id' | 'organization_id' | 'created_at' | 'updated_at'>[] {
  // JSONブロックを探す（```json...```またはプレーンJSON）
  const jsonMatch =
    responseText.match(/```json\s*([\s\S]*?)\s*```/) || responseText.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    throw new Error('JSONレスポンスが見つかりません');
  }

  const jsonText = jsonMatch[1] || jsonMatch[0];
  const parsed = JSON.parse(jsonText);

  if (!parsed.articles || !Array.isArray(parsed.articles)) {
    throw new Error('記事配列が見つかりません');
  }

  return parsed.articles;
}

/**
 * モック抽出（API未設定時のフォールバック）
 *
 * APIキーが設定されていない場合、モックデータを返します。
 *
 * @returns モック記事データと処理時間
 */
function mockExtractArticles(): ExtractionResult {
  // モックデータから必要なフィールドのみを抽出
  const articles = MOCK_ARTICLES.slice(0, 3).map((a) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, newsletter_id, organization_id, created_at, updated_at, ...rest } = a;
    return rest;
  });

  return {
    articles,
    processingTime: 2000, // 2秒のシミュレート
  };
}

/**
 * PDFファイルをBase64に変換
 *
 * FileオブジェクトをBase64エンコード文字列に変換します。
 *
 * @param file - PDFファイル
 * @returns Base64エンコード文字列（データURLプレフィックスなし）
 */
export async function convertPDFToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // data:application/pdf;base64, の部分を除去
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
