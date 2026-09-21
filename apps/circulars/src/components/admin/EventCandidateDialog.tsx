/**
 * イベント候補確認ダイアログコンポーネント
 *
 * 回覧板の記事群からAIが抽出したイベント候補を一覧表示し、
 * 人が確認・修正した上でイベントカードとして登録するダイアログです。
 * book-system（自治会カレンダー）連携用のJSONコピー機能も備えます。
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  extractEventCandidates,
  extractEventCandidatesFromPDF,
  getEventExtractionProvider,
  getEventExtractionProviderLabel,
  convertPdfUrlToBase64,
  addEventCard,
  updateEventCard,
  getOrganizers,
  addOrganizer,
  type EventCandidate,
  type EventKind,
  type EventCard,
} from '@cc-saas/shared';
import { Newsletter, Article } from '@cc-saas/shared/types';
import { Loader2, AlertCircle, X, Sparkles, Copy, Check, Plus } from 'lucide-react';
import { ProcessingIndicator, showToast } from '@/components/ui/feedback';

/**
 * 編集可能なイベント候補（選択状態付き）
 */
interface EditableCandidate extends EventCandidate {
  selected: boolean;
  /** 記事へのリンクを付けるか（読者側の「詳しく読む」の有無。AIのhas_details判定が初期値） */
  linkArticle: boolean;
  /** 抽出元（記事テキスト or 添付PDF） */
  source: 'article' | 'pdf';
  /** 由来PDFのURL（source==='pdf'のときのみ。出典リンク用） */
  sourcePdfUrl: string | null;
  /** weekly_topic の機械判定の根拠（単独チラシ / 複数掲載）。AIの topic_reason とは別に表示する */
  topicHints: string[];
  /**
   * 同じイベント（日付＋正規化タイトル）が既に登録済みなら、その既存カードのID。
   * 登録時は新規追加せず、既存カードの空欄（締切・種別・⭐など）だけを補完する（元のデータは壊さない）
   */
  existingId: string | null;
}

/** 性質(kind)の表示メタ */
const KIND_META: Record<EventKind, { label: string; icon: string; title: string }> = {
  community: { label: '交流', icon: '🎉', title: '地域交流の催し（祭り・芸術祭・講演会・だれでも参加の集まり）' },
  support: { label: '支援', icon: '🤝', title: '福祉・健康・生活支援の案内（健康測定・相談会・介護者向け）' },
  class: { label: '教室', icon: '📚', title: '定例の教室・講座・サロン' },
};
const KIND_KEYS: EventKind[] = ['community', 'support', 'class'];

/**
 * 重複掲載の判定に使うタイトルの正規化（空白・括弧・記号を除き、先頭8文字で同一視）
 */
function topicKey(date: string, title: string): string {
  const t = title
    .replace(/[\s　]/g, '')
    .replace(/[「」『』（）()【】\[\]〈〉《》・･、。,.!！?？:：;；~〜～\-‐–—]/g, '')
    .toLowerCase()
    .slice(0, 8);
  return `${date}__${t}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** YYYY-MM-DD に日数を足す（締切が未記載のときの仮締切「開催7日前」表示用） */
function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(ymd + 'T00:00:00');
  if (isNaN(d.getTime())) return ymd;
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** YYYY-MM-DD → "9/10(木)" */
function formatMd(ymd: string): string {
  const d = new Date(ymd + 'T00:00:00');
  if (isNaN(d.getTime())) return ymd;
  return `${d.getMonth() + 1}/${d.getDate()}(${['日', '月', '火', '水', '木', '金', '土'][d.getDay()]})`;
}

/**
 * 429（無料枠のレート制限）/ 503（高負荷）で失敗した場合に待って再試行する（最大3回）。
 * エラー文に "retry in 37s" 等があればその秒数に従い、無ければ 15秒・30秒・45秒と延ばす。
 */
async function withRateLimitRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message ?? e);
      const retryable = /429|503|RESOURCE_EXHAUSTED|UNAVAILABLE|high demand|rate limit|quota/i.test(msg);
      if (!retryable || attempt === maxRetries) throw e;
      const m = msg.match(/retry in ([\d.]+)s/i) ?? msg.match(/"retryDelay":"(\d+)s"/);
      const wait = m ? Math.ceil(Number(m[1]) * 1000) + 1000 : 15000 * (attempt + 1);
      await sleep(wait);
    }
  }
  throw lastErr;
}

/** Gemini 無料枠（1分5リクエスト/モデル）に合わせた、順次処理時の最小リクエスト間隔 */
const GEMINI_MIN_GAP_MS = 13000;

/**
 * EventCandidateDialogコンポーネントのProps
 */
interface EventCandidateDialogProps {
  /** 対象の電子回覧板 */
  newsletter: Newsletter;
  /** 抽出対象の記事一覧 */
  articles: Article[];
  /** 既存のイベントカード（重複表示用） */
  existingCards: EventCard[];
  /** 登録完了時のコールバック（イベントカード再取得用） */
  onRegistered: () => void;
  /** 閉じる時のコールバック */
  onClose: () => void;
}

/**
 * event_time（例: "10:00-12:00", "13時～"）を開始・終了時刻に分解する
 */
function splitEventTime(time: string | null): { start: string | null; end: string | null } {
  if (!time) return { start: null, end: null };
  const match = time.match(/^(\d{1,2}:\d{2})\s*[-～〜]\s*(\d{1,2}:\d{2})$/);
  if (match) return { start: match[1], end: match[2] };
  const single = time.match(/^(\d{1,2}:\d{2})/);
  if (single) return { start: single[1], end: null };
  return { start: null, end: null };
}

/** イベント種別の表示メタ（アイコン・ラベル） */
const CATEGORY_META: Record<'reserve' | 'recurring' | 'open', { label: string; icon: string }> = {
  reserve: { label: '要予約', icon: '📝' },
  recurring: { label: '連続', icon: '🔁' },
  open: { label: '当日OK', icon: '🎪' },
};
const CATEGORY_KEYS = ['reserve', 'recurring', 'open'] as const;

/**
 * 同時実行数を制限してタスクを処理する。
 * PDFを大量に一度に送るとレート制限/タイムアウトで一部が失敗するため、少数ずつ順に処理する。
 */
async function runWithConcurrency<T>(
  thunks: Array<() => Promise<T>>,
  limit: number,
  onSettled?: (done: number, total: number) => void
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(thunks.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < thunks.length) {
      const idx = next++;
      try {
        results[idx] = { status: 'fulfilled', value: await thunks[idx]() };
      } catch (reason) {
        results[idx] = { status: 'rejected', reason };
      }
      done++;
      onSettled?.(done, thunks.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, thunks.length) }, () => worker()));
  return results;
}

/**
 * 主催団体セレクト（Notion風）
 *
 * 現在値をチップ表示し、クリックで検索付きのポップオーバーを開く。
 * 登録済み主催団体から絞り込んで選択でき、未登録の名前はその場で新規登録して選択できる。
 * ドロップダウンが長くならないよう、検索で候補を絞る方式。
 */
const OrganizerSelect: React.FC<{
  value: string | null;
  options: string[];
  onChange: (v: string | null) => void;
  onCreate: (name: string) => Promise<void>;
}> = ({ value, options, onChange, onCreate }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // 外側クリック・Escで閉じる
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
  const exactExists = options.some((o) => o.toLowerCase() === q);

  const choose = (v: string | null) => {
    onChange(v);
    setOpen(false);
    setQuery('');
  };

  const create = async () => {
    const name = query.trim();
    if (!name) return;
    await onCreate(name);
    choose(name);
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* 既定は抽出結果のタグ表示のみ。クリックしたときだけNotion風ピッカーを開く */}
      {value ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          title="クリックで主催団体を変更"
          className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 rounded px-2 py-0.5 text-xs font-medium hover:bg-slate-200 transition max-w-full"
        >
          <span className="truncate">{value}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 border border-dashed border-slate-300 hover:border-slate-400 rounded px-2 py-0.5 transition"
        >
          <Plus size={12} className="shrink-0" />
          主催団体
        </button>
      )}

      {open && (
        <div className="absolute z-[60] mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <input
              type="text"
              value={query}
              autoFocus
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (!exactExists && q) create(); else if (filtered[0]) choose(filtered[0]); } }}
              placeholder="検索または新規追加…"
              className="w-full text-sm border border-slate-200 rounded px-2 py-1 focus:ring-2 focus:ring-primary-400 focus:border-transparent"
            />
          </div>
          <div className="max-h-44 overflow-y-auto py-1">
            {value && (
              <button
                type="button"
                onClick={() => choose(null)}
                className="w-full text-left px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-50"
              >
                × 選択を解除
              </button>
            )}
            {filtered.map((o) => (
              <button
                type="button"
                key={o}
                onClick={() => choose(o)}
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 flex items-center justify-between ${o === value ? 'text-slate-900 font-medium' : 'text-slate-700'}`}
              >
                <span className="truncate">{o}</span>
                {o === value && <Check size={14} className="text-slate-500 shrink-0" />}
              </button>
            ))}
            {q && !exactExists && (
              <button
                type="button"
                onClick={create}
                className="w-full text-left px-3 py-1.5 text-sm text-primary-600 hover:bg-primary-50 flex items-center gap-1.5"
              >
                <Plus size={14} className="shrink-0" />
                「{query.trim()}」を新規登録して選択
              </button>
            )}
            {filtered.length === 0 && !q && (
              <p className="px-3 py-2 text-xs text-slate-400">主催団体が未登録です。上の欄で追加できます。</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * EventCandidateDialogコンポーネント
 *
 * マウント時にAI抽出を実行し、候補の確認・修正・登録を行います。
 */
export const EventCandidateDialog: React.FC<EventCandidateDialogProps> = ({
  newsletter,
  articles,
  existingCards,
  onRegistered,
  onClose,
}) => {
  const [candidates, setCandidates] = useState<EditableCandidate[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  /** 抽出を開始したか（false のうちは「どのPDFから抽出するか」の選択画面を表示） */
  const [started, setStarted] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /** 抽出対象の内訳（記事件数・PDF件数・PDF読み取り失敗数） */
  const [sourceInfo, setSourceInfo] = useState<{ articles: number; pdfs: number; pdfFailed: number } | null>(null);
  /** 抽出の進捗（順次処理のため件数で見せる） */
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  /** 使用する抽出プロバイダ（Gemini / Claude）。表示と並列数の決定に使う */
  const provider = getEventExtractionProvider();
  /** 登録済み主催団体の名前一覧（選択候補・AIヒント用） */
  const [orgOptions, setOrgOptions] = useState<string[]>([]);
  /** 抽出元PDF一覧（選択用）。label=媒体名, publisher=発行元 */
  const [pdfSources, setPdfSources] = useState<
    { url: string; label: string; publisher: string; isJichikai: boolean }[]
  >([]);
  /** 抽出対象に選択したPDFのURL集合（既定は全選択） */
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  /** 記事テキストも抽出対象に含めるか */
  const [includeArticles, setIncludeArticles] = useState(articles.length > 0);

  /** 主催団体をマスターに新規登録して選択候補に反映（テーブル未作成でも選択は通す） */
  const handleCreateOrganizer = async (name: string): Promise<void> => {
    try {
      await addOrganizer(name);
    } catch {
      // 既に存在／マスター未作成でも、ローカルの候補には加えて選択できるようにする
    }
    setOrgOptions((prev) => (prev.includes(name) ? prev : [...prev, name]));
  };

  /**
   * マウント時: 主催団体と抽出元PDF一覧を準備する（抽出はまだ実行しない）
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let orgNames: string[] = [];
      try {
        orgNames = (await getOrganizers()).map((o) => o.name);
      } catch {
        orgNames = [];
      }
      if (cancelled) return;
      setOrgOptions(orgNames);

      // source_pdf_urls は { url, label, publisher, type, thumbnail } のオブジェクト配列（旧データは文字列）。
      const rawEntries: any[] =
        newsletter.source_pdf_urls && newsletter.source_pdf_urls.length > 0
          ? newsletter.source_pdf_urls
          : newsletter.source_pdf_url
            ? [newsletter.source_pdf_url]
            : [];
      // type==='source'（自治会のお知らせ）なら自治会関連。type未設定の旧データは自治会扱い(true)。
      const sources = rawEntries
        .map((e: any, i: number) => {
          if (typeof e === 'string') return { url: e, label: `PDF ${i + 1}`, publisher: '', isJichikai: true };
          // 自治会のお知らせ(type='source')は記事化済みなので一覧から除外（記事テキストでカバー）
          if (e?.url && e.type !== 'source')
            return {
              url: e.url as string,
              label: (e.label || e.publisher || `PDF ${i + 1}`) as string,
              publisher: (e.publisher || '') as string,
              isJichikai: e.type ? e.type === 'source' : true,
            };
          return null;
        })
        .filter(
          (x): x is { url: string; label: string; publisher: string; isJichikai: boolean } =>
            !!x && x.url.length > 0
        );
      if (cancelled) return;
      setPdfSources(sources);
      setSelectedUrls(new Set(sources.map((s) => s.url))); // 既定は全選択
    })();
    return () => { cancelled = true; };
  }, [newsletter.source_pdf_url, newsletter.source_pdf_urls]);

  /**
   * 選択したソース（記事＋選択PDF）からAI抽出を実行
   */
  const startExtraction = async () => {
    setStarted(true);
    setIsExtracting(true);
    setError(null);

    const orgNames = orgOptions;
    // 「今日」(ローカル日付 YYYY-MM-DD)。これより前の予定は過去として除外する
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const chosen = pdfSources.filter((s) => selectedUrls.has(s.url));
    const useArticles = includeArticles && articles.length > 0;

    // PDF大量時のレート制限/失敗を防ぐため、同時実行数を絞って順に処理（記事タスクは先頭固定）。
    type ExtractTask = { source: 'article' | 'pdf'; items: EventCandidate[]; pdfUrl: string | null };
    const taskThunks: Array<() => Promise<ExtractTask>> = [];
    if (useArticles) {
      taskThunks.push(() =>
        withRateLimitRetry(() => extractEventCandidates(articles, newsletter.issue_date, orgNames, todayStr)).then(
          (items) => ({
            source: 'article' as const,
            items,
            pdfUrl: null,
          })
        )
      );
    }
    for (const p of chosen) {
      taskThunks.push(() =>
        convertPdfUrlToBase64(p.url)
          .then((b64) =>
            withRateLimitRetry(() =>
              extractEventCandidatesFromPDF(b64, newsletter.issue_date, orgNames, p.isJichikai, todayStr)
            )
          )
          .then((items) => ({ source: 'pdf' as const, items, pdfUrl: p.url }))
      );
    }

    if (taskThunks.length === 0) {
      setCandidates([]);
      setSourceInfo({ articles: 0, pdfs: 0, pdfFailed: 0 });
      setIsExtracting(false);
      return;
    }

    // Gemini（無料枠のRPM制限）は1件ずつ順次＋間隔を空ける、Claude は3件まで同時
    let lastStart = 0;
    const pacedThunks =
      provider === 'gemini'
        ? taskThunks.map((t) => async () => {
            const gap = GEMINI_MIN_GAP_MS - (Date.now() - lastStart);
            if (lastStart && gap > 0) await sleep(gap);
            lastStart = Date.now();
            return t();
          })
        : taskThunks;
    setProgress({ done: 0, total: pacedThunks.length });
    const settled = await runWithConcurrency(pacedThunks, provider === 'gemini' ? 1 : 3, (done, total) =>
      setProgress({ done, total })
    );

    // PDFタスクの成否内訳（記事タスクは先頭。残りがPDF）
    const pdfResults = useArticles ? settled.slice(1) : settled;
    const pdfFailed = pdfResults.filter((r) => r.status === 'rejected').length;
    setSourceInfo({ articles: useArticles ? articles.length : 0, pdfs: chosen.length, pdfFailed });

    // 記事由来を先に並べる（重複時は記事側=リンク可能なほうを優先して残す）
    const ordered = settled
      .filter((r): r is PromiseFulfilledResult<ExtractTask> => r.status === 'fulfilled')
      .sort((a, b) => (a.value.source === 'article' ? -1 : 1));

    // 週次配信トピックの機械判定（AI判定より優先）
    //  1) 複数掲載: 同じイベント（日付＋正規化タイトル）が記事とPDFの両方、または2本以上のPDFに載っている
    //  2) 単独チラシ: 1本のPDFから抽出されたイベントが1件だけ（＝そのイベントのためのチラシ）
    const sourcesByKey = new Map<string, Set<string>>();
    for (const r of ordered) {
      for (const c of r.value.items) {
        if (c.event_date < todayStr) continue;
        const key = topicKey(c.event_date, c.title);
        const set = sourcesByKey.get(key) ?? new Set<string>();
        set.add(r.value.source === 'article' ? 'article' : `pdf:${r.value.pdfUrl}`);
        sourcesByKey.set(key, set);
      }
    }

    const seen = new Set<string>();
    const merged: EditableCandidate[] = [];
    for (const r of ordered) {
      const futureItems = r.value.items.filter((c) => c.event_date >= todayStr);
      const isSingleFlyer = r.value.source === 'pdf' && futureItems.length === 1;
      for (const c of futureItems) {
        // 過去除外の保険は上で済み（今日より前の予定は候補に載せない）
        const key = `${c.event_date}__${c.title.trim()}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const hints: string[] = [];
        if ((sourcesByKey.get(topicKey(c.event_date, c.title))?.size ?? 0) >= 2) hints.push('複数掲載');
        if (isSingleFlyer) hints.push('単独チラシ');
        // 機械判定に当たれば true。当たらない場合、支援系(support)はAIの甘い true を抑えて false に倒す
        const weeklyTopic = hints.length > 0 ? true : c.kind === 'support' ? false : c.weekly_topic;

        // 既に登録済みのカードがあれば「補完対象」にする（同じ日付＋正規化タイトル）
        const existing = existingCards.find(
          (card) => card.event_date === c.event_date && topicKey(card.event_date, card.title) === topicKey(c.event_date, c.title)
        );

        merged.push({
          ...c,
          weekly_topic: weeklyTopic,
          topicHints: hints,
          existingId: existing?.id ?? null,
          selected: true,
          linkArticle: c.article_index !== null && c.has_details,
          source: r.value.source,
          sourcePdfUrl: r.value.pdfUrl,
        });
      }
    }

    setCandidates(merged);
    if (merged.length === 0) {
      const firstError = settled.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
      if (firstError) setError(firstError.reason?.message ?? 'イベント候補の抽出に失敗しました');
    }
    setIsExtracting(false);
  };

  /** PDF選択のトグル */
  const toggleUrl = (url: string) =>
    setSelectedUrls((prev) => {
      const n = new Set(prev);
      if (n.has(url)) n.delete(url); else n.add(url);
      return n;
    });
  const allPdfSelected = pdfSources.length > 0 && pdfSources.every((s) => selectedUrls.has(s.url));
  const toggleAllPdf = () =>
    setSelectedUrls(allPdfSelected ? new Set() : new Set(pdfSources.map((s) => s.url)));
  const selectedSourceCount = (includeArticles && articles.length > 0 ? 1 : 0) + selectedUrls.size;

  /**
   * 候補のフィールドを更新
   */
  const updateCandidate = (index: number, updates: Partial<EditableCandidate>) => {
    setCandidates((prev) => prev.map((c, i) => (i === index ? { ...c, ...updates } : c)));
  };

  const selectedCandidates = candidates.filter((c) => c.selected);
  const toAdd = selectedCandidates.filter((c) => !c.existingId);
  const toFill = selectedCandidates.filter((c) => !!c.existingId);

  /**
   * 既存カードの「空欄だけ」を候補の値で埋める更新内容を作る。
   * タイトル・日付・記事リンクなど、人が直した可能性のある項目は触らない。
   * 埋めるものが無ければ null（更新しない）。
   */
  const buildFillUpdates = (existing: EventCard, c: EditableCandidate): Partial<EventCard> | null => {
    const u: Partial<EventCard> = {};
    if (!existing.event_time && c.event_time) u.event_time = c.event_time;
    if (!existing.event_location && c.event_location) u.event_location = c.event_location;
    if (!existing.organizer && c.organizer) u.organizer = c.organizer;
    if (!existing.category && c.category) u.category = c.category;
    if (!existing.kind && c.kind) u.kind = c.kind;
    if (!existing.weekly_topic && c.weekly_topic) {
      u.weekly_topic = true;
      u.topic_reason = c.topicHints.length > 0 ? c.topicHints.join('・') : c.topic_reason;
    }
    if (!existing.apply_deadline && c.apply_deadline) u.apply_deadline = c.apply_deadline;
    if (!existing.target_audience && c.target_audience) u.target_audience = c.target_audience;
    if (!existing.fee && c.fee) u.fee = c.fee;
    if (!existing.description && c.description) u.description = c.description;
    if (!existing.digest_exclude && c.digest_exclude) u.digest_exclude = true;
    if (!existing.source_pdf_url && c.sourcePdfUrl) u.source_pdf_url = c.sourcePdfUrl;
    return Object.keys(u).length > 0 ? u : null;
  };

  /**
   * 選択した候補を登録する。
   * - 登録済みのイベントは新規追加せず、既存カードの空欄だけを補完する（元のデータは壊さない）
   * - それ以外は新規カードとして追加する
   */
  const handleRegister = async () => {
    if (selectedCandidates.length === 0) return;
    setIsRegistering(true);
    setError(null);
    try {
      let filled = 0;
      for (const c of toFill) {
        const existing = existingCards.find((card) => card.id === c.existingId);
        if (!existing) continue;
        const updates = buildFillUpdates(existing, c);
        if (!updates) continue;
        await updateEventCard(existing.id, updates);
        filled++;
      }
      for (let i = 0; i < toAdd.length; i++) {
        const c = toAdd[i];
        await addEventCard({
          newsletter_id: newsletter.id,
          title: c.title,
          event_date: c.event_date,
          event_time: c.event_time,
          event_location: c.event_location,
          organizer: c.organizer,
          category: c.category,
          kind: c.kind,
          weekly_topic: c.weekly_topic,
          topic_reason: c.topicHints.length > 0 ? c.topicHints.join('・') : c.topic_reason,
          apply_deadline: c.apply_deadline,
          target_audience: c.target_audience,
          fee: c.fee,
          description: c.description,
          digest_exclude: c.digest_exclude,
          source_pdf_url: c.sourcePdfUrl,
          linked_article_id:
            c.linkArticle && c.article_index !== null ? articles[c.article_index]?.id ?? null : null,
          display_order: existingCards.length + i,
        });
      }
      const parts = [
        toAdd.length > 0 ? `${toAdd.length}件を新しく登録` : null,
        filled > 0 ? `登録済み${filled}件の空欄（締切・種別など）を補完` : null,
        toFill.length - filled > 0 ? `登録済み${toFill.length - filled}件は補完する項目なし` : null,
      ].filter(Boolean);
      showToast(parts.length > 0 ? parts.join('、') + 'しました' : '変更はありませんでした');
      onRegistered();
      onClose();
    } catch (err: any) {
      setError(err?.message ?? 'イベントカードの登録に失敗しました');
      setIsRegistering(false);
    }
  };

  /**
   * book-system（自治会カレンダー）連携形式のJSONをクリップボードにコピー
   */
  const handleCopyJson = async () => {
    const rows = selectedCandidates.map((c) => {
      const { start, end } = splitEventTime(c.event_time);
      return {
        date: c.event_date,
        title: c.title,
        location: c.event_location,
        org_name: c.organizer,
        start_time: start,
        end_time: end,
        article_url: window.location.origin,
      };
    });
    await window.navigator.clipboard.writeText(JSON.stringify(rows, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <Sparkles size={18} className="text-primary-600" />
            イベント候補の確認（AI抽出）
            <span className="text-[11px] font-normal text-slate-400" title="抽出に使うAI">
              {getEventExtractionProviderLabel()}
            </span>
          </h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        {/* 本文 */}
        <div className="flex-1 overflow-y-auto p-4">
          {!started ? (
            /* ソース選択画面 */
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                抽出するソースを選んでください。PDFが多いと時間がかかるので、必要なものだけに絞れます。
                <br />
                <span className="text-slate-400">※「自治会のお知らせ」PDFは記事に取り込み済みのため、この一覧には出していません（記事テキストで抽出されます）。</span>
              </p>

              {articles.length > 0 && (
                <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={includeArticles}
                    onChange={(e) => setIncludeArticles(e.target.checked)}
                    className="shrink-0"
                  />
                  <span className="text-sm text-slate-700">📝 記事テキスト（{articles.length}件）</span>
                </label>
              )}

              {pdfSources.length > 0 ? (
                <>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs font-medium text-slate-500">添付PDF（{pdfSources.length}件）</span>
                    <button
                      type="button"
                      onClick={toggleAllPdf}
                      className="text-xs text-primary-600 hover:text-primary-800"
                    >
                      {allPdfSelected ? 'すべて解除' : 'すべて選択'}
                    </button>
                  </div>
                  <div className="space-y-1">
                    {pdfSources.map((s) => (
                      <label
                        key={s.url}
                        className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={selectedUrls.has(s.url)}
                          onChange={() => toggleUrl(s.url)}
                          className="shrink-0"
                        />
                        <span
                          className={`text-[11px] px-1.5 py-0.5 rounded shrink-0 font-medium ${s.isJichikai ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}
                        >
                          {s.isJichikai ? '自治会' : '地域'}
                        </span>
                        <span className="text-sm text-slate-700 truncate">{s.label}</span>
                        {s.publisher ? (
                          <span className="text-xs text-slate-400 truncate shrink-0">発行元: {s.publisher}</span>
                        ) : (
                          <span className="text-xs text-slate-300 shrink-0">発行元なし</span>
                        )}
                      </label>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-400">この号には添付PDFがありません。</p>
              )}
            </div>
          ) : isExtracting ? (
            <div className="py-8">
              <ProcessingIndicator
                label="AIが選択したソースからイベントの予定を読み取っています…"
                sublabel={
                  progress.total > 0
                    ? `${progress.done} / ${progress.total} 件を処理しました。PDFの枚数によって数分かかることがあります。`
                    : 'PDFの枚数によって数分かかることがあります。このままお待ちください。'
                }
              />
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          ) : candidates.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-slate-500">
                カレンダーに登録できそうなイベントは見つかりませんでした
              </p>
              {sourceInfo && (
                <p className="text-[11px] text-slate-400 mt-2">
                  抽出対象: 記事{sourceInfo.articles}件・PDF{sourceInfo.pdfs}件
                  {sourceInfo.pdfFailed > 0 && (
                    <span className="text-amber-600"> ／ PDF{sourceInfo.pdfFailed}件は読み取れませんでした</span>
                  )}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 mb-1">
                内容を確認・修正し、登録するものにチェックを入れてください（{candidates.length}件抽出
                {candidates.some((c) => c.weekly_topic) && (
                  <>・⭐ 配信候補 {candidates.filter((c) => c.weekly_topic).length}件</>
                )}
                ）
              </p>
              {sourceInfo && (
                <p className="text-[11px] text-slate-400 mb-3">
                  抽出対象: 記事{sourceInfo.articles}件・PDF{sourceInfo.pdfs}件
                  {sourceInfo.pdfFailed > 0 && (
                    <span className="text-amber-600"> ／ PDF{sourceInfo.pdfFailed}件は読み取れませんでした</span>
                  )}
                </p>
              )}
              {candidates.map((c, i) => {
                const linkedArticle = c.article_index !== null ? articles[c.article_index] : undefined;
                // 抽出元PDF（PDF由来のみ）。媒体名＋発行元を表示
                const srcPdf = c.sourcePdfUrl
                  ? pdfSources.find((s) => s.url === c.sourcePdfUrl) ?? null
                  : null;
                const srcLabel = srcPdf
                  ? srcPdf.publisher
                    ? `${srcPdf.label}（${srcPdf.publisher}）`
                    : srcPdf.label
                  : null;
                return (
                  <div
                    key={i}
                    className={`p-3 rounded-lg border ${c.selected ? 'border-primary-300 bg-primary-50/50' : 'border-slate-200 bg-slate-50 opacity-60'}`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={c.selected}
                        onChange={(e) => updateCandidate(i, { selected: e.target.checked })}
                        className="mt-1.5 shrink-0"
                      />
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex gap-2">
                          <input
                            type="date"
                            value={c.event_date}
                            onChange={(e) => updateCandidate(i, { event_date: e.target.value })}
                            className="text-sm border border-slate-300 rounded px-2 py-1 w-36"
                          />
                          <input
                            type="text"
                            value={c.event_time ?? ''}
                            placeholder="時間（例: 10:00-12:00）"
                            onChange={(e) => updateCandidate(i, { event_time: e.target.value || null })}
                            className="text-sm border border-slate-300 rounded px-2 py-1 flex-1 min-w-0"
                          />
                        </div>
                        <input
                          type="text"
                          value={c.title}
                          onChange={(e) => updateCandidate(i, { title: e.target.value })}
                          className="text-sm font-medium border border-slate-300 rounded px-2 py-1 w-full"
                        />
                        {/* AIが根拠にした原文。名前の読み違い（かたつむり→かにつわり等）や、原文に無い名前（作り話）を見つける手がかり */}
                        {c.source_text && (
                          <p
                            className="text-[11px] text-slate-400 truncate"
                            title={`AIが根拠にした原文: ${c.source_text}`}
                          >
                            原文: {c.source_text}
                          </p>
                        )}
                        <input
                          type="text"
                          value={c.event_location ?? ''}
                          placeholder="場所（例: 自治会館）"
                          onChange={(e) => updateCandidate(i, { event_location: e.target.value || null })}
                          className="text-sm border border-slate-300 rounded px-2 py-1 w-full"
                        />
                        {/* 対象者・参加費（週次配信の一押し・申込受付中に添える） */}
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={c.target_audience ?? ''}
                            placeholder="対象（例: 65歳以上）"
                            onChange={(e) => updateCandidate(i, { target_audience: e.target.value || null })}
                            className="text-xs border border-slate-300 rounded px-2 py-1 flex-1 min-w-0"
                            title="対象者。配信文の一押し・申込受付中の行に添えます"
                          />
                          <input
                            type="text"
                            value={c.fee ?? ''}
                            placeholder="参加費（例: 無料 / 400円/回）"
                            onChange={(e) => updateCandidate(i, { fee: e.target.value || null })}
                            className="text-xs border border-slate-300 rounded px-2 py-1 flex-1 min-w-0"
                            title="参加費。配信文の一押し・申込受付中の行に添えます"
                          />
                        </div>
                        {/* 紹介文（週次配信の⭐一押しと予定ページに表示。1〜2文） */}
                        <textarea
                          value={c.description ?? ''}
                          placeholder="紹介文（1〜2文。例: 地元の作品展示と演奏会。お茶を飲みながら気軽に楽しめます。）"
                          rows={2}
                          onChange={(e) => updateCandidate(i, { description: e.target.value || null })}
                          className="text-xs border border-slate-300 rounded px-2 py-1 w-full resize-none leading-relaxed"
                          title="紹介文。週次配信の⭐一押しのタイトル下と、予定の個別ページに表示します"
                        />
                        <OrganizerSelect
                          value={c.organizer}
                          options={orgOptions}
                          onChange={(v) => updateCandidate(i, { organizer: v })}
                          onCreate={handleCreateOrganizer}
                        />
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${c.source === 'pdf' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
                            title={c.source === 'pdf' ? '添付PDFから抽出' : '記事本文から抽出'}
                          >
                            {c.source === 'pdf' ? '📄 PDF' : '📝 記事'}
                          </span>
                          {srcLabel && (
                            <span
                              className="text-[11px] text-slate-500 bg-slate-100 rounded px-1.5 py-0.5 max-w-[16rem] truncate"
                              title={`発行元/媒体: ${srcLabel}`}
                            >
                              📄 {srcLabel}
                            </span>
                          )}
                          {/* 種別（クリックで切替。もう一度押すと解除） */}
                          {CATEGORY_KEYS.map((cat) => {
                            const active = c.category === cat;
                            return (
                              <button
                                key={cat}
                                type="button"
                                onClick={() => updateCandidate(i, { category: active ? null : cat })}
                                className={`text-[11px] px-1.5 py-0.5 rounded font-medium border transition ${active ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-400'}`}
                                title={`種別: ${CATEGORY_META[cat].label}`}
                              >
                                {CATEGORY_META[cat].icon} {CATEGORY_META[cat].label}
                              </button>
                            );
                          })}
                          {/* 性質（交流/支援/教室。クリックで切替、もう一度押すと解除） */}
                          <span className="text-slate-300 text-[11px]">|</span>
                          {KIND_KEYS.map((k) => {
                            const active = c.kind === k;
                            return (
                              <button
                                key={k}
                                type="button"
                                onClick={() => updateCandidate(i, { kind: active ? null : k })}
                                className={`text-[11px] px-1.5 py-0.5 rounded font-medium border transition ${active ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-400'}`}
                                title={`性質: ${KIND_META[k].title}`}
                              >
                                {KIND_META[k].icon} {KIND_META[k].label}
                              </button>
                            );
                          })}
                          {/* 週次配信トピック候補（機械判定＋AI判定。クリックで切替） */}
                          <button
                            type="button"
                            onClick={() => updateCandidate(i, { weekly_topic: !c.weekly_topic })}
                            className={`text-[11px] px-1.5 py-0.5 rounded font-medium border transition ${c.weekly_topic ? 'bg-amber-400 text-amber-950 border-amber-400' : 'bg-white text-slate-400 border-slate-200 hover:border-amber-300'}`}
                            title={`週次LINE配信で取り上げる候補${c.topicHints.length > 0 ? `（${c.topicHints.join('・')}）` : c.topic_reason ? `（AI判定: ${c.topic_reason}）` : ''}`}
                          >
                            ⭐ 配信候補
                            {(c.topicHints.length > 0 || c.topic_reason) && (
                              <span className="ml-1 font-normal opacity-80">
                                {c.topicHints.length > 0 ? c.topicHints.join('・') : c.topic_reason}
                              </span>
                            )}
                          </button>
                          {/* 週次配信に載せない（役員向け会議など。AIの目安を人が確定。カレンダーには載る） */}
                          <button
                            type="button"
                            onClick={() => updateCandidate(i, { digest_exclude: !c.digest_exclude, ...(c.digest_exclude ? {} : { weekly_topic: false }) })}
                            className={`text-[11px] px-1.5 py-0.5 rounded font-medium border transition ${c.digest_exclude ? 'bg-slate-600 text-white border-slate-600' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-400'}`}
                            title="オンにすると週次LINE配信（今週のお知らせ）に載りません。カレンダーには載ります。役員会議・監査など住民向けでない予定に"
                          >
                            🚫 配信に載せない
                          </button>
                          {/* 申込締切（要予約・連続のとき。週次配信の「申込受付中」「締切間近」に使う） */}
                          {(c.category === 'reserve' || c.category === 'recurring' || c.apply_deadline) && (
                            <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                              <span>締切</span>
                              <input
                                type="date"
                                value={c.apply_deadline ?? ''}
                                onChange={(e) => {
                                  const v = e.target.value || null;
                                  // 締切を入れたのに「当日OK」や種別なしは矛盾なので要予約に切り替える
                                  const fixCategory = v && (c.category === null || c.category === 'open') ? { category: 'reserve' as const } : {};
                                  updateCandidate(i, { apply_deadline: v, ...fixCategory });
                                }}
                                className={`text-[11px] border rounded px-1.5 py-0.5 ${c.apply_deadline ? 'border-slate-300' : 'border-dashed border-amber-300 bg-amber-50/40'}`}
                                title="申込締切日。不明なら空欄（配信では開催7日前を仮の締切として扱います）"
                              />
                              {!c.apply_deadline && (
                                <span className="text-[11px] text-amber-700" title="チラシに締切の記載が無かったため。配信では開催7日前を仮の締切にします">
                                  記載なし→{formatMd(addDaysYmd(c.event_date, -7))}頃として配信
                                </span>
                              )}
                            </span>
                          )}
                          {linkedArticle && (
                            <label className="text-xs flex items-center gap-1.5 cursor-pointer select-none" title="オンにすると読者側のカードに「詳しく読む」が表示され、記事が開けます。予定表など、カード以上の情報がない記事ならオフにしてください">
                              <input
                                type="checkbox"
                                checked={c.linkArticle}
                                onChange={(e) => updateCandidate(i, { linkArticle: e.target.checked })}
                              />
                              <span className={c.linkArticle ? 'text-primary-600' : 'text-slate-400'}>
                                🔗 記事にリンク（<span className="truncate">{linkedArticle.title}</span>）
                              </span>
                            </label>
                          )}
                          {c.existingId && (
                            <span
                              className="text-[11px] px-1.5 py-0.5 rounded font-medium bg-amber-100 text-amber-800"
                              title="同じ日付・名前のカードが既にあります。登録時は新しく追加せず、既存カードの空欄（締切・種別・⭐など）だけを補完します"
                            >
                              ✔ 登録済み → 空欄だけ補完
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* フッター（ソース選択） */}
        {!started && (
          <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-200">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              キャンセル
            </button>
            <button
              onClick={startExtraction}
              disabled={selectedSourceCount === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-40 flex items-center gap-2"
            >
              <Sparkles size={15} />
              選択した{selectedSourceCount}件から抽出
            </button>
          </div>
        )}

        {/* フッター（確認・登録） */}
        {started && !isExtracting && candidates.length > 0 && (
          <div className="flex items-center justify-between gap-3 p-4 border-t border-slate-200">
            <button
              onClick={handleCopyJson}
              disabled={selectedCandidates.length === 0}
              className="text-sm text-slate-600 hover:text-slate-800 flex items-center gap-1.5 disabled:opacity-40"
              title="自治会カレンダー連携用のJSONをコピー"
            >
              {copied ? <Check size={15} className="text-green-600" /> : <Copy size={15} />}
              {copied ? 'コピーしました' : 'カレンダー用JSONをコピー'}
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                キャンセル
              </button>
              <button
                onClick={handleRegister}
                disabled={selectedCandidates.length === 0 || isRegistering}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-40 flex items-center gap-2"
              >
                {isRegistering && <Loader2 size={15} className="animate-spin" />}
                {isRegistering
                  ? '登録しています…'
                  : toFill.length > 0
                    ? `新規${toAdd.length}件を登録・登録済み${toFill.length}件を補完`
                    : `選択した${selectedCandidates.length}件を登録`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
