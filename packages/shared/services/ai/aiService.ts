/**
 * AI統合サービス
 *
 * 環境変数に基づいて適切なAIプロバイダー（Claude直接 or OpenRouter）を選択します。
 *
 * @module services/aiService
 */

import type { Category, ExtractionResult, BusScheduleExtractionResult } from '../../types/index.js';
import * as claudeService from './claudeService.js';
import * as openRouterService from './openRouterService.js';

/**
 * 使用するAIプロバイダーのタイプ
 */
export type AIProvider = 'anthropic' | 'openrouter' | 'auto';

/**
 * 環境変数から使用するAIプロバイダーを取得
 *
 * @returns 使用するAIプロバイダー
 */
function getAIProvider(): AIProvider {
  // 環境変数で明示的に指定されている場合
  const provider =
    (typeof process !== 'undefined' && process.env?.AI_PROVIDER) ||
    (import.meta as any).env?.VITE_AI_PROVIDER ||
    'auto';

  // #region agent log
  // デバッグログ
  console.log('🔍 環境変数チェック:', {
    'import.meta.env.VITE_AI_PROVIDER': (import.meta as any).env?.VITE_AI_PROVIDER,
    'import.meta.env.VITE_OPENROUTER_API_KEY': (import.meta as any).env?.VITE_OPENROUTER_API_KEY ? '設定済み' : '未設定',
    'import.meta.env.VITE_ANTHROPIC_API_KEY': (import.meta as any).env?.VITE_ANTHROPIC_API_KEY ? '設定済み' : '未設定',
    'provider': provider,
  });
  fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiService.ts:getAIProvider',message:'環境変数チェック',data:{vite_ai_provider:(import.meta as any).env?.VITE_AI_PROVIDER,vite_openrouter_key_exists:!!(import.meta as any).env?.VITE_OPENROUTER_API_KEY,vite_anthropic_key_exists:!!(import.meta as any).env?.VITE_ANTHROPIC_API_KEY,openrouter_key_prefix:(import.meta as any).env?.VITE_OPENROUTER_API_KEY?.substring(0,10),anthropic_key_prefix:(import.meta as any).env?.VITE_ANTHROPIC_API_KEY?.substring(0,10),provider:provider,hostname:window.location.hostname},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
  // #endregion

  return provider.toLowerCase() as AIProvider;
}

/**
 * 利用可能なAPIキーを確認
 */
function checkAvailableProviders(): {
  hasAnthropic: boolean;
  hasOpenRouter: boolean;
} {
  const anthropicKey =
    (typeof process !== 'undefined' && process.env?.ANTHROPIC_API_KEY) ||
    (import.meta as any).env?.VITE_ANTHROPIC_API_KEY;

  const openRouterKey =
    (typeof process !== 'undefined' && process.env?.OPENROUTER_API_KEY) ||
    (import.meta as any).env?.VITE_OPENROUTER_API_KEY;

  // #region agent log
  console.log('🔑 APIキーチェック:', {
    'OpenRouter': openRouterKey ? `設定済み (${openRouterKey.substring(0, 15)}...)` : '❌ 未設定',
    'Anthropic': anthropicKey ? `設定済み (${anthropicKey.substring(0, 15)}...)` : '❌ 未設定',
  });
  fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiService.ts:checkAvailableProviders',message:'APIキー確認',data:{hasAnthropic:!!anthropicKey,hasOpenRouter:!!openRouterKey,anthropicKeyLength:anthropicKey?.length,openRouterKeyLength:openRouterKey?.length,allEnvKeys:Object.keys((import.meta as any).env||{}),hostname:window.location.hostname},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
  // #endregion

  return {
    hasAnthropic: !!anthropicKey,
    hasOpenRouter: !!openRouterKey,
  };
}

/**
 * 自動的に最適なプロバイダーを選択
 */
function selectProvider(): 'anthropic' | 'openrouter' | null {
  const configuredProvider = getAIProvider();
  const available = checkAvailableProviders();

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiService.ts:selectProvider:start',message:'プロバイダー選択開始',data:{configuredProvider:configuredProvider,hasAnthropic:available.hasAnthropic,hasOpenRouter:available.hasOpenRouter,hostname:window.location.hostname},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2'})}).catch(()=>{});
  // #endregion

  // 明示的に指定されている場合
  if (configuredProvider === 'anthropic' && available.hasAnthropic) {
    console.log('✅ Anthropic Claude APIを使用します');
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiService.ts:selectProvider:anthropic',message:'Anthropic選択',data:{reason:'明示的指定',hostname:window.location.hostname},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
    return 'anthropic';
  }

  if (configuredProvider === 'openrouter' && available.hasOpenRouter) {
    console.log('✅ OpenRouter経由でAIモデルを使用します');
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiService.ts:selectProvider:openrouter',message:'OpenRouter選択',data:{reason:'明示的指定',hostname:window.location.hostname},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
    return 'openrouter';
  }

  // 自動選択モード
  if (configuredProvider === 'auto') {
    // Anthropicを優先（PDF直接処理に対応しているため）
    if (available.hasAnthropic) {
      console.log('✅ Anthropic Claude APIを使用します（自動選択）');
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiService.ts:selectProvider:auto-anthropic',message:'Anthropic自動選択',data:{reason:'auto-anthropic優先',hostname:window.location.hostname},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2'})}).catch(()=>{});
      // #endregion
      return 'anthropic';
    }

    if (available.hasOpenRouter) {
      console.log('✅ OpenRouter経由でAIモデルを使用します（自動選択）');
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiService.ts:selectProvider:auto-openrouter',message:'OpenRouter自動選択',data:{reason:'auto-openrouter',hostname:window.location.hostname},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2'})}).catch(()=>{});
      // #endregion
      return 'openrouter';
    }
  }

  console.warn('⚠️ AIプロバイダーが設定されていません。モックデータを使用します。');
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiService.ts:selectProvider:null',message:'プロバイダーなし（モック使用）',data:{configuredProvider:configuredProvider,hasAnthropic:available.hasAnthropic,hasOpenRouter:available.hasOpenRouter,hostname:window.location.hostname},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
  // #endregion
  return null;
}

/**
 * PDFから記事を抽出
 *
 * 環境変数に基づいて適切なAIプロバイダーを選択し、PDFから記事を抽出します。
 *
 * 優先順位:
 * 1. VITE_AI_PROVIDER環境変数で明示的に指定されたプロバイダー
 * 2. 利用可能なAPIキーに基づく自動選択（Anthropic優先）
 * 3. モックデータ（APIキーが設定されていない場合）
 *
 * @param pdfBase64 - Base64エンコードされたPDFデータ
 * @param categories - 組織のカテゴリ設定
 * @returns 抽出された記事のリストと処理時間
 */
export async function extractArticlesFromPDF(
  pdfBase64: string,
  categories: Category[]
): Promise<ExtractionResult> {
  const provider = selectProvider();

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiService.ts:extractArticlesFromPDF:start',message:'PDF抽出開始',data:{provider:provider,pdfSize:pdfBase64.length,categoriesCount:categories.length,hostname:window.location.hostname},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3'})}).catch(()=>{});
  // #endregion

  try {
    switch (provider) {
      case 'anthropic':
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiService.ts:extractArticlesFromPDF:anthropic-call',message:'Anthropic呼び出し',data:{provider:'anthropic',hostname:window.location.hostname},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3'})}).catch(()=>{});
        // #endregion
        return await claudeService.extractArticlesFromPDF(pdfBase64, categories);

      case 'openrouter':
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiService.ts:extractArticlesFromPDF:openrouter-call',message:'OpenRouter呼び出し',data:{provider:'openrouter',hostname:window.location.hostname},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3'})}).catch(()=>{});
        // #endregion
        return await openRouterService.extractArticlesFromPDF(pdfBase64, categories);

      default:
        // モックデータにフォールバック
        console.log('📋 モックデータを使用します');
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiService.ts:extractArticlesFromPDF:mock',message:'モックデータ使用',data:{provider:provider,reason:'APIキー未設定',hostname:window.location.hostname},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
        // #endregion
        return await claudeService.extractArticlesFromPDF(pdfBase64, categories);
    }
  } catch (error: any) {
    console.error(`${provider}での処理に失敗しました:`, error);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiService.ts:extractArticlesFromPDF:error',message:'エラー発生',data:{provider:provider,errorMessage:error.message,errorStack:error.stack,hostname:window.location.hostname},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4'})}).catch(()=>{});
    // #endregion

    // OpenRouterでPDF処理に失敗した場合、Anthropicにフォールバック
    if (provider === 'openrouter' && checkAvailableProviders().hasAnthropic) {
      console.log('🔄 Anthropic Claude APIにフォールバックします');
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiService.ts:extractArticlesFromPDF:fallback',message:'Anthropicにフォールバック',data:{from:'openrouter',hostname:window.location.hostname},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4'})}).catch(()=>{});
      // #endregion
      return await claudeService.extractArticlesFromPDF(pdfBase64, categories);
    }

    throw error;
  }
}

/**
 * PDFファイルをBase64に変換
 * （共通ユーティリティ）
 */
export async function convertPDFToBase64(file: File): Promise<string> {
  return await claudeService.convertPDFToBase64(file);
}

/**
 * 現在の設定情報を取得（デバッグ用）
 */
export function getProviderInfo(): {
  configured: AIProvider;
  available: { hasAnthropic: boolean; hasOpenRouter: boolean };
  selected: 'anthropic' | 'openrouter' | null;
} {
  return {
    configured: getAIProvider(),
    available: checkAvailableProviders(),
    selected: selectProvider(),
  };
}

/**
 * PDFから簡易記事（タイトル + 1行要約のみ）を抽出
 *
 * 自治会外の資料（学校便り、駐在所お知らせなど）向けの軽量抽出モード。
 * 詳細な4段階要約は行わず、タイトルと1行の要約のみを抽出します。
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
  const provider = selectProvider();

  try {
    switch (provider) {
      case 'anthropic':
        console.log('✅ Anthropic Claude APIで簡易抽出を実行します');
        return await claudeService.extractBriefArticleFromPDF(
          pdfBase64,
          categories,
          pdfUrl,
          pdfFilename
        );

      case 'openrouter':
        // OpenRouterは現在PDFサポートが不完全なのでモックにフォールバック
        console.warn('⚠️ OpenRouterはPDF簡易抽出に対応していません。モックデータを使用します。');
        return await claudeService.extractBriefArticleFromPDF(
          pdfBase64,
          categories,
          pdfUrl,
          pdfFilename
        );

      default:
        console.log('📋 モックデータを使用します（簡易抽出）');
        return await claudeService.extractBriefArticleFromPDF(
          pdfBase64,
          categories,
          pdfUrl,
          pdfFilename
        );
    }
  } catch (error: any) {
    console.error(`${provider}での簡易抽出に失敗しました:`, error);
    throw error;
  }
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
  const provider = selectProvider();

  switch (provider) {
    case 'anthropic':
      console.log('✅ Anthropic Claude APIでメタデータを抽出します');
      return claudeService.extractPDFMetadata(pdfBase64);
    case 'openrouter':
      // OpenRouterは現在PDFサポートが不完全なのでフォールバック
      console.warn('⚠️ OpenRouterはPDFメタデータ抽出に対応していません。デフォルト値を使用します。');
      return {
        suggestedTitle: '広報誌',
        suggestedIssueNumber: '',
      };
    default:
      console.warn('⚠️ AIプロバイダーが設定されていません。デフォルト値を使用します。');
      return {
        suggestedTitle: '広報誌',
        suggestedIssueNumber: '',
      };
  }
}

/**
 * PDFからバス時刻表を抽出
 *
 * Claude APIを使用してバス時刻表PDFを解析し、
 * 路線名、バス停名、時刻データ（平日/休日別）を抽出します。
 *
 * @param pdfBase64 - Base64エンコードされたPDFデータ
 * @returns 抽出されたバス時刻表データと処理時間
 */
export async function extractBusScheduleFromPDF(
  pdfBase64: string
): Promise<BusScheduleExtractionResult> {
  const provider = selectProvider();

  try {
    switch (provider) {
      case 'anthropic':
        console.log('✅ Anthropic Claude APIでバス時刻表を抽出します');
        return await claudeService.extractBusScheduleFromPDF(pdfBase64);

      case 'openrouter':
        // OpenRouterは現在PDFサポートが不完全なのでモックにフォールバック
        console.warn('⚠️ OpenRouterはPDFバス時刻表抽出に対応していません。モックデータを使用します。');
        return await claudeService.extractBusScheduleFromPDF(pdfBase64);

      default:
        console.log('📋 モックデータを使用します（バス時刻表抽出）');
        return await claudeService.extractBusScheduleFromPDF(pdfBase64);
    }
  } catch (error: any) {
    console.error(`${provider}でのバス時刻表抽出に失敗しました:`, error);
    throw error;
  }
}
