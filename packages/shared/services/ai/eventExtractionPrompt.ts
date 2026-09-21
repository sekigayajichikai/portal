/**
 * カレンダー予定（イベント候補）抽出の共通定義
 *
 * Claude（claudeService）と Gemini（geminiService）の両方から使う、
 * プロンプト生成・出力型・レスポンス解析をここに集約する。
 * プロバイダを増やしてもルールが二重管理にならないようにするためのモジュール。
 *
 * ルールの仕様: docs/カレンダー抽出ルール.md
 * テスト用プロンプト（本番と同内容）: scripts/schedule-test/prompt.md
 *
 * @module services/ai/eventExtractionPrompt
 */

import type { Article } from '../../types/index.js';
import { repairJsonString } from './jsonRepair.js';

/** イベントの性質（配信・表示での扱いを分けるための区分） */
export type EventKind = 'community' | 'support' | 'class';

/**
 * イベント候補
 *
 * 記事群・PDFからAIが抽出した、カレンダー登録候補のイベント情報です。
 * article_index で抽出元の記事（入力配列の添字）を指します（PDF由来は null）。
 */
export interface EventCandidate {
  /** 抽出元記事の添字（入力配列基準。特定できない場合はnull） */
  article_index: number | null;
  /** イベント名（原文どおり・20文字以内） */
  title: string;
  /** 開催日 YYYY-MM-DD */
  event_date: string;
  /** 時間帯（例: "10:00-12:00"。複数日付は "13:30-15:30（10/23も）" のように補記。不明ならnull） */
  event_time: string | null;
  /** 開催場所（不明ならnull） */
  event_location: string | null;
  /** 主催団体・主催者（自治会/子ども会/学校 など。不明ならnull） */
  organizer: string | null;
  /** イベント種別: 'reserve'(要予約) / 'recurring'(連続) / 'open'(当日参加OK) / null(一般) */
  category: 'reserve' | 'recurring' | 'open' | null;
  /** 抽出元に日時・場所以上の詳細情報（持ち物・申込方法・費用・内容説明など）があるか */
  has_details: boolean;
  /** 性質: community(地域交流の催し) / support(福祉・健康支援の案内) / class(定例教室・講座) / null */
  kind: EventKind | null;
  /** 週次LINE配信で取り上げる候補か（AI判定。ダイアログ側の機械判定で上書きされる） */
  weekly_topic: boolean;
  /** weekly_topic の判断理由（15字以内） */
  topic_reason: string | null;
  /** 根拠となる原文の一節（40字以内。名称・日付が書かれた箇所） */
  source_text: string | null;
  /** 申込締切日 YYYY-MM-DD（要予約イベントの属性。不明なら null） */
  apply_deadline: string | null;
  /** 対象者（例: 65歳以上 / 乳幼児と保護者 / 成人。15字以内。不明なら null） */
  target_audience: string | null;
  /** 参加費（例: 無料 / 400円/回 / 3,200円（2回分）。不明なら null） */
  fee: string | null;
  /** 紹介文（住民向け・1〜2文・60字以内。内容説明が無ければ null） */
  description: string | null;
}

/** イベント種別(category)判定と、連続イベントの集約ルール（プロンプト共通） */
export const CATEGORY_RULE = `- 【種別 category】各イベントに種別を付ける。判定は「申込の要否」を最優先する:
  - "open": 「申込不要」「予約不要」「当日直接お越しください」など、申込なしで当日参加できると明記されているもの（お祭り・サロン・お話会など）。定例開催や複数日付でも、申込不要と書いてあれば open にする
  - "reserve": 予約・事前申込が必要なもの（「要予約」「申込先」「事前申込」「定員」「応募締切」等。地区センターの講座など対象が限られるもの）。申込先・締切・定員の記載があるものは open にしない
  - "recurring": 申込の要否が書かれていない継続・定期開催のもの。次のいずれかに当てはまれば recurring にする:
      ・「毎週」「隔週」「毎月」「定期」「全N回」「連続」などの語がある
      ・タイトルに回数を示す「①②③…」「(2)」「第N回」などが付く（例: 「◯◯体操②」）
      ・習い事・教室・講座・サロン・クラブなど、継続して開催される催し
      ・同じ囲み・同じ見出しの中に開催日が複数並ぶもの（例: 9/25(金)・10/23(金)）
  - 上記に当てはまらなければ null
- 【複数日付の集約】category に関わらず、同じ催しの開催日が複数並ぶものは日付ごとに分けず1件にまとめる。event_date は「基準日以降で最も近い開催日」にし、他の日付は event_time の末尾に「（10/23も）」のように補記するか、title に「毎週◯曜」等の繰り返しが分かる表現を入れる`;

/** 性質(kind)の判定ルール（プロンプト共通） */
export const KIND_RULE = `- 【性質 kind】各イベントの性質を付ける。判定は「セクション見出し」を最優先し、次に「対象・内容」で決める:
  - "support": 福祉・健康・生活支援の案内。チラシの見出しが「地域包括支援センター」「居宅介護支援」「保健」「福祉」等の配下にあるものは原則 support。見出しが無い場合は、相談会・介護者や家族向けのつどい・健康測定/体力測定など「支援を受ける人向け」のものだけ support にする
  - "community": 地域交流の催し。お祭り・芸術祭・発表会・講演会・季節行事・「だれでも参加できる」集まり・食事会など
  - "class": 定例の教室・講座・サロン・クラブ活動（毎週/毎月の習い事、連続講座、体操・健康教室、カフェ・サロン）
  - 「地域交流からのご案内」など一般向けのセクションにあるものは、健康や予防がテーマでも support にせず community か class にする（例: 転倒予防の体操教室 → class）
  - どれにも当てはまらなければ null`;

/** 週次配信トピック(weekly_topic)の判定ルール（プロンプト共通） */
export const TOPIC_RULE = `- 【週次配信トピック weekly_topic】自治会の公式LINEで毎週「今週のお知らせ」を配信する。そこで紹介する価値がありそうなイベントに true を付ける（最終判断は人が行うので目安でよい）:
  - true の目安: kind が community で、幅広い住民が興味を持ち参加のハードルが低いもの。年に数回しかない「目玉」感があるもの。「だれでも」「どなたでも」参加できると書かれているもの
  - false の目安: kind が class（定例教室・サロン）や support（対象が限られる支援）。専門的で一般向けでないもの
  - topic_reason に判断理由を15字以内で書く（例: 「年1回の芸術祭」「定例サロン」）`;

/** 抽出対象外（啓発期間・内部行事など）の共通ルール */
export const EXCLUSION_RULE = `- 【催しでないものは除外】次は「参加する催し」ではないので抽出しない: 啓発期間・キャンペーン期間・「○○の日」「○○週間」「強化月間」・休館日・受付時間・営業時間・工事期間
- 【内部行事の除外】一般の地域住民が参加できないものは抽出しない:
  - チラシが「〜からのご案内」等のセクションに分かれている場合、セクション見出しを判断材料にする。「通所介護（デイサービス）」「保育園」「学校」など施設の利用者・在籍者向けセクションにある月間予定（お誕生日会、体操教室、作品作り等）は除外
  - 対象が「ご家族の介護をしている方」「子育て中の方」「65歳以上」など属性で絞られていても、一般に開かれた案内（申込先がある、「お気軽にご参加ください」等）があれば抽出する。除外するのは「その施設の利用者しか参加できないもの」だけ
- 【名称は原文のまま】title はチラシ・記事に書かれているイベント名をそのまま使う（20字を超える場合のみ末尾を省く）。別の記事の語を混ぜたり、内容から名前を作ったりしない。名前が無い場合のみ内容を要約した名前にする`;

/** 申込締切の属性ルール（プロンプト共通） */
export const DEADLINE_ATTR_RULE = `- 【申込締切 apply_deadline】要予約（category が reserve）のイベントは、申込締切日が書かれていれば apply_deadline に YYYY-MM-DD で入れる（「締切 10/16」「10/30(金)まで」「申込は◯日まで」等）。これはイベントの属性であり、締切そのものを別のイベントとして出力してはいけない。書かれていなければ null`;

/** 対象者・参加費の属性ルール（プロンプト共通） */
export const AUDIENCE_FEE_RULE = `- 【対象者 target_audience】「対象 成人」「65歳以上」「乳幼児＆幼児」「小学生から成人」など、参加できる人の条件を原文どおり15字以内で入れる。定員（「20人」「先着50名」）は対象者に含めない。書かれていなければ null
- 【参加費 fee】「参加費」「費用」「材料費」「無料」の記載を10字以内で入れる。「1回400円」は「400円/回」、複数回分は「3,200円（2回分）」のように。無料と明記されていれば「無料」。書かれていなければ null`;

/** 紹介文の属性ルール（プロンプト共通） */
export const DESCRIPTION_RULE = `- 【紹介文 description】住民向けに「何をする催しか・どんな人におすすめか」が分かる紹介文を1〜2文・60字以内で書く（例: 「地元の作品展示と演奏会。お茶を飲みながら気軽に楽しめます。」）。原文の内容説明・見どころ・持ち物などを要約し、日時・場所・対象・費用は繰り返さない（別の項目に入るため）。原文に内容説明が無く日時・場所しか書かれていなければ null`;

/** 出力JSONの形式説明（プロンプト共通） */
const OUTPUT_FORMAT = `【出力形式】以下のJSONのみを出力してください:
\`\`\`json
{
  "events": [
    {
      "article_index": null,
      "title": "イベント名（原文どおり・20文字以内）",
      "event_date": "YYYY-MM-DD",
      "event_time": "10:00-12:00（終了時刻が不明なら \\"10:00\\" のように開始のみ。複数日付は \\"13:30-15:30（10/23も）\\"。時刻自体が不明なら null）",
      "event_location": "開催場所 または null",
      "organizer": "主催団体 または null",
      "category": "reserve | recurring | open | null",
      "has_details": true,
      "kind": "community | support | class | null",
      "weekly_topic": false,
      "topic_reason": "判断理由（15字以内）",
      "source_text": "名称と日付が書かれた原文の一節（40字以内・そのまま書き写す）",
      "apply_deadline": "申込締切 YYYY-MM-DD または null（要予約のみ）",
      "target_audience": "対象者（15字以内） または null",
      "fee": "参加費（10字以内。無料なら \"無料\"） または null",
      "description": "紹介文（1〜2文・60字以内。内容説明が無ければ null）"
    }
  ]
}
\`\`\`
該当がなければ {"events": []} を出力してください。`;

/**
 * 登録済み主催団体をプロンプトに与えるヒント文を作る（表記揺れ低減用）
 */
export function buildOrganizerHint(organizerNames: string[]): string {
  if (!organizerNames || organizerNames.length === 0) return '';
  return (
    '- 【登録済みの主催団体】次のいずれかに該当する場合は、表記を揃えるため必ずこの名称をそのまま organizer に使う（表記揺れ防止）:\n' +
    organizerNames.map((n) => `  ・${n}`).join('\n') +
    '\n  該当が無ければ実際の主催団体名をそのまま入れる。'
  );
}

function buildCutoffRule(cutoffDate: string): string {
  return cutoffDate
    ? `- 【過去除外】実際の開催日をそのまま使うこと。その開催日が ${cutoffDate}（本日）より前になる予定は、出力に含めない（除外する）。日付を本日や別の日に書き換えて残してはいけない。${cutoffDate} 当日は含めてよい`
    : '';
}

export interface PdfEventPromptParams {
  /** 基準日（回覧板の発行日など） YYYY-MM-DD。年の補完に使う */
  referenceDate: string;
  /** 本日 YYYY-MM-DD。これより前の予定は除外（空なら除外しない） */
  cutoffDate?: string;
  /** 自治会関連のPDFか（true なら締切系も抽出可） */
  isJichikai?: boolean;
  /** 登録済み主催団体名（表記揺れ防止） */
  organizerNames?: string[];
}

/**
 * PDF本体からイベント候補を抽出するプロンプト（Claude / Gemini 共通）
 */
export function buildPdfEventPrompt({
  referenceDate,
  cutoffDate = '',
  isJichikai = true,
  organizerNames = [],
}: PdfEventPromptParams): string {
  const deadlineRule = isJichikai
    ? '- 申込締切など、参加者が忘れると困る日付も「〆切」を含むタイトルで抽出してよい'
    : '- このPDFは自治会以外の発行元です。募集・申込・〆切/締切などの締切だけを独立したイベントとして抽出しない（実際に開催されるイベントの開催日のみ抽出する）。ただし要予約イベントの申込締切は、そのイベントの apply_deadline 属性として入れてよい';

  return `
あなたは自治会の回覧板からカレンダー予定を整理する担当者です。
添付のPDFから、地域カレンダーに登録すべき「日付が確定しているイベント・予定${isJichikai ? '・締切' : ''}」を全て抽出してください。

【基準日】このPDFが配布された時期は ${referenceDate} 前後です。年が書かれていない日付は、基準日に「もっとも日付が近くなる年」で解釈してください（基準日より前の日付になっても構いません。無理に翌年へ繰り上げないこと）。
【発行元】${isJichikai ? '自治会関連（自治会のお知らせ）' : '自治会以外（地域のお知らせ）'}

【抽出ルール】
- 開催日が特定できるものだけを抽出する（「毎週」「随時」「未定」は除外。ただし連続イベントは種別ルール参照）
- 異なるイベントが複数ある場合は、それぞれ別のイベントとして抽出する
- 行事予定表のように日付が羅列されている場合も1件ずつ抽出する（ただし同じ催しの複数日付は種別ルールに従い1件にまとめる）
${deadlineRule}
- 過去の報告（開催済みイベントの報告）は除外する
${buildCutoffRule(cutoffDate)}
${EXCLUSION_RULE}
- organizer には主催団体・主催者（例: 自治会、子ども会、○○小学校、防犯協会、地域包括支援センター など）を入れる。セクション見出しにある発行部署も主催として使ってよい。読み取れない場合は null にする
${CATEGORY_RULE}
${KIND_RULE}
${TOPIC_RULE}
${DEADLINE_ATTR_RULE}
${AUDIENCE_FEE_RULE}
${DESCRIPTION_RULE}
${buildOrganizerHint(organizerNames)}
【has_details の判定】日時・場所以外の実質的な詳細情報（持ち物・申込方法・費用・対象者・内容説明など）がPDFに書かれていれば true、日付・場所の羅列だけなら false とする。
【source_text】各イベントに、そのイベント名と開催日が書かれている原文の一節を40字以内でそのまま書き写す（要約・言い換え禁止）。原文に見つからないイベントは出力しない。

${OUTPUT_FORMAT}
`;
}

export type EventPromptArticle = Pick<
  Article,
  'title' | 'content' | 'event_date' | 'event_time' | 'event_location' | 'article_type'
>;

export interface ArticleEventPromptParams {
  articles: EventPromptArticle[];
  referenceDate: string;
  cutoffDate?: string;
  organizerNames?: string[];
}

/**
 * 記事テキスト群からイベント候補を抽出するプロンプト（Claude / Gemini 共通）
 */
export function buildArticleEventPrompt({
  articles,
  referenceDate,
  cutoffDate = '',
  organizerNames = [],
}: ArticleEventPromptParams): string {
  // 記事本文は長すぎる場合に切り詰める（日時情報は冒頭に書かれることが多い）
  // 併せて「自治会のお知らせ(official)」か「地域のお知らせ」かを明示する（募集・締切ルール用）
  const articleList = articles
    .map((a, i) => {
      const kindLabel = a.article_type === 'official' ? '自治会のお知らせ' : '地域のお知らせ';
      const meta = [
        a.event_date ? `開催日: ${a.event_date}` : null,
        a.event_time ? `時間: ${a.event_time}` : null,
        a.event_location ? `場所: ${a.event_location}` : null,
      ]
        .filter(Boolean)
        .join(' / ');
      const content = (a.content || '').slice(0, 2000);
      return `### 記事${i}【${kindLabel}】: ${a.title}\n${meta ? meta + '\n' : ''}${content}`;
    })
    .join('\n\n');

  return `
あなたは自治会の回覧板からカレンダー予定を整理する担当者です。
以下の記事一覧から、地域カレンダーに登録すべき「日付が確定しているイベント・予定・締切」を全て抽出してください。

【基準日】この回覧板の発行日は ${referenceDate} です。年が書かれていない日付は、基準日に「もっとも日付が近くなる年」で解釈してください（基準日より前の日付になっても構いません。無理に翌年へ繰り上げないこと）。

【抽出ルール】
- 開催日が特定できるものだけを抽出する（「毎週」「随時」「未定」は除外。ただし連続イベントは種別ルール参照）
- 1つの記事に異なる複数のイベントがある場合は、それぞれ別のイベントとして抽出する
- 同じイベントが複数記事に載っている場合は1件にまとめ、最も詳しい記事の番号を article_index にする
- 過去の報告記事（開催済みイベントの報告）は除外する
${buildCutoffRule(cutoffDate)}
- 【募集・締切ルール】「募集」「申込」「〆切/締切」などの締切系の日付は、記事見出しが【自治会のお知らせ】の記事からのみ抽出してよい（「〆切」を含むタイトルで可）。【地域のお知らせ】の記事からは、募集・申込・締切の日付は抽出しない（実際に開催されるイベントの開催日のみ抽出する）
${EXCLUSION_RULE}
- organizer には主催団体・主催者（例: 自治会、子ども会、○○小学校、防犯協会 など）を入れる。記事から読み取れない場合は null にする
${CATEGORY_RULE}
${KIND_RULE}
${TOPIC_RULE}
${DEADLINE_ATTR_RULE}
${AUDIENCE_FEE_RULE}
${DESCRIPTION_RULE}
${buildOrganizerHint(organizerNames)}
【has_details の判定】抽出元記事に「日時・場所以外の実質的な詳細情報」（持ち物、申込方法、費用、対象者、内容の説明など）が書かれていれば true、行事予定表のように日付・場所の羅列だけなら false とする。読者が記事を開いたとき、カードに書いてある以上の情報が得られるかどうかで判断すること。
【source_text】各イベントに、そのイベント名と開催日が書かれている記事中の一節を40字以内でそのまま書き写す。

${OUTPUT_FORMAT.replace('"article_index": null', '"article_index": 0')}

【記事一覧】
${articleList}
`;
}

/**
 * イベント候補レスポンス（JSONテキスト）の解析・正規化
 *
 * Claude / Gemini どちらのレスポンスにも使う。
 * 想定外の値は安全側（null / false）に倒し、必須項目（title・event_date）が無いものは捨てる。
 *
 * @param responseText - AIのレスポンステキスト（JSONまたはコードブロック入り）
 * @param articleCount - 入力記事数（article_index の範囲チェック用。PDF由来は 0）
 */
export function parseEventCandidatesFromResponse(
  responseText: string,
  articleCount: number
): EventCandidate[] {
  const jsonMatch =
    responseText.match(/```json\s*([\s\S]*?)\s*```/) || responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('JSONレスポンスが見つかりません');
  }
  const jsonText = jsonMatch[1] || jsonMatch[0];

  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    parsed = JSON.parse(repairJsonString(jsonText).replace(/,\s*([}\]])/g, '$1'));
  }

  if (!Array.isArray(parsed?.events)) {
    throw new Error('イベント配列が見つかりません');
  }

  const str = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() ? v.trim() : null;

  return parsed.events
    .filter((e: any) => typeof e?.title === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e?.event_date))
    .map((e: any): EventCandidate => {
      const deadline = /^\d{4}-\d{2}-\d{2}$/.test(e.apply_deadline) ? (e.apply_deadline as string) : null;
      const rawCategory = ((['reserve', 'recurring', 'open'] as const).includes(e.category) ? e.category : null) as EventCandidate['category'];
      return {
      article_index:
        typeof e.article_index === 'number' && e.article_index >= 0 && e.article_index < articleCount
          ? e.article_index
          : null,
      title: String(e.title).trim().slice(0, 30),
      event_date: e.event_date,
      // "12:10-null" のような崩れた表記は末尾の "-null" を落とす
      event_time: str(e.event_time)?.replace(/\s*[-～〜]\s*null$/i, '') ?? null,
      event_location: str(e.event_location),
      organizer: str(e.organizer),
      // 締切があるのに「当日OK」や種別なしは矛盾なので、要予約に補正する（AIの揺れ対策。recurring はそのまま）
      category: deadline && (rawCategory === null || rawCategory === 'open') ? 'reserve' : rawCategory,
      // 判定が返ってこない場合はtrue（リンクあり）に倒し、人の確認に委ねる
      has_details: e.has_details !== false,
      kind: (['community', 'support', 'class'] as const).includes(e.kind) ? e.kind : null,
      weekly_topic: e.weekly_topic === true,
      topic_reason: str(e.topic_reason)?.slice(0, 30) ?? null,
      source_text: str(e.source_text)?.slice(0, 80) ?? null,
      apply_deadline: deadline,
      target_audience: str(e.target_audience)?.slice(0, 30) ?? null,
      fee: str(e.fee)?.slice(0, 20) ?? null,
      description: str(e.description)?.replace(/\s*\n\s*/g, ' ').slice(0, 120) ?? null,
      };
    });
}
