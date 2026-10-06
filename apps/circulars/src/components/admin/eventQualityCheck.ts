/**
 * 予定の「載せる前に目を通したほうがよいもの」を見つける
 *
 * PDF（特にスキャン画像）からの抽出は、題名に紙面の見出しがそのまま入ったり、
 * 催しではないお知らせを拾ったりすることがある（2026-09-29 の10月号で「乳児&幼児対象」
 * 「駐在所管内警察相談所よりお知らせ」「本茶会(茶くやき)」など）。
 *
 * ここでは**機械的に分かるものだけ**を拾う。文脈を見ないと分からないものは
 * `checkEventsWithGemini`（AIの点検）に任せる。
 *
 * どちらも「消す候補」ではなく **「目を通す候補」** として扱う。
 * 役員会・監査のように題名が短く場所も無い正しい予定を誤って指摘しうるため、
 * 画面では印を出すだけで、消すかどうかは人が決める。
 */

export interface EventIssue {
  /** 機械判定か、AIの指摘か */
  from: 'rule' | 'ai';
  /** 何が気になるか（そのまま画面に出す） */
  reason: string;
  /** high=載せる前に直したい / low=念のため */
  severity: 'high' | 'low';
}

/** 点検に使う予定の形（予定カードでも抽出候補でも渡せるように最小限） */
export interface CheckableEvent {
  title: string;
  event_date: string | null;
  event_time?: string | null;
  event_location?: string | null;
  organizer?: string | null;
}

/** 題名の末尾が説明文のようになっているもの（催しの名前ではない） */
const EXPLANATORY_TAIL = /(対象|について|お知らせ|のご案内|ご案内|案内|より|まで|の件)$/;
/** 閉じていない括弧・記号だけ、など読み取りの崩れ */
const BROKEN_MARKS = /[（(【「][^）)】」]*$|^[^（(【「]*[）)】」]|[｜|＝=※＊*]{2,}/;

/** 何日先までを「ありえる予定」とみなすか（これより先は読み違いを疑う） */
const FAR_FUTURE_DAYS = 400;

/**
 * 機械的に分かる範囲で点検する
 *
 * @param today 今日の日付 YYYY-MM-DD（日付が遠すぎないかの判定に使う）
 */
export function checkEventByRule(ev: CheckableEvent, today: string): EventIssue[] {
  const issues: EventIssue[] = [];
  const title = (ev.title ?? '').trim();

  if (title.length < 3) {
    issues.push({ from: 'rule', reason: 'タイトルが短すぎます', severity: 'high' });
  }
  if (title.length >= 3 && EXPLANATORY_TAIL.test(title)) {
    issues.push({ from: 'rule', reason: 'タイトルが予定の名前ではなく、説明文のように見えます', severity: 'low' });
  }
  if (BROKEN_MARKS.test(title)) {
    issues.push({ from: 'rule', reason: 'タイトルに読み取りの崩れ（括弧や記号）がありそうです', severity: 'low' });
  }
  if (!ev.event_location?.trim() && !ev.organizer?.trim()) {
    issues.push({ from: 'rule', reason: '場所も主催も分かりません', severity: 'low' });
  }
  if (ev.event_date && today) {
    const days = Math.round((new Date(ev.event_date + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000);
    if (days > FAR_FUTURE_DAYS) {
      issues.push({ from: 'rule', reason: `日付が ${Math.round(days / 30)} か月先です。読み違いかもしれません`, severity: 'low' });
    }
  }
  return issues;
}

/** 印の色と文言（画面共通） */
export function issueBadge(issues: EventIssue[]): { label: string; cls: string; title: string } | null {
  if (issues.length === 0) return null;
  const high = issues.some((i) => i.severity === 'high');
  return {
    label: high ? '⚠ 要確認' : '⚠ 念のため',
    cls: high ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800',
    title: issues.map((i) => `${i.from === 'ai' ? 'AI: ' : ''}${i.reason}`).join('\n'),
  };
}
