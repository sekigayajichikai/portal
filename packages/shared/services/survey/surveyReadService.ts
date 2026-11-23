/**
 * アンケート回答用紙の AI 読み取り（Gemini）
 *
 * - 画面は 5 枚ずつまとめて1回で送る（readSurveySheetsBatch。2026-11-23）。1枚ずつ読む readSurveySheet も残してある
 * - 構造化出力で JSON を受ける
 * - 既定は gemini-3.8-flash（2026-11-20 の試し読みで 5票77設問すべて一致、○に×の票だけ low を返した）。
 *   混雑（503）や応答なし（30秒）のときは、すぐ gemini-3.6-flash に切り替え、その後 10 分は最初から 3.6 で読む（2026-11-23）
 * - 費用の見込みと実績はここで計算する（単価は下の表。料金改定時はここを直す）
 * - 本番ブラウザは ai-proxy 経由（シークレット GEMINI_API_KEY）。開発は VITE_GEMINI_API_KEY で直接
 */
import { callGeminiGenerate, extractGeminiText, hasGeminiEventAccess } from '../ai/geminiService.js';
import { buildSurveyReadPrompt, buildSurveyResponseSchema, buildSurveyBatchPrompt, buildSurveyBatchResponseSchema, normalizeReading, type SurveyDefinition, type SurveySheetReading } from './surveyDefinition.js';

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
  if (yen <= 0) return '0 円';
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
 * Gemini を呼ぶ共通部分。応答なし・混雑のときは控えのモデルへ切り替える（readSurveySheet / readSurveySheetsBatch 共通）
 */
async function generateWithFallback(
  body: unknown,
  opts: { model?: string; onRetry?: (msg: string) => void; timeoutMs?: number }
): Promise<{ res: Awaited<ReturnType<typeof callGeminiGenerate>>; model: string }> {
  const timeoutMs = opts.timeoutMs ?? SURVEY_READ_TIMEOUT_MS;
  const primary = opts.model ?? SURVEY_READ_MODEL;
  // さっき応答なし・混雑だった既定のモデルは、しばらく飛ばす
  const models = Date.now() < primarySkipUntil && primary !== SURVEY_READ_FALLBACK_MODEL ? [SURVEY_READ_FALLBACK_MODEL] : [primary, SURVEY_READ_FALLBACK_MODEL];
  let lastErr: unknown;
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await withTimeout(callGeminiGenerate(body, model), timeoutMs);
        return { res, model };
      } catch (e) {
        lastErr = e;
        const msg = e instanceof Error ? e.message : String(e);
        // 応答なし: 同じモデルで待ち直さず、すぐ控えのモデルへ（控えも応答なしなら、その旨のエラーで止める）
        if (msg === TIMEOUT_MARK) {
          lastErr = new Error(`${model} から ${Math.round(timeoutMs / 1000)} 秒たっても応答がありません。時間をおいてやり直してください`);
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

const parseJsonObject = (text: string): unknown => {
  const m = text.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : {};
};
const usageOf = (res: { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } }): TokenUsage => {
  const u = res.usageMetadata ?? {};
  return { input: u.promptTokenCount ?? 0, output: u.candidatesTokenCount ?? 0, thinking: u.thoughtsTokenCount ?? 0 };
};

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
  const t0 = Date.now();
  const { res, model } = await generateWithFallback(body, opts);
  return { reading: normalizeReading(def, parseJsonObject(extractGeminiText(res))), usage: usageOf(res), model, elapsedMs: Date.now() - t0 };
}

/** まとめ読みの1回あたりの枚数（2026-11-20 の試し読みで 5 票まとめは 77/77 一致・取り違えなし。10 票以上は未検証） */
export const SURVEY_BATCH_SIZE = 5;

export interface SurveyBatchItem {
  /** 票名（1回の中で重複しないこと。画像の前のラベルに使い、返事との突き合わせに使う） */
  name: string;
  imageBase64: string;
  mimeType: 'image/png' | 'image/jpeg';
}

export interface SurveyBatchReadResult {
  /** 送った順。返事にその票が無かったものは null（未読のまま残して読み直す） */
  readings: Array<SurveySheetReading | null>;
  /** 1回ぶんの使用量（票ごとではない） */
  usage: TokenUsage;
  model: string;
  elapsedMs: number;
}

/**
 * 用紙を複数枚まとめて1回の呼び出しで読む（無料枠の「1日20回」を節約するため。1回 = 何枚でも1回ぶん）。
 * - 画像の前に「【票 k: 票名】」のラベルを付けて並べ、票ごとの配列で返してもらう
 * - 返事は票名で突き合わせる。順番がずれていたら flags に書き、票名が合わなければ順番で当てて flags に書く
 *   （どちらも「要確認」になるので人が見る）。返事に無い票は null
 */
export async function readSurveySheetsBatch(
  def: SurveyDefinition,
  items: SurveyBatchItem[],
  opts: { model?: string; onRetry?: (msg: string) => void } = {}
): Promise<SurveyBatchReadResult> {
  const parts: unknown[] = [];
  items.forEach((it, k) => {
    parts.push({ text: `【票 ${k + 1}: ${it.name}】` });
    parts.push({ inlineData: { mimeType: it.mimeType, data: it.imageBase64 } });
  });
  parts.push({ text: buildSurveyBatchPrompt(def) });
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: buildSurveyBatchResponseSchema(def), temperature: 0 },
  };
  const t0 = Date.now();
  // 枚数が多いぶん返事も遅い。1枚 30 秒を基準に、1枚増えるごとに 15 秒足す（5枚で 90 秒）
  const { res, model } = await generateWithFallback(body, { ...opts, timeoutMs: SURVEY_READ_TIMEOUT_MS + 15000 * Math.max(items.length - 1, 0) });
  const parsed = parseJsonObject(extractGeminiText(res)) as { sheets?: Array<Record<string, unknown>> };
  const got = Array.isArray(parsed.sheets) ? parsed.sheets : [];
  const readings = items.map((it, k) => {
    const byName = got.find((g) => g?.sheet === it.name);
    const byOrder = got[k];
    const extra: string[] = [];
    let raw: Record<string, unknown> | undefined = byName;
    if (byName && got.indexOf(byName) !== k) extra.push(`まとめ読みで順番がずれた（返事の ${got.indexOf(byName) + 1} 番目）。原本と見比べてください`);
    if (!byName && byOrder) {
      raw = byOrder;
      extra.push(`まとめ読みで票名が合わない（返事は「${String(byOrder.sheet ?? '無名')}」）。別の票の答えかもしれません。原本と見比べてください`);
    }
    if (!raw) return null;
    const r = normalizeReading(def, raw);
    return extra.length ? { ...r, flags: [...r.flags, ...extra] } : r;
  });
  return { readings, usage: usageOf(res), model, elapsedMs: Date.now() - t0 };
}
