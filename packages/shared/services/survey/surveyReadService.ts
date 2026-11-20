/**
 * アンケート回答用紙の AI 読み取り（Gemini）
 *
 * - 画像1枚（用紙1枚）を送り、構造化出力で JSON を受ける
 * - 既定は gemini-3.8-flash（2026-11-20 の試し読みで 5票77設問すべて一致、○に×の票だけ low を返した）。
 *   混雑（503）のときは待って再試行し、それでも駄目なら gemini-3.6-flash に切り替える
 * - 費用の見込みと実績はここで計算する（単価は下の表。料金改定時はここを直す）
 * - 本番ブラウザは ai-proxy 経由（シークレット GEMINI_API_KEY）。開発は VITE_GEMINI_API_KEY で直接
 */
import { callGeminiGenerate, extractGeminiText, hasGeminiEventAccess } from '../ai/geminiService.js';
import { buildSurveyReadPrompt, buildSurveyResponseSchema, normalizeReading, type SurveyDefinition, type SurveySheetReading } from './surveyDefinition.js';

export const SURVEY_READ_MODEL = 'gemini-3.8-flash';
export const SURVEY_READ_FALLBACK_MODEL = 'gemini-3.6-flash';

/** トークン使用量 */
export interface TokenUsage {
  input: number;
  output: number;
  thinking: number;
}

/**
 * 単価（USD / 100万トークン）。CC-SaaS/docs/AIコスト・モデル方針.md の 2026-09 時点の値。
 * 思考トークンは出力と同じ単価で課金される。
 */
export const GEMINI_PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  'gemini-3.8-flash': { input: 0.75, output: 3.75 },
  'gemini-3.6-flash': { input: 0.75, output: 3.75 },
  'gemini-3.5-flash-lite': { input: 0.1, output: 0.4 },
};
/** 円換算のレート（見込み表示用。厳密な為替ではない） */
export const JPY_PER_USD = 155;

/** 1票あたりの見込みトークン（2026-11-20 の実測: 150dpi グレースケール A4 で入力 1,849、思考 約600、出力 約330） */
export const SURVEY_SHEET_TOKENS_ESTIMATE: TokenUsage = { input: 1850, output: 350, thinking: 600 };

/** 使用量 → 金額（円） */
export function costJpy(usage: TokenUsage, model: string = SURVEY_READ_MODEL): number {
  const p = GEMINI_PRICE_PER_MTOK[model] ?? GEMINI_PRICE_PER_MTOK[SURVEY_READ_MODEL];
  const usd = (usage.input * p.input + (usage.output + usage.thinking) * p.output) / 1_000_000;
  return usd * JPY_PER_USD;
}

/** n 票の見込み金額（円） */
export function estimateSurveyCostJpy(sheets: number, model: string = SURVEY_READ_MODEL): number {
  return costJpy(
    {
      input: SURVEY_SHEET_TOKENS_ESTIMATE.input * sheets,
      output: SURVEY_SHEET_TOKENS_ESTIMATE.output * sheets,
      thinking: SURVEY_SHEET_TOKENS_ESTIMATE.thinking * sheets,
    },
    model
  );
}

export function formatJpy(yen: number): string {
  if (yen < 1) return `${(Math.ceil(yen * 10) / 10).toFixed(1)} 円`;
  return `${Math.ceil(yen).toLocaleString('ja-JP')} 円`;
}

export function canReadSurvey(): boolean {
  return hasGeminiEventAccess();
}

export interface SurveyReadResult {
  reading: SurveySheetReading;
  usage: TokenUsage;
  model: string;
  elapsedMs: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 429 の retryDelay（秒）を取り出す。無ければ null */
export function parseRetrySeconds(msg: string): number | null {
  const m = msg.match(/retry in ([\d.]+)s/i) ?? msg.match(/"retryDelay":"(\d+)s"/) ?? msg.match(/retryDelay[^0-9]*(\d+)/);
  return m ? Number(m[1]) : null;
}

/** 1日の無料枠を使い切ったエラーか（待っても数十分は直らない） */
export function isDailyQuotaError(msg: string): boolean {
  if (!/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) return false;
  const s = parseRetrySeconds(msg);
  return s === null || s > 300;
}

/**
 * 用紙1枚を読む。
 * @param imageBase64 PNG/JPEG の base64（データURLの前置きなし）
 * @param opts.model 既定 gemini-3.8-flash。opts.onRetry は再試行のたびに呼ぶ（画面の進捗用）
 */
export async function readSurveySheet(
  def: SurveyDefinition,
  imageBase64: string,
  mimeType: 'image/png' | 'image/jpeg',
  opts: { model?: string; onRetry?: (msg: string) => void } = {}
): Promise<SurveyReadResult> {
  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ inlineData: { mimeType, data: imageBase64 } }, { text: buildSurveyReadPrompt(def) }],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: buildSurveyResponseSchema(def),
      temperature: 0,
    },
  };
  const models = [opts.model ?? SURVEY_READ_MODEL, SURVEY_READ_FALLBACK_MODEL];
  const t0 = Date.now();
  let lastErr: unknown;
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await callGeminiGenerate(body, model);
        const text = extractGeminiText(res);
        const m = text.match(/\{[\s\S]*\}/);
        const parsed = m ? JSON.parse(m[0]) : {};
        const u = res.usageMetadata ?? {};
        return {
          reading: normalizeReading(def, parsed),
          usage: { input: u.promptTokenCount ?? 0, output: u.candidatesTokenCount ?? 0, thinking: u.thoughtsTokenCount ?? 0 },
          model,
          elapsedMs: Date.now() - t0,
        };
      } catch (e) {
        lastErr = e;
        const msg = e instanceof Error ? e.message : String(e);
        if (isDailyQuotaError(msg)) throw new Error(`今日の無料枠を使い切りました（${model}）。明日17時ごろ以降にやり直すか、有料枠のキーに切り替えてください`);
        const busy = /\b503\b|UNAVAILABLE|overloaded|high demand/i.test(msg);
        const rate = /\b429\b|RESOURCE_EXHAUSTED/i.test(msg);
        if (!busy && !rate) throw e;
        const wait = rate ? Math.min((parseRetrySeconds(msg) ?? 15) + 1, 60) * 1000 : 15000 * (attempt + 1);
        opts.onRetry?.(`${model} が${busy ? '混んでいます' : '回数制限中です'}。${Math.round(wait / 1000)}秒待って再試行（${attempt + 1}/3）`);
        await sleep(wait);
      }
    }
    opts.onRetry?.(`${model} が混んでいるため控えのモデルに切り替えます`);
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
