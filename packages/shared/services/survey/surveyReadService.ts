/**
 * アンケート回答用紙の AI 読み取り（Gemini）
 *
 * - 画像1枚（用紙1枚）を送り、構造化出力で JSON を受ける
 * - 既定は gemini-3.8-flash（2026-11-20 の試し読みで 5票77設問すべて一致、○に×の票だけ low を返した）。
 *   混雑（503）や応答なし（30秒）のときは、すぐ gemini-3.6-flash に切り替え、その後 10 分は最初から 3.6 で読む（2026-11-23）
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

/**
 * 1回の呼び出しを待つ上限（ミリ秒）。ふだんは 1枚 5〜20 秒。
 * 2026-11-23: gemini-3.8-flash が応答を返さないまま止まり、控えのモデルにも切り替わらず画面が進まなくなったため入れた
 */
export const SURVEY_READ_TIMEOUT_MS = 30000; // 2026-11-23: 60秒 → 30秒（はなさん「3.6 にすぐ切り替えていい」。ふつうの読み取りは 5〜20 秒）
/**
 * 既定のモデルが応答なし・混雑だったら、この時間は既定のモデルを飛ばして最初から控えのモデルで読む。
 * 1枚ごとに 30 秒待ち直さないため（22枚なら 11 分の無駄になる）
 */
export const SURVEY_PRIMARY_SKIP_MS = 10 * 60 * 1000;
let primarySkipUntil = 0;
const TIMEOUT_MARK = 'SURVEY_READ_TIMEOUT';
const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(TIMEOUT_MARK)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });

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
  const primary = opts.model ?? SURVEY_READ_MODEL;
  // さっき応答なし・混雑だった既定のモデルは、しばらく飛ばす
  const models = Date.now() < primarySkipUntil && primary !== SURVEY_READ_FALLBACK_MODEL ? [SURVEY_READ_FALLBACK_MODEL] : [primary, SURVEY_READ_FALLBACK_MODEL];
  const t0 = Date.now();
  let lastErr: unknown;
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await withTimeout(callGeminiGenerate(body, model), SURVEY_READ_TIMEOUT_MS);
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
        // 応答なし: 同じモデルで待ち直さず、すぐ控えのモデルへ（控えも応答なしなら、その旨のエラーで止める）
        if (msg === TIMEOUT_MARK) {
          lastErr = new Error(`${model} から ${SURVEY_READ_TIMEOUT_MS / 1000} 秒たっても応答がありません。時間をおいてやり直してください`);
          opts.onRetry?.(`${model} から応答がありません。`);
          if (model === primary) primarySkipUntil = Date.now() + SURVEY_PRIMARY_SKIP_MS;
          break;
        }
        if (isDailyQuotaError(msg)) throw new Error(`今日の無料枠を使い切りました（${model}）。明日17時ごろ以降にやり直すか、有料枠のキーに切り替えてください`);
        const busy = /\b503\b|UNAVAILABLE|overloaded|high demand/i.test(msg);
        const rate = /\b429\b|RESOURCE_EXHAUSTED/i.test(msg);
        if (!busy && !rate) throw e;
        // 既定のモデルが混んでいる（503）ときは、待ち直さずにすぐ控えのモデルへ。回数制限（429）は少し待てば通るので従来どおり待つ
        if (busy && model === primary && model !== SURVEY_READ_FALLBACK_MODEL) {
          primarySkipUntil = Date.now() + SURVEY_PRIMARY_SKIP_MS;
          break;
        }
        const wait = rate ? Math.min((parseRetrySeconds(msg) ?? 15) + 1, 60) * 1000 : 15000 * (attempt + 1);
        opts.onRetry?.(`${model} が${busy ? '混んでいます' : '回数制限中です'}。${Math.round(wait / 1000)}秒待って再試行（${attempt + 1}/3）`);
        await sleep(wait);
      }
    }
    if (model !== models[models.length - 1]) opts.onRetry?.(`${model} が使えないため、控えのモデル ${models[models.length - 1]} に切り替えます`);
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
