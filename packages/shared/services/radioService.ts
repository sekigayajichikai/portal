/**
 * ラジオ番組生成サービス
 *
 * デジタル回覧板の記事から、2人のDJによる掛け合い形式のラジオ番組を生成します。
 * 生成された音声はSupabase Storageに保存され、データベースで管理されます。
 *
 * @module services/radioService
 */

import { GoogleGenAI } from '@google/genai';
import { supabase } from './supabaseClient.js';
import { getArticlesByNewsletterId } from './newsletterService.js';
import { uploadAudio } from './storageService.js';
import { generateRadioAudio } from './geminiService.js';
import {
  RadioProgram,
  RadioGenerationRequest,
  RadioGenerationProgress,
  Article,
} from '../types/index.js';

/**
 * Gemini AI クライアントインスタンスを取得する
 */
function getAIClient(): GoogleGenAI | null {
  // 環境変数のチェック順序
  const processApiKey = (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY);
  const viteApiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
  const plainApiKey = (import.meta as any).env?.GEMINI_API_KEY;

  const apiKey = processApiKey || viteApiKey || plainApiKey;

  console.log('🔍 APIキー読み込み状況:');
  console.log('  process.env.GEMINI_API_KEY:', !!(typeof process !== 'undefined' && process.env?.GEMINI_API_KEY));
  console.log('  import.meta.env.VITE_GEMINI_API_KEY:', !!(import.meta as any).env?.VITE_GEMINI_API_KEY);
  console.log('  最終判定:', !!apiKey);

  if (!apiKey) {
    console.error('❌ Gemini APIキーが設定されていません。');
    console.error('📋 解決方法:');
    console.error('  1. apps/admin/.envファイルに VITE_GEMINI_API_KEY=YOUR_KEY を追加');
    console.error('  2. サーバーを再起動 (npm run dev:admin)');
    console.error('  3. ブラウザをリフレッシュ (Ctrl+Shift+R)');
    return null;
  }

  console.log('✅ Gemini APIキーが見つかりました');
  return new GoogleGenAI({ apiKey });
}

/**
 * ラジオ番組を生成するメイン処理
 *
 * @param request 生成リクエスト
 * @param onProgress 進捗コールバック関数
 * @returns 生成されたラジオ番組情報
 */
export const generateRadioProgram = async (
  request: RadioGenerationRequest,
  onProgress?: (progress: RadioGenerationProgress) => void
): Promise<RadioProgram> => {
  const { newsletterId, organizationId, targetDurationMinutes = 4 } = request;

  try {
    // ステップ1: 記事を取得
    onProgress?.({
      status: 'generating',
      currentStep: '記事を取得中...',
      progress: 10,
    });

    const articles = await getArticlesByNewsletterId(newsletterId);

    if (articles.length === 0) {
      throw new Error('記事が見つかりません');
    }

    console.log(`📰 ${articles.length}件の記事を取得しました`);

    // ステップ2: 記事を優先度順にソート
    const sortedArticles = sortArticlesByPriority(articles);

    // ステップ3: 台本を生成
    onProgress?.({
      status: 'generating',
      currentStep: '台本を生成中...',
      progress: 30,
    });

    const script = await generateRadioScriptFromArticles(sortedArticles, targetDurationMinutes);
    console.log(`📝 台本生成完了: ${script.length}文字`);

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/39fced81-7f2b-4fe6-9a93-36e9412f9849',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'radioService.ts:92',message:'SCRIPT GENERATED',data:{scriptLength:script.length,scriptWordCount:script.split(/\s+/).length,scriptPreview:script.substring(0,300),scriptFull:script},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,B'})}).catch(()=>{});
    // #endregion

    // ステップ4: 台本全体から音声を生成（1回のみ）
    onProgress?.({
      status: 'generating',
      currentStep: '音声を生成中...',
      progress: 50,
    });

    const audioBlob = await generateAudioFromScript(script);
    console.log(`🎤 音声生成完了: ${(audioBlob.size / 1024 / 1024).toFixed(2)} MB`);

    // ステップ5: Supabase Storageにアップロード
    onProgress?.({
      status: 'generating',
      currentStep: 'アップロード中...',
      progress: 85,
    });

    const newsletter = await getNewsletterById(newsletterId);
    const filename = `radio-${newsletterId}-${Date.now()}.wav`;

    const uploadResult = await uploadAudio(audioBlob, filename);
    console.log(`☁️ アップロード完了: ${uploadResult.url}`);

    // ステップ6: データベースに保存
    onProgress?.({
      status: 'generating',
      currentStep: '保存中...',
      progress: 95,
    });

    const durationSeconds = await getAudioDuration(audioBlob);

    const radioProgram = await saveRadioProgram({
      newsletterId,
      organizationId,
      title: `${newsletter.title} ラジオ版`,
      description: `${articles.length}件の記事をラジオ番組にしました`,
      durationSeconds,
      script,
      audioUrl: uploadResult.url,
      audioFilename: uploadResult.filename,
      articleCount: articles.length,
      segmentCount: 1, // 簡略化により常に1
    });

    // 完了
    onProgress?.({
      status: 'completed',
      currentStep: '完了しました！',
      progress: 100,
    });

    console.log(`✅ ラジオ番組生成完了: ${radioProgram.id}`);

    return radioProgram;
  } catch (error: any) {
    console.error('❌ ラジオ番組生成エラー:', error);

    onProgress?.({
      status: 'failed',
      currentStep: '生成に失敗しました',
      progress: 0,
      error: error.message,
    });

    throw error;
  }
};

/**
 * 記事を優先度順にソート
 *
 * @param articles 記事の配列
 * @returns ソートされた記事の配列
 */
function sortArticlesByPriority(articles: Article[]): Article[] {
  const priorityOrder: { [key: string]: number } = {
    high: 1,
    medium: 2,
    low: 3,
  };

  return [...articles].sort((a, b) => {
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;

    // 優先度が同じ場合はピン留めを優先
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;

    return 0;
  });
}

/**
 * 台本全体から音声を生成（簡略版）
 *
 * @param script 完全な台本
 * @returns 音声のBlob
 */
async function generateAudioFromScript(script: string): Promise<Blob> {
  try {
    console.log('🎙️ 台本から音声を生成中...');
    const blobUrl = await generateRadioAudio(script);

    if (!blobUrl) {
      throw new Error('音声の生成に失敗しました');
    }

    const response = await fetch(blobUrl);
    if (!response.ok) {
      throw new Error(`音声データの取得に失敗しました: ${response.status}`);
    }

    const blob = await response.blob();
    console.log(`✅ 音声生成完了: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);

    return blob;
  } catch (error: any) {
    console.error('❌ 音声生成エラー:', error);
    throw new Error(`音声の生成に失敗しました: ${error.message}`);
  }
}

/**
 * 記事から2人の掛け合い台本を生成
 *
 * @param articles 記事の配列
 * @param targetDurationMinutes 目標の長さ（分）
 * @returns 生成された台本
 */
export const generateRadioScriptFromArticles = async (
  articles: Article[],
  targetDurationMinutes: number = 4
): Promise<string> => {
  const ai = getAIClient();

  if (!ai) throw new Error('Gemini APIキーが設定されていません');

  // 重要な記事を選択（最大5件）
  const topArticles = articles.slice(0, 5);

  // 記事の要約リストを作成
  const articleSummaries = topArticles
    .map((article, index) => {
      return `${index + 1}. 【${article.title}】\n   ${article.summary}${article.deadline ? `\n   締切: ${article.deadline}` : ''}`;
    })
    .join('\n\n');

  const prompt = `あなたは地域コミュニティラジオのDJです。2人で楽しく掛け合いながら、自治会のお知らせを紹介するラジオ番組の台本を作成してください。

【役割設定】
- DJ A（女性・明るく元気な声）: メインの進行役、親しみやすい雰囲気
- DJ B（男性・落ち着いた声）: サポート役、補足説明や質問役

【番組構成】
1. オープニング（約30秒）
   - 明るい挨拶とリスナーへの呼びかけ
   - 今月の概要を簡潔に紹介

2. メインコンテンツ（約3分）
   - 各記事を2人で掛け合いながら紹介
   - 重要なポイントをわかりやすく説明
   - 必要に応じて期限や場所を強調

3. エンディング（約30秒）
   - 締めの挨拶
   - リスナーへの感謝

【今月の記事】
${articleSummaries}

【重要な指示】
- 台本は必ず「A: 」と「B: 」で話者を明示してください
- 全体で約${targetDurationMinutes}分（約${targetDurationMinutes * 200}文字）になるように調整してください
- 自然な会話口調で、親しみやすく
- 専門用語は避け、誰にでもわかりやすい表現を使用
- 重要な情報（日時、場所、期限など）は必ず含める
- セクション（オープニング、メインコンテンツ、エンディング）を「---」で区切ってください
- マークダウン記法（**太字**、__下線__など）は使用しないでください。音声読み上げ用のプレーンテキストで出力してください

それでは、台本を作成してください。`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 2048,
      },
    });

    let script = response.text;

    if (!script) {
      throw new Error('台本の生成に失敗しました');
    }

    // マークダウン記法を削除（TTS用にプレーンテキスト化）
    script = script.replace(/\*\*/g, ''); // 太字を削除
    script = script.replace(/__/g, ''); // 下線を削除
    script = script.replace(/\*/g, ''); // イタリックを削除
    script = script.replace(/_/g, ''); // イタリック（アンダースコア）を削除

    return script;
  } catch (error: any) {
    console.error('台本生成エラー:', error);
    throw new Error('台本の生成に失敗しました');
  }
};

/**
 * 音声ファイルの長さ（秒）を取得
 */
async function getAudioDuration(audioBlob: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const durationSeconds = Math.round(audioBuffer.duration);
        audioContext.close();
        resolve(durationSeconds);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = reject;
    reader.readAsArrayBuffer(audioBlob);
  });
}

/**
 * ラジオ番組をデータベースに保存
 */
async function saveRadioProgram(data: {
  newsletterId: string;
  organizationId: string;
  title: string;
  description: string;
  durationSeconds: number;
  script: string;
  audioUrl: string;
  audioFilename: string;
  articleCount: number;
  segmentCount: number;
}): Promise<RadioProgram> {
  const { error, data: result } = await supabase
    .from('radio_programs')
    .insert({
      newsletter_id: data.newsletterId,
      organization_id: data.organizationId,
      title: data.title,
      description: data.description,
      duration_seconds: data.durationSeconds,
      script: data.script,
      audio_url: data.audioUrl,
      audio_filename: data.audioFilename,
      generation_status: 'completed',
      generated_at: new Date().toISOString(),
      article_count: data.articleCount,
      segment_count: data.segmentCount,
      model_version: 'gemini-2.5-flash (script + audio)',
    })
    .select()
    .single();

  if (error) {
    console.error('ラジオ番組保存エラー:', error);
    throw new Error('ラジオ番組の保存に失敗しました');
  }

  return result as RadioProgram;
}

/**
 * Newsletterを取得
 */
async function getNewsletterById(newsletterId: string) {
  const { data, error } = await supabase
    .from('newsletters')
    .select('*')
    .eq('id', newsletterId)
    .single();

  if (error) {
    throw new Error('デジタル回覧板が見つかりません');
  }

  return data;
}

/**
 * ラジオ番組一覧を取得
 *
 * @param organizationId 組織ID（オプション）
 * @returns ラジオ番組の配列
 */
export const getRadioPrograms = async (organizationId?: string): Promise<RadioProgram[]> => {
  let query = supabase
    .from('radio_programs')
    .select('*')
    .eq('generation_status', 'completed')
    .order('created_at', { ascending: false });

  if (organizationId) {
    query = query.eq('organization_id', organizationId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('ラジオ番組一覧取得エラー:', error);
    throw new Error('ラジオ番組の取得に失敗しました');
  }

  return (data as RadioProgram[]) || [];
};

/**
 * 特定のNewsletterのラジオ番組を取得
 *
 * @param newsletterId Newsletter ID
 * @returns ラジオ番組（存在しない場合はnull）
 */
export const getRadioProgramByNewsletterId = async (
  newsletterId: string
): Promise<RadioProgram | null> => {
  const { data, error } = await supabase
    .from('radio_programs')
    .select('*')
    .eq('newsletter_id', newsletterId)
    .maybeSingle();

  if (error) {
    console.error('ラジオ番組取得エラー:', error);
    throw new Error('ラジオ番組の取得に失敗しました');
  }

  return data as RadioProgram | null;
};

/**
 * ラジオ番組を削除
 *
 * @param radioProgramId ラジオ番組ID
 */
export const deleteRadioProgram = async (radioProgramId: string): Promise<void> => {
  const { error } = await supabase.from('radio_programs').delete().eq('id', radioProgramId);

  if (error) {
    console.error('ラジオ番組削除エラー:', error);
    throw new Error('ラジオ番組の削除に失敗しました');
  }
};
