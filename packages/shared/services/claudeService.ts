/**
 * Claude AI サービス
 *
 * PDFから記事を抽出するためのClaude API統合機能を提供します。
 *
 * @module services/claudeService
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Article, Category, ExtractionResult } from '../types/index.js';
import type { BusScheduleExtractionResult, BusSchedule } from '../types/index.js';
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

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'claudeService.ts:getClaudeClient',message:'Claudeクライアント取得',data:{hasApiKey:!!apiKey,apiKeyLength:apiKey?.length,apiKeyPrefix:apiKey?.substring(0,10),processEnvExists:typeof process !== 'undefined',hostname:typeof window !== 'undefined' ? window.location.hostname : 'unknown'},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
  // #endregion

  if (!apiKey) {
    console.warn('Claude APIキーが設定されていません。モックデータを使用します。');
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'claudeService.ts:getClaudeClient:nokey',message:'APIキーなし',data:{hostname:typeof window !== 'undefined' ? window.location.hostname : 'unknown'},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
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

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'claudeService.ts:extractArticlesFromPDF:start',message:'Claude抽出開始',data:{hasClient:!!client,pdfSize:pdfBase64.length,hostname:typeof window !== 'undefined' ? window.location.hostname : 'unknown'},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3'})}).catch(()=>{});
  // #endregion

  if (!client) {
    // APIキーがない場合はモックデータを返す
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'claudeService.ts:extractArticlesFromPDF:mock',message:'モックデータ返却',data:{reason:'clientなし',hostname:typeof window !== 'undefined' ? window.location.hostname : 'unknown'},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    return mockExtractArticles();
  }

  const startTime = Date.now();

  // プロンプト生成
  const prompt = generateExtractionPrompt(categories);

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'claudeService.ts:extractArticlesFromPDF:before-api-call',message:'Claude API呼び出し直前',data:{model:'claude-sonnet-4-20250514',max_tokens:8000,promptLength:prompt.length,pdfSize:pdfBase64.length,hostname:typeof window !== 'undefined' ? window.location.hostname : 'unknown'},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H5'})}).catch(()=>{});
  // #endregion

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

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'claudeService.ts:extractArticlesFromPDF:after-api-call',message:'Claude API呼び出し成功',data:{responseId:response.id,model:response.model,stopReason:response.stop_reason,contentLength:response.content?.length,usage:response.usage,hostname:typeof window !== 'undefined' ? window.location.hostname : 'unknown'},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H5'})}).catch(()=>{});
    // #endregion

    // レスポンスからテキストを抽出
    const textContent = response.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'claudeService.ts:extractArticlesFromPDF:no-text-content',message:'テキストレスポンスが見つからない',data:{contentTypes:response.content.map(c=>c.type),hostname:typeof window !== 'undefined' ? window.location.hostname : 'unknown'},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H6'})}).catch(()=>{});
      // #endregion
      throw new Error('テキストレスポンスが見つかりません');
    }

    // JSONを抽出して解析
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'claudeService.ts:extractArticlesFromPDF:before-parse',message:'JSON解析開始',data:{textLength:textContent.text.length,textPreview:textContent.text.substring(0,200),hostname:typeof window !== 'undefined' ? window.location.hostname : 'unknown'},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H6'})}).catch(()=>{});
    // #endregion
    const articles = parseArticlesFromResponse(textContent.text);

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'claudeService.ts:extractArticlesFromPDF:success',message:'記事抽出完了',data:{articleCount:articles.length,processingTime:Date.now()-startTime,hostname:typeof window !== 'undefined' ? window.location.hostname : 'unknown'},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H5'})}).catch(()=>{});
    // #endregion

    return {
      articles,
      processingTime: Date.now() - startTime,
    };
  } catch (error: any) {
    console.error('Claude API エラー:', error);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'claudeService.ts:extractArticlesFromPDF:error',message:'Claude APIエラー',data:{errorType:error?.constructor?.name,errorMessage:error?.message,errorStatus:error?.status,errorCode:error?.error?.type,errorDetail:error?.error?.message,errorStack:error?.stack?.substring(0,500),hostname:typeof window !== 'undefined' ? window.location.hostname : 'unknown'},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4'})}).catch(()=>{});
    // #endregion
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

**article_type**: 記事の種類（自治会公式の広報誌なので、常に "official" を設定）
- official: 自治会からの公式なお知らせ
- local-info: 地域からのお知らせ（※このPDFは自治会公式なので使用しない）

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
- content: 記事の本文全体をMarkdown形式で記述
  ※ Markdown記法の指示：
  - 見出しは ## または ### を使用
  - 箇条書きは - または 1. を使用
  - 段落は空行で区切る
  - 日時や場所などの重要情報は **太字** で強調
  - 改行を適切に保持

  【出力例】
  ## イベント概要
  日時: **1月10日（土）10:00-12:00**
  場所: **関ヶ谷公民館**

  ## 内容
  新春の伝統行事「どんど焼き」を開催します。

  - お正月飾りやお札をお持ちください
  - ぜんざいの無料提供あり

  ## 参加方法
  事前申込不要。当日直接会場へお越しください。

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
      "article_type": "official",
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

/**
 * PDFから簡易記事（タイトル + 1行要約のみ）を抽出
 *
 * 自治会外の資料（学校便り、駐在所お知らせなど）向けの軽量抽出モード。
 * 詳細な4段階要約は行わず、タイトルと1行の要約のみを抽出します。
 * PDFファイル自体は添付ファイルとして保存されることを前提としています。
 *
 * @param pdfBase64 - Base64エンコードされたPDFデータ
 * @param categories - 組織のカテゴリ設定
 * @param pdfUrl - アップロード済みPDFの公開URL
 * @param pdfFilename - PDFのファイル名
 * @returns 簡易記事データと処理時間
 */
export async function extractBriefArticleFromPDF(
  pdfBase64: string,
  categories: Category[],
  pdfUrl: string,
  pdfFilename: string
): Promise<ExtractionResult> {
  const client = getClaudeClient();

  if (!client) {
    // APIキーがない場合はモックデータを返す
    return mockExtractBriefArticle(pdfFilename);
  }

  const startTime = Date.now();

  // 簡易抽出用プロンプト
  const prompt = generateBriefExtractionPrompt(categories, pdfFilename);

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000, // 簡易版なので少なめ
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
    const articleData = parseBriefArticleFromResponse(textContent.text);

    // PDF添付情報を追加
    const article = {
      ...articleData,
      attachments: [
        {
          type: 'pdf' as const,
          url: pdfUrl,
          label: pdfFilename,
        },
      ],
    };

    return {
      articles: [article],
      processingTime: Date.now() - startTime,
    };
  } catch (error) {
    console.error('Claude API エラー（簡易抽出）:', error);
    throw error;
  }
}

/**
 * 簡易抽出用プロンプト生成
 *
 * タイトルと1行要約のみを抽出するための軽量プロンプト。
 *
 * @param categories - 組織のカテゴリ設定
 * @param filename - PDFのファイル名（参考情報）
 * @returns プロンプト文字列
 */
function generateBriefExtractionPrompt(categories: Category[], filename: string): string {
  return `
あなたは自治会の広報資料を整理する専門家です。
このPDF資料について、最小限の情報（タイトルと1行要約のみ）を抽出してください。

【PDFファイル名】
${filename}

【抽出項目】
1. **title**: このPDF資料のタイトル（20文字以内）
   - 例: 「○○小学校だより 1月号」「駐在所だより」「地区センター行事予定」

2. **category**: 以下から選択
${categories.map((c) => `   - ${c.id}: ${c.label}`).join('\n')}

3. **brief**: 1行の要約（15文字程度）
   - 例: 「1月の行事予定表」「防犯情報と相談窓口」

4. **priority**: 重要度
   - high: 重要なお知らせ
   - medium: 一般的な情報（推奨）
   - low: 参考資料

5. **visibility**: 公開範囲
   - public: 一般公開（推奨）
   - members-only: 会員限定

6. **tags**: 関連キーワード2-3個

【注意事項】
- 詳細な要約は不要です（PDFを見れば分かるため）
- タイトルと1行要約だけで「何の資料か」が分かるようにしてください
- 出力はJSON形式のみ（説明文は不要）

【出力形式】
{
  "title": "○○小学校だより 1月号",
  "category": "announcement",
  "priority": "medium",
  "brief": "1月の行事予定表",
  "tags": ["学校", "行事"],
  "visibility": "public"
}
`;
}

/**
 * 簡易記事レスポンスの解析
 *
 * @param responseText - Claude APIからのレスポンステキスト
 * @returns 簡易記事データ
 */
function parseBriefArticleFromResponse(
  responseText: string
): Omit<Article, 'id' | 'newsletter_id' | 'organization_id' | 'created_at' | 'updated_at'> {
  // JSONブロックを探す
  const jsonMatch =
    responseText.match(/```json\s*([\s\S]*?)\s*```/) || responseText.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    throw new Error('JSONレスポンスが見つかりません');
  }

  const jsonText = jsonMatch[1] || jsonMatch[0];
  const parsed = JSON.parse(jsonText);

  // 必須フィールドを補完
  return {
    title: parsed.title || 'お知らせ',
    category: parsed.category || 'announcement',
    article_type: 'local-info', // 簡易モードは地域のお知らせ
    priority: parsed.priority || 'medium',
    deadline: null,
    headline: parsed.title?.substring(0, 5) || 'お知らせ',
    brief: parsed.brief || 'PDFをご覧ください',
    summary: parsed.brief || 'PDFをご覧ください',
    content: `詳細は添付のPDFファイルをご覧ください。\n\n${parsed.brief || ''}`,
    tags: parsed.tags || [],
    visibility: parsed.visibility || 'public',
    source: parsed.title || '',
    attachments: [], // 後で追加される
    display_order: 0,
    is_pinned: false,
  };
}

/**
 * 簡易記事のモック抽出
 *
 * @param filename - PDFのファイル名
 * @returns モック簡易記事データ
 */
function mockExtractBriefArticle(filename: string): ExtractionResult {
  const article: Omit<
    Article,
    'id' | 'newsletter_id' | 'organization_id' | 'created_at' | 'updated_at'
  > = {
    title: filename.replace('.pdf', ''),
    category: 'announcement',
    article_type: 'local-info', // 簡易モードは地域のお知らせ
    priority: 'medium',
    deadline: null,
    headline: 'お知らせ',
    brief: 'PDFをご覧ください',
    summary: 'PDFをご覧ください',
    content: '詳細は添付のPDFファイルをご覧ください。',
    tags: ['お知らせ'],
    visibility: 'public',
    source: filename,
    attachments: [],
    display_order: 0,
    is_pinned: false,
  };

  return {
    articles: [article],
    processingTime: 1000,
  };
}

/**
 * PDFからメタデータ（タイトル、号数）を抽出
 *
 * Claude APIを使用してPDFの先頭部分を解析し、
 * 広報誌のタイトルと号数を抽出します。
 *
 * @param pdfBase64 - Base64エンコードされたPDFデータ
 * @returns タイトルと号数の提案
 */
export async function extractPDFMetadata(
  pdfBase64: string
): Promise<{
  suggestedTitle: string;
  suggestedIssueNumber: string;
}> {
  const client = getClaudeClient();
  if (!client) {
    // フォールバック: ファイル名から推測
    return {
      suggestedTitle: '広報誌',
      suggestedIssueNumber: '',
    };
  }

  const prompt = `
このPDFの先頭部分から以下の情報を抽出してください。

【抽出項目】
1. タイトル: 広報誌の名称（例: 関ヶ谷だより、会報ふれあい）
2. 号数: 第○号、○○年○月号など

【出力形式】
JSON形式で出力してください：
{
  "title": "タイトル",
  "issueNumber": "号数"
}

【注意事項】
- タイトルが見つからない場合は "広報誌" と出力
- 号数が見つからない場合は空文字列 "" と出力
- 必ずJSON形式で出力すること
`;

  try {
    const startTime = Date.now();

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500, // メタデータのみなので少なく
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

    const processingTime = Date.now() - startTime;
    console.log(`メタデータ抽出処理時間: ${processingTime}ms`);

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as any).text)
      .join('\n');

    console.log('🔍 AIのレスポンステキスト:', text);

    // JSONを抽出（```json ... ``` の形式にも対応）
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('⚠️ JSONが見つかりませんでした。レスポンス全文:', text);
      return {
        suggestedTitle: '広報誌',
        suggestedIssueNumber: '',
      };
    }

    console.log('🔍 抽出されたJSON文字列:', jsonMatch[0]);

    const metadata = JSON.parse(jsonMatch[0]);
    console.log('🔍 パースされたメタデータ:', metadata);

    const result = {
      suggestedTitle: metadata.title || '広報誌',
      suggestedIssueNumber: metadata.issueNumber || '',
    };

    console.log('✅ 最終的に返す値:', result);

    return result;
  } catch (error) {
    console.error('メタデータ抽出エラー:', error);
    return {
      suggestedTitle: '広報誌',
      suggestedIssueNumber: '',
    };
  }
}

/**
 * PDFからバス時刻表を抽出
 *
 * Claude Sonnet 4.5を使用してバス時刻表PDFを解析し、
 * 路線名、バス停名、時刻を構造化して抽出します。
 *
 * @param pdfBase64 - Base64エンコードされたPDFデータ
 * @returns 抽出されたバス時刻表データと処理時間
 */
export async function extractBusScheduleFromPDF(
  pdfBase64: string
): Promise<BusScheduleExtractionResult> {
  const client = getClaudeClient();

  if (!client) {
    // APIキーがない場合はモックデータを返す
    return mockExtractBusSchedule();
  }

  const startTime = Date.now();

  const prompt = `このPDFはバスの時刻表です。以下の情報を抽出してJSON形式で返してください。

【PDFの構造】
- **バス停名**: 右上に小さく表示されています
- **行き先**: 中央に大きく表示されています
- **路線名**: PDFに記載がない場合が多いです（空文字でOK）
- **実施日**: 左下に日付が表示されています（有効期間開始日として使用）
- **時刻表**: 平日/休日（土日祝）で分かれている場合があります

【抽出する情報】
1. バス停名（右上の小さい文字）
2. 行き先（中央の大きい文字）
3. 路線名（記載があれば。なければ行き先を使用）
4. 平日の時刻リスト（配列）
5. 休日（土日祝）の時刻リスト（配列）
6. 実施日（左下の日付） - YYYY-MM-DD形式
7. 備考や注意事項（あれば）

【出力形式】
以下のJSON形式で返してください。

\`\`\`json
{
  "schedules": [
    {
      "routeName": "金沢文庫駅方面",
      "stopName": "野村住宅センター",
      "destination": "金沢文庫駅西口",
      "scheduleData": {
        "weekday": ["07:15", "08:45", "10:30", "13:00", "16:45", "18:30"],
        "holiday": ["08:00", "10:00", "13:00", "16:00", "18:00"]
      },
      "validFrom": "2025-10-01",
      "notes": "年末年始は運休",
      "displayOrder": 0,
      "isActive": true
    }
  ]
}
\`\`\`

【重要な注意事項】
- バス停名は右上の小さい文字から取得してください
- 行き先は中央の大きい文字から取得してください
- 路線名は記載がなければ、行き先に「方面」を付けて生成してください（例: "金沢文庫駅方面"）
- 時刻は必ず "HH:mm" 形式（24時間表記、ゼロパディング）で返してください
- 平日と休日（土日祝）の時刻を区別してください
- 平日/休日の区別がない場合は、両方に同じ時刻を設定してください
- 時刻は昇順（早い時刻から遅い時刻）にソートしてください
- 実施日（validFrom）は YYYY-MM-DD 形式で返してください
- JSON以外の説明文は不要です。JSONのみを返してください`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
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

    console.log('📄 Claude レスポンス:', textContent.text);

    // JSONを抽出して解析
    const schedules = parseBusSchedulesFromResponse(textContent.text);

    return {
      schedules,
      processingTime: Date.now() - startTime,
    };
  } catch (error) {
    console.error('バス時刻表抽出エラー:', error);
    throw error;
  }
}

/**
 * Claudeのレスポンスからバス時刻表データを解析
 *
 * @param responseText - Claudeからのレスポンステキスト
 * @returns パースされたバス時刻表の配列
 */
function parseBusSchedulesFromResponse(
  responseText: string
): Omit<BusSchedule, 'id' | 'createdAt' | 'updatedAt'>[] {
  try {
    // JSONブロックを探す（```json ... ``` または { ... }）
    const jsonMatch =
      responseText.match(/```json\s*(\{[\s\S]*?\})\s*```/) ||
      responseText.match(/(\{[\s\S]*\})/);

    if (!jsonMatch) {
      throw new Error('JSONデータが見つかりません');
    }

    const parsed = JSON.parse(jsonMatch[1]);

    if (!parsed.schedules || !Array.isArray(parsed.schedules)) {
      throw new Error('schedules配列が見つかりません');
    }

    // データの検証とデフォルト値の設定
    return parsed.schedules.map((schedule: any, index: number) => {
      // 路線名が空の場合、行き先から生成
      let routeName = schedule.routeName;
      if (!routeName && schedule.destination) {
        routeName = `${schedule.destination}方面`;
      }
      if (!routeName) {
        routeName = '不明な路線';
      }

      return {
        routeName,
        stopName: schedule.stopName || '不明なバス停',
        destination: schedule.destination || undefined,
        scheduleData: {
          weekday: Array.isArray(schedule.scheduleData?.weekday)
            ? schedule.scheduleData.weekday
            : [],
          holiday: Array.isArray(schedule.scheduleData?.holiday)
            ? schedule.scheduleData.holiday
            : [],
        },
        validFrom: schedule.validFrom || undefined,
        validUntil: schedule.validUntil || undefined,
        notes: schedule.notes || undefined,
        displayOrder: schedule.displayOrder ?? index,
        isActive: schedule.isActive ?? true,
      };
    });
  } catch (error) {
    console.error('バス時刻表パースエラー:', error);
    console.error('レスポンステキスト:', responseText);
    throw new Error(`バス時刻表データの解析に失敗しました: ${error}`);
  }
}

/**
 * モックバス時刻表データを返す（APIキー未設定時）
 */
function mockExtractBusSchedule(): BusScheduleExtractionResult {
  console.log('📋 モックバス時刻表データを使用します');

  return {
    schedules: [
      {
        routeName: '駅方面',
        stopName: '自治会館前',
        destination: '中央駅前',
        scheduleData: {
          weekday: ['07:15', '08:45', '10:30', '13:00', '16:45', '18:30'],
          holiday: ['08:00', '10:00', '13:00', '16:00', '18:00'],
        },
        notes: 'モックデータです',
        displayOrder: 0,
        isActive: true,
      },
      {
        routeName: '市民病院方面',
        stopName: '中央公園',
        destination: '市民病院',
        scheduleData: {
          weekday: ['09:00', '11:00', '14:00', '16:00'],
          holiday: ['09:30', '13:30', '16:30'],
        },
        displayOrder: 1,
        isActive: true,
      },
    ],
    processingTime: 100,
  };
}
