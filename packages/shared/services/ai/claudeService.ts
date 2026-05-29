/**
 * Claude AI サービス
 *
 * PDFから記事を抽出するためのClaude API統合機能を提供します。
 *
 * @module services/claudeService
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Article, Category, ExtractionResult } from '../../types/index.js';
import type { BusScheduleExtractionResult, BusSchedule } from '../../types/index.js';
import { MOCK_ARTICLES } from '../../constants/mockData.js';

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
      max_tokens: 16000,
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
  } catch (error: any) {
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

【最重要】PDFに含まれる全ての記事・お知らせ・イベント・予定を漏れなく抽出してください。
特に予定表やスケジュール一覧は、各項目を個別の記事として抽出してください。
1つも省略しないでください。

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
- high: 全会員が必ず確認すべき重要情報のみ
  例：総会、自治会費、施設休館、ゴミ収集変更、防犯・防災の緊急情報
  ※ 単にイベントに締切があるだけではhighにしない
- medium: 一般的なイベント告知、お知らせ
  例：清掃活動、納涼大会、講座、募集
- low: 参考情報、読み物、報告、サービス案内
  例：会議報告、サークル活動、庖丁とぎ、図書紹介、俳句

**control_date**: この記事に関連する日付があれば YYYY-MM-DD 形式（開催日、締切日、期間開始日など。なければnull）

**event_date**: categoryが"event"の場合、開催日を YYYY-MM-DD 形式で（なければnull）
**event_time**: categoryが"event"の場合、時間帯（例: "10:00-12:00"、"13時～"。なければnull）
**event_location**: categoryが"event"の場合、開催場所（例: "関ヶ谷自治会館"、"奥座公園"。なければnull）

**4段階要約**:
- headline: 5文字以内（例：どんど焼き、会館休館）
- brief: 15文字程度（例：1/10どんど焼き開催）
- summary: 40文字程度（いつ・どこで・何を が全部入る）
- content: 記事の本文全体をMarkdown形式で記述
  ※ タイトル（title）と同じ文言は本文の冒頭に含めないこと。タイトルは別フィールドで表示されるため、本文では内容の説明から始めてください。
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

**tags**: 以下に該当する場合のみ ["募集"] を付与（該当しなければ空配列）
- 人の募集（隊員募集、参加者募集、ボランティア募集など）
- モノの募集（寄贈のお願い、提供のお願い、本の寄付など）
- 「募集」「大募集」「寄贈」などのキーワードが本文に含まれる場合は積極的に付与する

**visibility**: 常に "public"

**source**: この記事の出典（例：関ヶ谷だより、会報ふれあい）

**attachments**: PDFへのリンクが必要な場合のみ（基本的には空配列）

3. 特殊な扱い：

**合同会議議事録**:
- 重要な決定事項は個別記事として抽出
- 議事録全文は1つの記事として、attachmentsにPDFリンク

**予定表・スケジュール一覧**:
- 日付+タイトルだけが並ぶ予定一覧（例：4月○○、5月△△、6月□□...）は、個別記事に分解しない
- 1つの記事「今後の予定」としてまとめ、contentに一覧表形式（Markdown）で全項目を記載する
- PDFの右側カラム・サイドバーに掲載されている予定表も必ず抽出する（スキップ厳禁）
- ただし、日付+説明文が付いている本格的なイベント告知は個別記事として抽出する

**文化欄（俳句・図書など）**:
- category: "culture"
- priority: "low"
- すべて含める（省略しない）

4. 禁止事項：
- HTMLタグ（<br>, <p>, <b>, <table>など）は絶対に使わないでください
- 改行はMarkdownの改行（空行または行末2スペース）を使用してください

5. 出力形式：
必ずJSON形式で返してください。前後の説明文は不要です。

{
  "articles": [
    {
      "title": "...",
      "category": "event",
      "article_type": "official",
      "priority": "high",
      "control_date": "2026-01-10",
      "event_date": "2026-01-10",
      "event_time": "11:00-12:00",
      "event_location": "奥座公園",
      "headline": "どんど焼き",
      "brief": "1/10どんど焼き開催",
      "summary": "1月10日（土）11時～奥座公園でどんど焼き。お焚き上げ、豚汁振る舞い、餅つき体験",
      "content": "...",
      "tags": [],
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

  // HTMLタグを除去（AIが<br>等を混入させることがある）
  return parsed.articles.map((article: any) => {
    const cleanHtml = (text: string | null | undefined) => {
      if (!text) return text;
      return text
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?[^>]+(>|$)/g, '');
    };
    return {
      ...article,
      content: cleanHtml(article.content),
      summary: cleanHtml(article.summary),
      brief: cleanHtml(article.brief),
      headline: cleanHtml(article.headline),
    };
  });
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
    control_date: null,
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
    control_date: null,
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
 * 切り抜き画像から1つの記事を抽出
 */
export async function extractArticleFromImage(
  imageBase64: string | string[],
  categories: Category[]
): Promise<{
  title: string;
  summary: string;
  content: string;
  category: string;
  priority: string;
  event_date: string | null;
  event_time: string | null;
  event_location: string | null;
  tags: string[];
}> {
  const client = getClaudeClient();
  if (!client) throw new Error('Claude APIが設定されていません');

  const categoryList = categories.map(c => `- ${c.id}: ${c.label}`).join('\n');

  const prompt = `
この画像は自治会の広報紙の一部を切り抜いたものです。
この部分から記事を1つ抽出し、以下のJSON形式で返してください。

{
  "title": "記事タイトル（20文字以内）",
  "summary": "要約（40文字程度。いつ・どこで・何をが入る）",
  "content": "本文全体をMarkdown形式で。タイトルと同じ文言は冒頭に含めない。見出しは##、箇条書きは-、重要情報は**太字**",
  "category": "カテゴリID",
  "priority": "high/medium/low",
  "event_date": "イベントの場合 YYYY-MM-DD（なければnull）",
  "event_time": "時間帯（例: 10:00-12:00、なければnull）",
  "event_location": "場所（なければnull）",
  "tags": []
}

カテゴリ:
${categoryList}

priority:
- high: 総会、会費、休館、防犯防災の緊急情報のみ
- medium: 一般的なイベント、お知らせ
- low: 報告、コラム、サービス案内

tags: 人やモノの募集がある場合のみ ["募集"]

予定表のような一覧形式の場合は、「今後の予定」というタイトルで1つの記事にまとめ、contentに表形式で全項目を記載してください。

必ずJSON形式のみで出力。前後の説明文は不要です。
`;

  const images = Array.isArray(imageBase64) ? imageBase64 : [imageBase64];
  const imageContents = images.map(data => ({
    type: 'image' as const,
    source: { type: 'base64' as const, media_type: 'image/png' as const, data },
  }));

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: [...imageContents, { type: 'text' as const, text: prompt }],
    }],
  });

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as any).text)
    .join('\n');

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AIからJSON応答を取得できませんでした');

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    title: parsed.title || 'お知らせ',
    summary: parsed.summary || '',
    content: parsed.content || '',
    category: parsed.category || 'notice',
    priority: parsed.priority || 'medium',
    event_date: parsed.event_date || null,
    event_time: parsed.event_time || null,
    event_location: parsed.event_location || null,
    tags: parsed.tags || [],
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
  pdfBase64: string,
  publisherNames?: string[]
): Promise<{
  suggestedTitle: string;
  suggestedIssueNumber: string;
  suggestedPublisher: string;
}> {
  const client = getClaudeClient();
  if (!client) {
    // フォールバック: ファイル名から推測
    return {
      suggestedTitle: '',
      suggestedIssueNumber: '',
      suggestedPublisher: '',
    };
  }

  const publisherList = publisherNames && publisherNames.length > 0
    ? `\n【登録済みの発行元一覧】\n${publisherNames.join('、')}\n上記から最も近いものを選んでください。該当がなければ空文字にしてください。\n`
    : '';

  const prompt = `
このPDFから以下の情報を抽出してください。

【抽出項目】
1. タイトル: この文書を最もよく表す名前
2. 号数: 第○号、○○年○月号など（あれば）
3. 発行元: この文書を発行した団体・組織名
${publisherList}
【文書タイプ別の判断基準】

■ 定期刊行物（だより、会報、ニュースなど）の場合:
→ 固有名称を返す（例: 「福祉よこはま」「関ヶ谷だより」「防災ニュース金沢」）

■ 単発のお知らせ・通知・チラシの場合:
→ 文書の見出し・タイトルをそのまま返す（例: 「自治会費の集金と納入について」「防犯パトロールのお願い」「公園清掃のご案内」）

【出力形式】
{
  "title": "タイトル",
  "issueNumber": "号数（なければ空文字）",
  "publisher": "発行元（登録済み一覧から選択、なければ空文字）"
}

【禁止事項】
- 「広報誌」「お知らせ」「チラシ」「ニュースレター」「文書」のような一般名称だけを返さないでください
- 必ず内容を特定できる具体的な名前にしてください
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
        suggestedTitle: '',
        suggestedIssueNumber: '',
        suggestedPublisher: '',
      };
    }

    console.log('🔍 抽出されたJSON文字列:', jsonMatch[0]);

    const metadata = JSON.parse(jsonMatch[0]);
    console.log('🔍 パースされたメタデータ:', metadata);

    const result = {
      suggestedTitle: metadata.title || '',
      suggestedIssueNumber: metadata.issueNumber || '',
      suggestedPublisher: metadata.publisher || '',
    };

    console.log('✅ 最終的に返す値:', result);

    return result;
  } catch (error) {
    console.error('メタデータ抽出エラー:', error);
    return {
      suggestedTitle: '',
      suggestedIssueNumber: '',
      suggestedPublisher: '',
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
