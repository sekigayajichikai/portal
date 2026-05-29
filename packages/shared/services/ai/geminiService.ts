/**
 * Gemini AI 共通サービス
 *
 * 自治会向けのAIチャット、イベント抽出、ラジオスクリプト生成、音声生成などの機能を提供します。
 *
 * @module services/geminiService
 */

import { GoogleGenAI, Type } from '@google/genai';
import { PublicEvent } from '../../types/index.js';

/**
 * Gemini AI クライアントインスタンスを取得する
 * APIキーは環境変数から取得します。
 */
function getAIClient(): GoogleGenAI | null {
  // 環境変数のチェック順序
  const apiKey =
    (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) || // vite.config.tsのdefineから
    (import.meta as any).env?.VITE_GEMINI_API_KEY || // Viteの標準的な方法
    (import.meta as any).env?.GEMINI_API_KEY;

  console.log('🔍 [geminiService] APIキー読み込み状況:');
  console.log('  process.env.GEMINI_API_KEY:', !!(typeof process !== 'undefined' && process.env?.GEMINI_API_KEY));
  console.log('  import.meta.env.VITE_GEMINI_API_KEY:', !!(import.meta as any).env?.VITE_GEMINI_API_KEY);
  console.log('  最終判定:', !!apiKey);

  if (!apiKey) {
    console.error('❌ [geminiService] Gemini APIキーが設定されていません。');
    return null;
  }

  console.log('✅ [geminiService] Gemini APIキーが見つかりました');
  return new GoogleGenAI({ apiKey });
}

/**
 * 近所のアドバイス（AIチャット）を取得する
 */
export const getNeighborhoodTips = async (query: string, isSimpleMode: boolean = false) => {
  const ai = getAIClient();
  if (!ai) return isSimpleMode ? 'システムエラーが発生しました。' : 'エラーだよ！';

  try {
    const systemInstruction = isSimpleMode
      ? 'あなたは親切で丁寧な自治会のコンシェルジュです。高齢の方にも分かりやすく、丁寧な言葉遣いで、正確な案内を心がけてください。絵文字は控えめに、読みやすさを重視してください。'
      : 'あなたは活気あふれる自治会のAIアシスタントです。20代〜30代の若者が『この地域に住んでてよかった！』と思えるような情報を、明るく楽しく提供します。絵文字を使い、フレンドリーに接してください。';

    const prompt = isSimpleMode
      ? `自治会のWebアプリでの質問です。丁寧で分かりやすい日本語で回答してください。質問: ${query}`
      : `あなたは若者に大人気の地域コンシェルジュです。フレンドリーに回答してください。質問: ${query}`;

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: systemInstruction + '\n\n' + prompt }] }],
      generationConfig: {
        temperature: 0.7,
      },
    });

    return result.text;
  } catch (error) {
    console.error('Gemini API Error:', error);
    return isSimpleMode
      ? '申し訳ありません。現在システムが混み合っております。しばらく経ってから再度お試しください。'
      : 'ごめんね！ちょっと今、近所をパトロール中かも。後でもう一回聞いてみて！🔋';
  }
};

/**
 * テキストからイベント情報を抽出する
 */
export const extractEventsFromText = async (text: string): Promise<PublicEvent[]> => {
  const ai = getAIClient();
  if (!ai) return [];

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Extract all community events, meetings, or gatherings from the following circular text.
      Return them as a structured JSON list. If specific times or locations are missing, infer 'TBD' or the general community area.

      Circular Text:
      ${text}`,
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: 'Name of the event' },
              date: {
                type: Type.STRING,
                description: 'Date of the event (YYYY-MM-DD format if possible)',
              },
              time: { type: Type.STRING, description: 'Time of the event (e.g., 10:00 AM)' },
              location: { type: Type.STRING, description: 'Location where the event takes place' },
              description: { type: Type.STRING, description: 'Short summary of the event details' },
            },
            required: ['title', 'date', 'location', 'description'],
          },
        },
      },
    });

    const responseText = response.text;
    if (responseText) {
      const rawEvents = JSON.parse(responseText);
      return rawEvents.map((e: any, index: number) => ({
        ...e,
        id: `extracted-${Date.now()}-${index}`,
        isPublic: true,
      }));
    }
    return [];
  } catch (error) {
    console.error('Error extracting events:', error);
    return [];
  }
};

/**
 * ラジオスクリプトを生成する
 */
export const generateRadioScript = async (sourceText: string): Promise<string> => {
  const ai = getAIClient();
  if (!ai) return '';

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `You are a friendly local radio DJ for a neighborhood community.
      Convert the following newsletter/circular text into a lively, engaging 30-60 second radio script.
      Start with a cheerful greeting ("Hello neighbors!").
      Keep it warm, clear, and informative. Use simple Japanese suitable for all ages.
      Do not include stage directions like [Sound Effect], just the spoken text.

      Source Text:
      ${sourceText}`,
            },
          ],
        },
      ],
    });
    return response.text || '';
  } catch (error) {
    console.error('Error generating radio script:', error);
    return '';
  }
};

/**
 * ラジオスクリプトから音声（TTS）を生成する
 */
export const generateRadioAudio = async (script: string): Promise<string> => {
  // TTSモデル用にREST APIを直接使用
  const apiKey =
    (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) ||
    (import.meta as any).env?.VITE_GEMINI_API_KEY ||
    (import.meta as any).env?.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('❌ Gemini APIキーが設定されていません（TTS）');
    return '';
  }

  try {

    // REST API経由でTTSリクエスト（マルチスピーカー対応）
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;

    const requestBody = {
      contents: [{
        parts: [{ text: script }]
      }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: [
              {
                speaker: 'A',
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: 'Kore' }
                }
              },
              {
                speaker: 'B',
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: 'Puck' }
                }
              }
            ]
          }
        }
      }
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TTS API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    console.log('🎤 TTS REST API Response:', data);

    const candidates = data?.candidates;
    const base64Audio = candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!base64Audio) {
      console.error('❌ TTS APIからの音声データが空です');
      console.error('📋 API Response:', JSON.stringify(data, null, 2));
      throw new Error('音声データの取得に失敗しました。APIのレスポンスを確認してください。');
    }

    const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 24000,
    });
    const audioBytes = decode(base64Audio);

    const audioBuffer = await decodeAudioData(audioBytes, outputAudioContext, 24000, 1);

    const wavBlob = bufferToWave(audioBuffer, audioBuffer.length);
    const audioUrl = URL.createObjectURL(wavBlob);

    outputAudioContext.close();
    return audioUrl;
  } catch (error: any) {
    console.error('❌ 音声生成エラー:', error);
    console.error('📋 エラー詳細:', {
      message: error?.message,
      status: error?.status,
      code: error?.code,
    });
    return '';
  }
};

// --- Helper Functions for TTS ---

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

function bufferToWave(abuffer: AudioBuffer, len: number) {
  let numOfChan = abuffer.numberOfChannels,
    length = len * numOfChan * 2 + 44,
    buffer = new ArrayBuffer(length),
    view = new DataView(buffer),
    channels = [],
    i,
    sample,
    offset = 0,
    pos = 0;

  function setUint16(data: number) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: number) {
    view.setUint32(pos, data, true);
    pos += 4;
  }

  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(abuffer.sampleRate);
  setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit

  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  for (i = 0; i < abuffer.numberOfChannels; i++) channels.push(abuffer.getChannelData(i));

  while (pos < len) {
    for (i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][pos]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      view.setInt16(44 + offset, sample, true);
      offset += 2;
    }
    pos++;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}
