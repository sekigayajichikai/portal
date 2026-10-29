/**
 * 関ヶ谷だよりの「同封物一覧」と登録済みPDFの突き合わせ（AI）
 *
 * 号の画面「PDFの点検」から使う。関ヶ谷だより（先頭PDF）に載っている今月の回覧物の一覧を AI に読ませ、
 * 登録済みPDFの名前と比べて「一覧にあるのに未登録」を見つける。
 * プロンプトと結果の読み取りは Gemini / Claude 共通（呼び出しは geminiService / claudeService、切替は aiService）。
 */

import { repairJsonString } from './jsonRepair.js';

/** 一覧の1項目。matched_label は登録済みPDFの名前（一字一句同じ）か、見つからなければ null */
export interface EnclosureItem {
  name: string;
  matched_label: string | null;
}

export interface EnclosureCheckResult {
  /** 紙面に一覧が見つかったか（無ければ enclosures は空） */
  found: boolean;
  enclosures: EnclosureItem[];
}

/**
 * プロンプト（PDF と一緒に送る）
 * @param labels - 登録済みPDFの名前（画面の順）
 */
export function buildEnclosurePrompt(labels: string[]): string {
  const list = labels.map((l, i) => `${i + 1}. ${l}`).join('\n');
  return `この PDF は自治会の広報紙「関ヶ谷だより」です。
紙面のどこかに、今月の回覧に入っている書類の一覧があります（「同封物」「回覧物」「配布物」「今月の回覧」「折込」「お知らせ一覧」などの見出しの下に、書類の名前が並んでいる部分）。

【やること】
1. その一覧を探し、書類の名前を上から順にすべて書き出してください（番号や「〜について」も名前の一部ならそのまま）。一覧が見つからなければ found を false にし、enclosures は空にしてください。
2. 書き出した各書類について、下の【登録済みPDF】の中に同じ書類があれば、その名前を**一字一句そのまま** matched_label に入れてください。無ければ null。
   - 号数・日付・全角半角・「のお知らせ」「について」の有無など、表記の揺れは同じ書類とみなしてください
   - 同じ書類が登録済みPDFに2つ以上あるとき（赤い羽根共同募金が3枚など）は、どれか1つを入れてください
   - 本当に迷うときは null にしてください（人が確かめます）

【出力】
次の形の JSON だけを返してください。前後の説明は不要です。
{"found":true,"enclosures":[{"name":"書類の名前","matched_label":"登録済みPDFの名前 または null"}]}

【登録済みPDF】
${list}
`;
}

/**
 * AI の返事を結果にする。matched_label は登録済みの名前と一致するものだけ残す（AI が作った名前は null に）
 * @param text - AI の返事（JSON か、コードブロック入り）
 * @param labels - 登録済みPDFの名前
 */
export function parseEnclosureResponse(text: string, labels: string[]): EnclosureCheckResult {
  const json = text.match(/```json\s*([\s\S]*?)\s*```/)?.[1] ?? text.match(/\{[\s\S]*\}/)?.[0] ?? text;
  let parsed: any;
  try {
    parsed = JSON.parse(json);
  } catch {
    try {
      parsed = JSON.parse(repairJsonString(json).replace(/,\s*([}\]])/g, '$1'));
    } catch {
      console.error('同封物一覧の結果を読めませんでした:', text.slice(0, 200));
      throw new Error('同封物一覧の結果を読み取れませんでした');
    }
  }
  const known = new Set(labels);
  const enclosures: EnclosureItem[] = (Array.isArray(parsed?.enclosures) ? parsed.enclosures : [])
    .filter((e: any) => typeof e?.name === 'string' && e.name.trim())
    .map((e: any) => ({
      name: String(e.name).trim(),
      matched_label: typeof e.matched_label === 'string' && known.has(e.matched_label) ? e.matched_label : null,
    }));
  return { found: parsed?.found !== false && enclosures.length > 0, enclosures };
}
