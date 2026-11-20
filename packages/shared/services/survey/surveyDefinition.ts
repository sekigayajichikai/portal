/**
 * アンケートの定義（設問・選択肢・複数回答の可否）と、AI 読み取り用のプロンプト・出力スキーマ
 *
 * 要件: _private/アンケート回収_2026-11/要件定義.md（git 管理外）
 * 最初の対象は 2026-10 配布の「西金沢学園地域防災拠点アンケート」（16問、○を付ける方式）。
 * 設問文は Google フォームから起こしたもの。紙の回答用紙には番号と枠しか無いので、
 * 集計表の見出しはここから引く。
 */

export interface SurveyQuestion {
  /** 'q1'〜'q16' */
  key: string;
  /** 用紙に印刷された番号（問1 → 1） */
  no: number;
  /** 設問文（集計表の見出し） */
  text: string;
  /** 'single' | 'multi' | 'free' */
  kind: 'single' | 'multi' | 'free';
  /** 選択肢（番号 → 文言）。自由記述は空 */
  choices: { no: number; label: string }[];
  /** 条件付き設問の補足（集計で分けて見るため） */
  note?: string;
}

export interface SurveyDefinition {
  /** 保存キー。'bosai-kyoten-2026-10' */
  id: string;
  title: string;
  /** 用紙の題名（画像の向きの確認や AI への説明に使う） */
  sheetTitle: string;
  questions: SurveyQuestion[];
}

/** 1票の読み取り結果（AI の返事をそのまま保持する形） */
export interface SurveySheetReading {
  /** q1..q15 は選ばれた番号の配列、q16 は文字列 */
  answers: Record<string, number[] | string>;
  /** 'high' | 'mid' | 'low' */
  confidence: Record<string, 'high' | 'mid' | 'low'>;
  /** 人に見てほしい理由（日本語） */
  flags: string[];
  /** 用紙全体に印が無い */
  blank: boolean;
}

const c = (labels: string[]) => labels.map((label, i) => ({ no: i + 1, label }));

/** 西金沢学園地域防災拠点アンケート（2026-10 配布） */
export const BOSAI_KYOTEN_SURVEY: SurveyDefinition = {
  id: 'bosai-kyoten-2026-10',
  title: '西金沢学園地域防災拠点アンケート（2026年10月）',
  sheetTitle: '西金沢学園地域防災拠点アンケート 回答用紙',
  questions: [
    { key: 'q1', no: 1, kind: 'multi', text: '大地震に備え、ご自宅で準備しているものはありますか？', choices: c(['非常用の水（1人1日3リットル×3日分以上）', '非常食（レトルト、缶詰など3日分以上）', '簡易トイレ・携帯トイレ', 'カセットコンロ・ボンベ', '懐中電灯・モバイルバッテリー', '自治会・町内会および地域防災拠点に期待']) },
    { key: 'q2', no: 2, kind: 'single', text: '家具の転倒防止対策（突っ張り棒やL字金具など）は行っていますか？', choices: c(['すべての部屋で行っている', '寝室など一部の部屋で行っている', '行っていない']) },
    { key: 'q3', no: 3, kind: 'single', text: 'ご自宅の耐震対策はありますか？', choices: c(['昭和56年（1981年）以前に建てられた建物', '昭和57年（1982年）以降に建てられた（補強された）建物', 'わからない']) },
    { key: 'q4', no: 4, kind: 'single', text: '災害時、西金沢学園に3地域を対象とした防災拠点が設置されることを知っていますか？', choices: c(['知っているし、ルートもわかる', '場所は知っているが、ルートは不安', '知らない']) },
    { key: 'q5', no: 5, kind: 'single', text: '災害時の「避難先」はどこを想定していますか？', choices: c(['地域防災拠点', '自宅（在宅避難）', 'その他']) },
    { key: 'q6', no: 6, kind: 'multi', text: '地域防災拠点で期待する機能は？', note: '問5で「地域防災拠点」を選んだ方向け', choices: c(['食料、飲料水', '安眠スペース（間仕切り等）', '明るさ（本を読める程度）', '清潔なトイレ', '情報、WiFi、テレビなど', '人と人の繋がり']) },
    { key: 'q7', no: 7, kind: 'single', text: '一人で地域防災拠点（物資受取場所）へ移動することに不安はありますか？', choices: c(['不安はない（一人で行ける）', 'やや不安（声かけ・手助けが欲しい）', '大いに不安（車いすや介助などの支援が必要）']) },
    { key: 'q8', no: 8, kind: 'single', text: '避難所では避難者全員で運営を手伝う（係を分担する）ことを知っていますか？', choices: c(['知っている', '知らなかった']) },
    { key: 'q9', no: 9, kind: 'multi', text: '避難所の運営で「お手伝いできそうな分野」はありますか？', choices: c(['情報管理', '資機材の設営・扱い', '救護・福祉', '給食・物資配分', '語学・その他', '手伝いは難しい']) },
    { key: 'q10', no: 10, kind: 'single', text: '自宅が無事だった場合、「在宅避難」をしたいと思いますか？', choices: c(['自宅が安全なら備蓄を用意して在宅避難をしたい', '自宅が無事でも不安なので避難所へ行きたい', '自宅が危険エリアにあるため必ず避難する']) },
    { key: 'q11', no: 11, kind: 'single', text: '在宅避難ではご近所との協力・助け合いが大切です。現状は？', choices: c(['普段から交流は十分あり災害時も大丈夫', '交流は不十分で災害時は心配', '自治会の防災プログラムが共助をサポートしてくれている', 'その他']) },
    { key: 'q12', no: 12, kind: 'single', text: '救援物資の受取方法について、ご家庭の状況に最も近いものは？', choices: c(['自力で取りに行ける', '近所で協力すれば取りに行ける', '配達してほしい', '利用する予定はない']) },
    { key: 'q13', no: 13, kind: 'single', text: 'ペットとの避難について、現在の状況に最も近いものは？', choices: c(['同行避難の場所・方法を決め備えている', '同行避難を考えているが備えは不十分', '避難所以外の預け先を想定', 'まだ決めていない・わからない', '可能な限り一緒に在宅避難する', 'ペットは飼っていない']) },
    { key: 'q14', no: 14, kind: 'multi', text: '在宅避難者が自治会・地域防災拠点に期待する事は？', choices: c(['救援物資の配給・配送', '医療のサポート', '情報提供', '片付け・復旧のサポート']) },
    { key: 'q15', no: 15, kind: 'multi', text: '今後、地域で実施してほしい防災活動は？', choices: c(['防災訓練（起震車体験・消火訓練など）', '在宅避難者へのサポート・共助のシステムの準備', '高齢化に対応した防災訓練の見直し', '公式LINEなどを使った安否確認・情報網の充実', '防災マップの配布や備蓄の勉強会', '特になし・参加は難しい']) },
    { key: 'q16', no: 16, kind: 'free', text: '今後の地域防災拠点に望むこと、地域の防災についての気になること・ご意見', choices: [] },
  ],
};

export const SURVEY_DEFINITIONS: SurveyDefinition[] = [BOSAI_KYOTEN_SURVEY];

export function getSurveyDefinition(id: string): SurveyDefinition | undefined {
  return SURVEY_DEFINITIONS.find((d) => d.id === id);
}

/**
 * 読み取りプロンプト（試し読みで 5票77設問すべて一致した prompt_v1 と同じ内容）
 * 設問の構成は定義から組み立てるので、別のアンケートにもそのまま使える。
 */
export function buildSurveyReadPrompt(def: SurveyDefinition): string {
  const choiceLine = def.questions
    .filter((q) => q.kind !== 'free')
    .map((q) => `問${q.no}=1〜${q.choices.length}`)
    .join('、');
  const multi = def.questions.filter((q) => q.kind === 'multi').map((q) => `問${q.no}`).join('、');
  const free = def.questions.filter((q) => q.kind === 'free').map((q) => `問${q.no}`).join('、');
  return `これは自治会アンケートの回答用紙を1枚スキャンした画像です。
番号の入った四角い枠に、回答者が ○、チェック印、塗りつぶし のいずれかで印を付けています。
各設問について、印の付いた番号を読み取り、指定の JSON の型で返してください。

用紙の構成
- 題名「${def.sheetTitle}」が上端にある。
- 右上に「記入例」として ②・☑・■ の3つが印刷されている。これは印刷された見本で、回答ではない。
- 番号入りの枠が横に並ぶ設問と、自由記述の大きな枠の設問（${free || 'なし'}）がある。
- 選択肢の数: ${choiceLine}。
- 複数回答可: ${multi || 'なし'}。

ルール
1. 右上の「記入例」（②・☑・■）は回答に含めない。
2. 枠の中に ○・チェック・塗りつぶし・斜線 のどれかがあれば「印あり」。枠の線や印刷された番号だけなら「印なし」。
3. 複数回答可の設問は、印の付いた番号をすべて返す。
4. それ以外の設問で印が2つ以上あるときは、すべて返したうえで confidence を low にし、flags に書く。
5. ○の上に × が重なっている、塗りつぶして消した跡がある、矢印で別の番号に移している、などは
   「取り消し」の可能性がある。読めた範囲で返し、confidence を low にして flags に書く。
6. 印が薄い、枠からはみ出して隣の枠にかかっている、どの枠か決めにくいときは confidence を mid か low にする。
7. 自由記述は書かれている文字をそのまま書き起こす。空欄なら ""。判読できない字は〓にする。
8. 用紙全体に印が無ければ blank を true にする。
9. 推測で埋めない。見えないものは空配列にする。
10. 大きな○が複数の枠にまたがっているときは、○の中心に最も近い番号を回答とし、confidence を low にして
    flags に「○が複数の枠にまたがる」と書く。
11. 画像が上下逆さまや横向きのときは、そのまま読まずに flags に「向きが違う」とだけ書き、answers は空にする。
12. 印刷がかすれて枠や番号が読めない部分があるときは、その設問を空配列にして flags に書く。

出力は JSON だけ。answers は選択式の設問が整数の配列、自由記述が文字列。
confidence は各設問それぞれ "high" / "mid" / "low"。flags は人に見てほしい理由の配列（日本語）。blank は真偽値。`;
}

/** Gemini の構造化出力スキーマ（定義から組み立てる） */
export function buildSurveyResponseSchema(def: SurveyDefinition) {
  const answersProps: Record<string, unknown> = {};
  const confProps: Record<string, unknown> = {};
  const keys = def.questions.map((q) => q.key);
  for (const q of def.questions) {
    answersProps[q.key] = q.kind === 'free' ? { type: 'STRING' } : { type: 'ARRAY', items: { type: 'INTEGER' } };
    confProps[q.key] = { type: 'STRING', enum: ['high', 'mid', 'low'] };
  }
  return {
    type: 'OBJECT',
    properties: {
      answers: { type: 'OBJECT', properties: answersProps, required: keys },
      confidence: { type: 'OBJECT', properties: confProps, required: keys },
      flags: { type: 'ARRAY', items: { type: 'STRING' } },
      blank: { type: 'BOOLEAN' },
    },
    required: ['answers', 'confidence', 'flags', 'blank'],
  } as const;
}

/** AI の返事を定義に合わせて整える（範囲外の番号を落とす、足りない設問を補う） */
export function normalizeReading(def: SurveyDefinition, raw: unknown): SurveySheetReading {
  const r = (raw ?? {}) as Partial<SurveySheetReading>;
  const answers: Record<string, number[] | string> = {};
  const confidence: Record<string, 'high' | 'mid' | 'low'> = {};
  const extraFlags: string[] = [];
  for (const q of def.questions) {
    const a = (r.answers as Record<string, unknown> | undefined)?.[q.key];
    if (q.kind === 'free') {
      answers[q.key] = typeof a === 'string' ? a.trim() : '';
    } else {
      const nums = Array.isArray(a) ? a.map((n) => Number(n)).filter((n) => Number.isInteger(n)) : [];
      const inRange = nums.filter((n) => n >= 1 && n <= q.choices.length);
      if (inRange.length !== nums.length) extraFlags.push(`問${q.no}: 選択肢に無い番号 ${nums.filter((n) => !inRange.includes(n)).join(',')} を落とした`);
      answers[q.key] = Array.from(new Set(inRange)).sort((x, y) => x - y);
      if (q.kind === 'single' && inRange.length > 1) extraFlags.push(`問${q.no}: 単一回答に ${inRange.length} つの印`);
    }
    const cv = (r.confidence as Record<string, unknown> | undefined)?.[q.key];
    confidence[q.key] = cv === 'low' || cv === 'mid' ? cv : 'high';
  }
  for (const q of def.questions) {
    if (q.kind === 'single' && (answers[q.key] as number[]).length > 1 && confidence[q.key] === 'high') confidence[q.key] = 'low';
  }
  const flags = Array.isArray(r.flags) ? r.flags.map((f) => String(f)).filter(Boolean) : [];
  return { answers, confidence, flags: [...flags, ...extraFlags], blank: !!r.blank };
}

/** 人が見るべき票か（low/mid の設問がある、flags がある、白紙） */
export function needsReview(reading: SurveySheetReading): boolean {
  return reading.blank || reading.flags.length > 0 || Object.values(reading.confidence).some((v) => v !== 'high');
}
