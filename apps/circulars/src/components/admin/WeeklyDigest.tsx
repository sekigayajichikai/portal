/**
 * 週次配信（今週のお知らせ）の下書きを自動で組み立てる画面
 *
 * 公開中の予定カード（event_cards）と公開中のレポート記事から、
 * 公式LINEで毎週流すカード（テキスト＋⭐一押し＋カルーセル）を、AIを使わず決まったルールで組み立て、この画面から送る。
 * （コピペ用の配信文・1040×1040 の配信画像は使わなくなったので 2026-10-05 に削除）
 *
 * 構成と件数上限（情報量が増えすぎないように固定）:
 *   ⭐ 今週の一押し … 最大2件（⭐配信候補のうち直近のもの、または人が選ぶ。紹介文と、チラシPDF／記事への直リンクを添える。どちらも無ければリンク無し）
 *   人が決めたこと（一押しの選択・外した予定・リンク先・手で直した吹き出し）は配信日ごとの下書き（weekly_digest_drafts）に自動保存する
 *   📰 新しいレポート … 最大2件（直近14日に公開されたレポート）
 *   📅 今週の予定 … 最大6件（open / recurring / 種別なし。配信日から7日間）
 *   📝 申込受付中 … 最大4件（reserve。締切が14日以内。締切不明は開催7日前を仮締切）
 *   ⏰ 締切間近 … 締切が配信の週（配信日から7日間）のうちのもの（申込受付中から抜き出して先頭に）
 *
 * 配信のタイミングは「開催日」ではなく「行動が必要な日（申込締切）」で決める。
 * 要予約のイベントは開催の2〜3週間前に「申込受付中」で初めて登場し、締切の週に「締切間近」で再掲される。
 *
 * 仕様: docs/週次配信.md
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  getPublishedEventCards,
  getNewsletters,
  getArticlesByNewsletterId,
  updateEventCard,
  sendLineMessages,
  uploadWeeklyImage,
  recordWeeklyDigestSend,
  getWeeklyDigestSends,
  createWeeklyDigestSchedule,
  getWeeklyDigestSchedules,
  cancelWeeklyDigestSchedule,
  getLineQuota,
  type LineQuota,
  getArticleById,
  convertPdfUrlToBase64,
  generateEventDescriptionWithGemini,
  hasGeminiEventAccess,
  listWeeklyDigestDrafts,
  saveWeeklyDigestDraft,
  renameWeeklyDigestDraft,
  deleteWeeklyDigestDraft,
  type WeeklyDigestDraft,
  type PublicEventCard,
  type Article,
  type LineMessage,
  type LineSendMode,
  type WeeklyDigestSend,
  type WeeklyDigestSchedule,
} from '@cc-saas/shared';
import { Copy, Check, RefreshCw, Loader2, Send, MessageCircle, ShieldCheck, Users, Sparkles, Trash2, Pencil, Files, Clock } from 'lucide-react';
import { showError, showToast, appConfirm, appPrompt } from '@/components/ui/feedback';

import {
  LIMITS,
  siteUrl,
  ymd,
  md,
  topicLink,
  topicImageSource,
  buildDigest,
  topicChoices,
  topicDeadline,
  addDays,
  availableLinkKinds,
  LINK_KIND_LABEL,
  LINK_KINDS,
  MAX_TOPICS,
  type LinkKind,
} from './weeklyDigestCore';
import { buildGreetingText, buildWeeklyMessages } from './weeklyFlex';
import { FlexPreview } from './FlexPreview';
import { CropEditor } from './CropEditor';
import { EventCardEditDialog } from './EventCardEditDialog';
import { type HeroCrop, type CropAspect, normalizeCrop, resolveCrop, drawCropped, loadImageCanvas, renderPdfFirstPage } from './heroCrop';

const REPORT_NEWSLETTER_TITLE = '関ヶ谷レポート';
// ---------------------------------------------------------------------------
// 画面
// ---------------------------------------------------------------------------

/** Date → datetime-local の値（"2026-10-12T07:00"。端末の時刻で） */
const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
/** "10/12(月) 07:00" */
const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  return `${md(ymd(d))} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const SCHEDULE_STATUS_LABEL: Record<WeeklyDigestSchedule['status'], { label: string; cls: string }> = {
  scheduled: { label: '予約中', cls: 'bg-amber-100 text-amber-800' },
  sending: { label: '送信中', cls: 'bg-blue-100 text-blue-700' },
  sent: { label: '送信済み', cls: 'bg-emerald-50 text-emerald-700' },
  failed: { label: '失敗', cls: 'bg-red-100 text-red-700' },
  canceled: { label: '取消', cls: 'bg-slate-100 text-slate-500' },
};

export const WeeklyDigest: React.FC = () => {
  const [baseDate, setBaseDate] = useState<string>(ymd(new Date()));
  const [cards, setCards] = useState<PublicEventCard[]>([]);
  const [reports, setReports] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  /** 一押しごとのチラシ（PDF 1ページ目を描いた canvas。予定ID → canvas。null は無し／失敗） */
  const [flyers, setFlyers] = useState<Record<string, HTMLCanvasElement | null>>({});
  const [flyerStates, setFlyerStates] = useState<Record<string, 'loading' | 'error' | 'idle'>>({});
  /** ⭐一押しの紹介文の下書き（予定ID → 文）。この画面でその場で編集・保存する */
  const [descDrafts, setDescDrafts] = useState<Record<string, string>>({});
  const [savingDesc, setSavingDesc] = useState<string | null>(null);
  /** AI（Gemini）で紹介文を作っている最中の予定ID */
  const [generatingDesc, setGeneratingDesc] = useState<string | null>(null);
  /** 一押しごとのリンク先の指定（予定ID → pdf / article。無ければ自動） */
  const [linkKinds, setLinkKinds] = useState<Record<string, LinkKind>>({});
  /** 吹き出しを手で直したか（立っていると自動生成で上書きしない。下書きにも残す） */
  const [greetingEdited, setGreetingEdited] = useState(false);
  /** 下書き（配信日ごとに複数）: 一覧、いま開いている下書きの id と名前、保存状態、最後に保存した時刻 */
  const [drafts, setDrafts] = useState<WeeklyDigestDraft[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState<string | null>(null);
  const [draftState, setDraftState] = useState<'loading' | 'idle' | 'saving' | 'saved' | 'error'>('loading');
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  /** 最後に読み込んだ／保存した下書きのスナップショット（同じ内容なら保存しない） */
  const lastDraftRef = useRef<string>('');
  /** 自動保存のタイマーから見るための現在値（state だと古い値を掴むため） */
  const draftIdRef = useRef<string | null>(null);
  const draftNameRef = useRef<string | null>(null);
  /** 一覧から選んだ下書き（配信日が違うときは配信日を変えてから開く） */
  const pendingDraftRef = useRef<WeeklyDigestDraft | null>(null);
  /** 一押しごとの画像の切り出し（予定ID → {x,y,scale}）。初期値は予定カードの hero_crop（無ければ旧 hero_crop_y） */
  const [crops, setCrops] = useState<Record<string, HeroCrop>>({});
  const [savingCrop, setSavingCrop] = useState<string | null>(null);
  /** 編集ダイアログで開いている予定（予定タブ・号の画面と同じダイアログ） */
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  /** LINE 送信（Flex）: テキスト吹き出しの文、送信中のモード、直近の結果、履歴 */
  const [greeting, setGreeting] = useState('');
  const [sending, setSending] = useState<LineSendMode | null>(null);
  const [sendNote, setSendNote] = useState<string | null>(null);
  const [history, setHistory] = useState<WeeklyDigestSend[]>([]);
  /** 予約配信: 一覧、日時の入力欄（datetime-local の値）、予約中かどうか */
  const [schedules, setSchedules] = useState<WeeklyDigestSchedule[]>([]);
  const [scheduleAt, setScheduleAt] = useState('');
  const [scheduling, setScheduling] = useState(false);
  /** 今月の LINE 通数（取れなければ null で表示しない） */
  const [quota, setQuota] = useState<LineQuota | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [c, ns] = await Promise.all([getPublishedEventCards(), getNewsletters('published')]);
      setCards(c);
      const frame = ns.find((n) => n.title === REPORT_NEWSLETTER_TITLE);
      if (frame) {
        const arts = await getArticlesByNewsletterId(frame.id);
        setReports(
          arts
            .filter((a) => a.visibility === 'public' || a.visibility === 'members-only')
            .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
        );
      } else {
        setReports([]);
      }
    } catch (e) {
      console.error('週次配信の読み込みエラー:', e);
      showError('予定データを読み込めませんでした。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  /**
   * この週だけ外す予定（チェックを外したもの）。保存しないので来週また拾われる。
   * ずっと外すものは「今後も載せない」で予定カードの digest_exclude を立てる。
   */
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  /**
   * ⭐一押しの指定。undefined = 自動（⭐候補の直近1件）、[] = 今週は一押しなし、配列 = 選んだ予定（順番どおり・最大 MAX_TOPICS）。
   * 配信日を変えたら自動に戻す
   */
  const [topicIds, setTopicIds] = useState<string[] | undefined>(undefined);

  /** 下書きとして保存する項目をひとまとめに（比較用のスナップショットにも使う） */
  const draftBody = useMemo(
    () => ({
      topic_ids: topicIds ?? null,
      excluded_ids: Array.from(excluded).sort(),
      link_kinds: linkKinds as Record<string, string>,
      greeting: greetingEdited ? greeting : null,
    }),
    [topicIds, excluded, linkKinds, greeting, greetingEdited]
  );
  const DEFAULT_DRAFT_KEY = JSON.stringify({ topic_ids: null, excluded_ids: [], link_kinds: {}, greeting: null });

  /** 下書きの表示名（名前が無ければ「配信日の下書き」） */
  const draftLabel = (d: Pick<WeeklyDigestDraft, 'base_date' | 'name'>) => d.name?.trim() || `${md(d.base_date)} の下書き`;

  /** 画面を「自動＝既定」に戻し、開いている下書きを無しにする（配信日はそのまま） */
  const resetToDefaults = () => {
    setTopicIds(undefined);
    setExcluded(new Set());
    setLinkKinds({});
    setGreetingEdited(false);
    lastDraftRef.current = DEFAULT_DRAFT_KEY;
    draftIdRef.current = null;
    draftNameRef.current = null;
    setDraftId(null);
    setDraftName(null);
    setDraftSavedAt(null);
  };

  /** 下書きの内容を画面に反映し、それを「開いている下書き」にする */
  const applyDraft = (d: WeeklyDigestDraft) => {
    const topic = Array.isArray(d.topic_ids) ? (d.topic_ids as string[]) : undefined;
    const ex = Array.isArray(d.excluded_ids) ? (d.excluded_ids as string[]) : [];
    const lk = (d.link_kinds && typeof d.link_kinds === 'object' ? d.link_kinds : {}) as Record<string, LinkKind>;
    setTopicIds(topic);
    setExcluded(new Set(ex));
    setLinkKinds(lk);
    if (d.greeting != null) {
      setGreeting(d.greeting);
      setGreetingEdited(true);
    } else {
      setGreetingEdited(false);
    }
    lastDraftRef.current = JSON.stringify({
      topic_ids: topic ?? null,
      excluded_ids: [...ex].sort(),
      link_kinds: lk,
      greeting: d.greeting ?? null,
    });
    draftIdRef.current = d.id;
    draftNameRef.current = d.name;
    setDraftId(d.id);
    setDraftName(d.name);
    setDraftSavedAt(d.updated_at ?? null);
    setDraftState('saved');
  };

  /** 下書きの一覧を読み直す（返り値は最新の一覧） */
  const refreshDrafts = async () => {
    const list = await listWeeklyDigestDrafts();
    setDrafts(list);
    return list;
  };

  // 配信日が変わったら: 一覧から選んだ下書きがあればそれを、無ければその日のいちばん新しい下書きを開く（無ければ自動＝既定）
  useEffect(() => {
    let cancelled = false;
    setDraftState('loading');
    resetToDefaults();
    const pending = pendingDraftRef.current;
    pendingDraftRef.current = null;
    if (pending && pending.base_date === baseDate) {
      applyDraft(pending);
      return;
    }
    refreshDrafts()
      .then((list) => {
        if (cancelled) return;
        const latest = list.find((d) => d.base_date === baseDate);
        if (latest) applyDraft(latest);
        else setDraftState('idle');
      })
      .catch(() => {
        if (!cancelled) setDraftState('idle');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseDate]);

  // 下書きの項目が変わったら 1.5 秒後に自動保存（読み込み中・内容が同じ・既定のまま下書きが無いときは保存しない）
  useEffect(() => {
    if (draftState === 'loading') return;
    const key = JSON.stringify(draftBody);
    if (key === lastDraftRef.current) return;
    if (key === DEFAULT_DRAFT_KEY && !draftIdRef.current) return;
    const timer = setTimeout(async () => {
      setDraftState('saving');
      try {
        const isNew = !draftIdRef.current;
        // 新規のときの名前は「下書き1」「下書き2」…（同じ配信日の件数＋1）
        const name = isNew ? `下書き${drafts.filter((d) => d.base_date === baseDate).length + 1}` : draftNameRef.current;
        const row = await saveWeeklyDigestDraft({ id: draftIdRef.current ?? undefined, base_date: baseDate, name, ...draftBody });
        lastDraftRef.current = key;
        draftIdRef.current = row.id;
        draftNameRef.current = row.name;
        setDraftId(row.id);
        setDraftName(row.name);
        setDraftSavedAt(row.updated_at ?? new Date().toISOString());
        setDraftState('saved');
        refreshDrafts().catch(() => {});
      } catch (e) {
        console.warn('下書きの自動保存に失敗:', e);
        setDraftState('error');
      }
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftBody, draftState === 'loading']);

  /** 一覧から下書きを開く（配信日が違えば配信日を変え、そのあと開く） */
  const openDraft = (d: WeeklyDigestDraft) => {
    if (d.id === draftIdRef.current) return;
    if (d.base_date !== baseDate) {
      pendingDraftRef.current = d;
      setBaseDate(d.base_date);
      return;
    }
    setDraftState('loading');
    resetToDefaults();
    applyDraft(d);
  };

  /** この配信日で新しい下書きを始める（最初の変更で保存される） */
  const newDraft = () => {
    setDraftState('loading');
    resetToDefaults();
    setDraftState('idle');
  };

  /** 下書きの名前を変える */
  const renameDraft = async () => {
    if (!draftIdRef.current) return;
    const name = await appPrompt({ title: '下書きの名前', message: '例: A案、チラシ強め、10/5 用', defaultValue: draftNameRef.current ?? '', confirmLabel: '変更' });
    if (name == null) return;
    try {
      await renameWeeklyDigestDraft(draftIdRef.current, name.trim());
      draftNameRef.current = name.trim();
      setDraftName(name.trim());
      refreshDrafts().catch(() => {});
    } catch (e) {
      console.error(e);
      showError('名前を変えられませんでした。');
    }
  };

  /** いまの内容で下書きを複製し、複製の方を開く */
  const duplicateDraft = async () => {
    try {
      const name = `${draftNameRef.current?.trim() || `下書き`} のコピー`;
      const row = await saveWeeklyDigestDraft({ base_date: baseDate, name, ...draftBody });
      applyDraft(row);
      refreshDrafts().catch(() => {});
      showToast(`「${name}」を作りました。こちらを編集しています`);
    } catch (e) {
      console.error(e);
      showError('複製できませんでした。');
    }
  };

  /** 開いている下書きを削除して自動（既定）に戻す */
  const discardDraft = async () => {
    const ok = await appConfirm({
      title: `「${draftName?.trim() || `${md(baseDate)} の下書き`}」を捨てますか？`,
      message: '一押しの選択・この週だけ外した予定・リンク先・手で直した文が消え、自動で組み立てた状態に戻ります。紹介文と画像の切り出し（予定カードに保存したもの）は残ります。',
      confirmLabel: '下書きを捨てる',
    });
    if (!ok) return;
    try {
      if (draftIdRef.current) await deleteWeeklyDigestDraft(draftIdRef.current);
      resetToDefaults();
      setDraftState('idle');
      refreshDrafts().catch(() => {});
      showToast('下書きを捨てました');
    } catch (e) {
      console.error(e);
      showError('下書きを捨てられませんでした。');
    }
  };
  const choices = useMemo(() => topicChoices(cards, baseDate), [cards, baseDate]);

  /** 拾われた予定の全体（チェック一覧用。digest_exclude のものは最初から入らない） */
  const fullDigest = useMemo(() => buildDigest(cards, reports, baseDate, { topicIds }), [cards, reports, baseDate, topicIds]);
  /** 実際に配信する内容（チェックを外した予定を除いたもの） */
  const digest = useMemo(
    () => buildDigest(cards.filter((c) => !excluded.has(c.id)), reports, baseDate, { topicIds }),
    [cards, reports, baseDate, excluded, topicIds]
  );
  /** いま一押しになっている予定のID（自動のときも含む） */
  const currentTopicIds = fullDigest.topics.map((t) => t.id);
  /**
   * 一押しのチェックを切り替える（自動状態からの操作は、いまの自動の1件を起点にする）。
   * 起点は保存値ではなく「いま実際に一押しになっているもの」。下書きに残った選べない予定のID
   * （「今後も載せない」にした・消した・過ぎた予定）で上限に達したことになり、チェックできなくなるのを防ぐ
   */
  const toggleTopic = (id: string) =>
    setTopicIds(() => {
      const base = currentTopicIds;
      if (base.includes(id)) return base.filter((x) => x !== id);
      if (base.length >= MAX_TOPICS) return base;
      return [...base, id];
    });

  /** チェック一覧の行（一押し・締切間近・今週の予定・申込受付中の順） */
  const digestItems = useMemo(() => {
    const rows: Array<{ card: PublicEventCard; section: string }> = [];
    // 一押しは「今週の予定」にも重ねて載るが、チェック一覧では1行にまとめる（外すと両方から消える）
    const seen = new Set<string>();
    const push = (card: PublicEventCard, section: string) => {
      if (seen.has(card.id)) return;
      seen.add(card.id);
      rows.push({ card, section });
    };
    for (const c of fullDigest.topics) push(c, '⭐ 一押し');
    for (const c of fullDigest.urgent) push(c, '⏰ 締切間近');
    for (const c of fullDigest.events) push(c, '📅 今週の予定');
    for (const c of fullDigest.apply) push(c, '📝 申込受付中');
    return rows;
  }, [fullDigest]);

  const toggleExcluded = (id: string) =>
    setExcluded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  /** 予定カードに「週次配信に載せない」を立てる（以後の週次配信に出なくなる。カレンダーには載る） */
  const excludeForever = async (card: PublicEventCard) => {
    const ok = await appConfirm({
      title: `「${card.title}」を今後も週次配信に載せませんか？`,
      message: '予定カードに「週次配信に載せない」が付き、以後の今週のお知らせに出なくなります。カレンダーには載ります。戻すときは「予定」タブでこの予定を開き、チェックを外してください。',
      confirmLabel: '今後も載せない',
    });
    if (!ok) return;
    try {
      const saved = await updateEventCard(card.id, { digest_exclude: true });
      if (!('digest_exclude' in saved)) {
        showError('設定できませんでした。DBに digest_exclude 列がありません（sql/migrations/2026-09-21-event-cards-digest-exclude.sql）。');
        return;
      }
      setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, digest_exclude: true } : c)));
      showToast(`「${card.title}」を今後の週次配信から外しました`);
    } catch (e) {
      console.error(e);
      showError('設定できませんでした。');
    }
  };

  const topicKey = digest.topics.map((t) => t.id).join(',');

  // 一押しが変わったら、紹介文の下書きと切り出し位置を予定カードの値で初期化する（未設定のものだけ）
  useEffect(() => {
    setDescDrafts((prev) => {
      const n = { ...prev };
      for (const t of digest.topics) if (!(t.id in n)) n[t.id] = t.description ?? '';
      return n;
    });
    setCrops((prev) => {
      const n = { ...prev };
      for (const t of digest.topics) if (!(t.id in n)) n[t.id] = normalizeCrop(t.hero_crop, t.hero_crop_y);
      return n;
    });
    // cards: 編集ダイアログで保存したあと（下書きを消して読み直したとき）も、新しい値で埋め直す
  }, [topicKey, cards]);

  /** 一押しの紹介文を予定カードに保存し、カードに反映する */
  const saveDescription = async (topic: PublicEventCard) => {
    const description = (descDrafts[topic.id] ?? '').trim() || null;
    setSavingDesc(topic.id);
    try {
      const saved = await updateEventCard(topic.id, { description });
      // DBに description 列が無い（マイグレーション未適用）と黙って落ちるので、返ってきた行で確認する
      if (description && !('description' in saved)) {
        showError('紹介文は保存されませんでした。DBに紹介文の列がありません（sql/migrations/2026-09-21-event-cards-description.sql）。');
        return;
      }
      setCards((prev) => prev.map((c) => (c.id === topic.id ? { ...c, description } : c)));
      showToast('紹介文を保存しました');
    } catch (e) {
      console.error('紹介文の保存エラー:', e);
      showError('紹介文を保存できませんでした。');
    } finally {
      setSavingDesc(null);
    }
  };

  /**
   * 一押しの紹介文を AI（Gemini・無料枠）で作って下書き欄に入れる。保存はしない（人が読んで直してから「紹介文を保存」）。
   * 手がかりは チラシPDF（あれば添付）＞ リンク記事の本文。号PDFの代用は使わない（号全体を読ませると的外れになる）
   */
  const generateDescription = async (topic: PublicEventCard) => {
    setGeneratingDesc(topic.id);
    try {
      let articleText: string | null = null;
      if (topic.linked_article_id) {
        try {
          const a = await getArticleById(topic.linked_article_id);
          articleText = a?.content || a?.summary || null;
        } catch (e) {
          console.warn('記事本文の取得に失敗（紹介文はタイトル等から作る）:', e);
        }
      }
      let pdfBase64: string | null = null;
      if (topic.source_pdf_url) {
        try {
          pdfBase64 = await convertPdfUrlToBase64(topic.source_pdf_url);
        } catch (e) {
          console.warn('チラシPDFの取得に失敗（紹介文は記事・タイトルから作る）:', e);
        }
      }
      const description = await generateEventDescriptionWithGemini({
        title: topic.title,
        eventDate: topic.event_date ?? '',
        eventTime: topic.event_time,
        location: topic.event_location,
        organizer: topic.organizer,
        targetAudience: topic.target_audience,
        fee: topic.fee,
        articleText,
        pdfBase64,
      });
      setDescDrafts((prev) => ({ ...prev, [topic.id]: description }));
      showToast('紹介文を作りました。読んで直してから「紹介文を保存」を押してください');
    } catch (e) {
      console.error('紹介文の生成エラー:', e);
      const msg = e instanceof Error ? e.message : String(e);
      showError(/429|RESOURCE_EXHAUSTED|quota/i.test(msg) ? 'AIの無料枠の回数制限にかかりました。1分ほど待ってからもう一度押してください。' : `紹介文を作れませんでした。${msg}`);
    } finally {
      setGeneratingDesc(null);
    }
  };

  /** 画像の切り出し（位置と拡大）を予定カードに保存する（次回以降も同じ切り出し） */
  const saveCrop = async (topic: PublicEventCard) => {
    // 枠の形が未指定なら、いま表示している既定（元画像の向きで決めたもの）を確定して保存する
    const flyer = flyers[topic.id];
    const crop = flyer ? resolveCrop(normalizeCrop(crops[topic.id]), flyer.width, flyer.height) : normalizeCrop(crops[topic.id]);
    setSavingCrop(topic.id);
    try {
      const saved = await updateEventCard(topic.id, { hero_crop: crop, hero_crop_y: crop.y });
      if (!('hero_crop' in saved)) {
        showError('切り出しは保存されませんでした。DBに hero_crop 列がありません（sql/migrations/2026-09-22-event-cards-hero-crop-json.sql）。');
        return;
      }
      setCards((prev) => prev.map((c) => (c.id === topic.id ? { ...c, hero_crop: crop, hero_crop_y: crop.y } : c)));
      showToast('切り出しを保存しました');
    } catch (e) {
      console.error(e);
      showError('切り出し位置を保存できませんでした。');
    } finally {
      setSavingCrop(null);
    }
  };

  /** 読み込み失敗の理由（予定ID → メッセージ）。「もう一度読み込む」で消す */
  const [flyerErrors, setFlyerErrors] = useState<Record<string, string>>({});
  const [flyerReload, setFlyerReload] = useState(0);
  /** 失敗した予定の画像をもう一度読み込む */
  const retryFlyer = (id: string) => {
    setFlyers((prev) => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
    setFlyerErrors((prev) => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
    setFlyerReload((x) => x + 1);
  };

  // 一押しごとのカード画像の元（チラシPDFの1ページ目、または記事の写真）を canvas に。まだ読んでいない予定だけ。
  // 途中でキャンセルすると「読み込み中」のまま止まることがあるので、結果は常に保存する（表示中でない予定に入っても害はない）
  useEffect(() => {
    for (const t of digest.topics) {
      if (t.id in flyers) continue;
      const src = topicImageSource(t);
      if (!src) {
        setFlyers((prev) => ({ ...prev, [t.id]: null }));
        continue;
      }
      setFlyerStates((prev) => ({ ...prev, [t.id]: 'loading' }));
      (src.kind === 'pdf' ? renderPdfFirstPage(src.url) : loadImageCanvas(src.url))
        .then((c) => {
          setFlyers((prev) => ({ ...prev, [t.id]: c }));
          setFlyerStates((prev) => ({ ...prev, [t.id]: 'idle' }));
        })
        .catch((e) => {
          console.error('カード画像の読み込みエラー:', e);
          setFlyers((prev) => ({ ...prev, [t.id]: null }));
          setFlyerStates((prev) => ({ ...prev, [t.id]: 'error' }));
          setFlyerErrors((prev) => ({ ...prev, [t.id]: e?.message ? String(e.message) : String(e) }));
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicKey, flyerReload]);

  // ---- LINE 送信（Flex） ----

  // テキスト吹き出しの既定文（一押しが変わったら作り直す。手で直した後は上書きしない。「作り直す」で戻す）
  useEffect(() => {
    if (greetingEdited) return;
    setGreeting(buildGreetingText(digest));
  }, [digest, greetingEdited]);

  const loadHistory = () => getWeeklyDigestSends(8).then(setHistory);
  const loadSchedules = () => getWeeklyDigestSchedules(8).then(setSchedules);
  const loadQuota = () => getLineQuota().then(setQuota);
  useEffect(() => {
    loadHistory();
    loadSchedules();
    loadQuota();
    // 予約が送られると状態が変わるので、開いている間は1分ごとに読み直す
    const timer = setInterval(() => {
      loadSchedules();
      loadHistory();
      loadQuota();
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  // 予約日時の初期値: 配信日の朝7時（もう過ぎていれば、いまから1時間後の5分刻み）
  useEffect(() => {
    const morning = new Date(`${baseDate}T07:00`);
    const soon = new Date(Math.ceil((Date.now() + 60 * 60_000) / (5 * 60_000)) * 5 * 60_000);
    setScheduleAt(toLocalInput(morning.getTime() > Date.now() + 5 * 60_000 ? morning : soon));
  }, [baseDate]);

  /**
   * カード用のチラシ画像: チラシから正方形を切り出したもの（予定ID → canvas）。
   * 縦長のチラシをそのまま載せるとカードが高くなりすぎるため。切り出し位置（0=上端〜1=下端）は人が決められる。
   * チラシ全体は「詳しく見る」（PDF）で開ける。
   */
  const flyerCards = useMemo(() => {
    const out: Record<string, HTMLCanvasElement | null> = {};
    for (const t of digest.topics) {
      const flyer = flyers[t.id];
      out[t.id] = flyer ? drawCropped(flyer, resolveCrop(normalizeCrop(crops[t.id]), flyer.width, flyer.height), Math.min(flyer.width, 1040)) : null;
    }
    return out;
  }, [digest.topics, flyers, crops]);
  /** 一押しごとの画像枠の形（Flex の aspectRatio とプレビューに使う） */
  const flyerAspects = useMemo(() => {
    const out: Record<string, CropAspect> = {};
    for (const t of digest.topics) {
      const flyer = flyers[t.id];
      if (flyer) out[t.id] = resolveCrop(normalizeCrop(crops[t.id]), flyer.width, flyer.height).aspect;
    }
    return out;
  }, [digest.topics, flyers, crops]);
  /** プレビュー用の data URL（予定ID → dataURL） */
  const flyerSrcs = useMemo(() => {
    const out: Record<string, string | null> = {};
    for (const [id, c] of Object.entries(flyerCards)) out[id] = c ? c.toDataURL('image/jpeg', 0.8) : null;
    return out;
  }, [flyerCards]);

  /**
   * 送るメッセージを組み立てる。Flex の画像は https が必要なので、
   * 一押しごとのチラシ画像を Storage（newsletter-images/weekly/）に置いてから使う。
   */
  /** 送るメッセージを作る（チラシ画像を Storage に置く）。prefix は画像のファイル名（予約は予約ごとに別名にして、後の作り直しで上書きされないように） */
  const buildMessages = async (prefix = 'flyer'): Promise<LineMessage[]> => {
    const flyerImageUrls: Record<string, string | null> = {};
    for (let i = 0; i < digest.topics.length; i++) {
      const t = digest.topics[i];
      const card = flyerCards[t.id];
      flyerImageUrls[t.id] = null;
      if (!card) continue;
      const blob = await new Promise<Blob | null>((resolve) => card.toBlob(resolve, 'image/jpeg', 0.85));
      if (blob) flyerImageUrls[t.id] = await uploadWeeklyImage(blob, baseDate, `${prefix}-${i + 1}`);
    }
    return buildWeeklyMessages(digest, greeting, { flyerImageUrls, flyerAspects, linkKinds });
  };

  /** validate: 形式チェックのみ / test: 自分にだけ / broadcast: 全員 */
  const send = async (mode: LineSendMode) => {
    if (mode === 'broadcast' && localLinkError()) return;
    if (mode === 'broadcast') {
      const ok = await appConfirm({
        title: '友だち全員に配信しますか？',
        message: `${md(digest.from)}〜${md(digest.to)} の「今週のお知らせ」を公式LINEの友だち全員に送ります。取り消しはできません。先に「テスト送信」で見た目を確認してください。${pendingThisWeek ? `\n\n⚠ この配信日は ${fmtDateTime(pendingThisWeek.send_at)} に予約があります。いま送るなら、予約は取り消してください（二重配信になります）。` : ''}`,
        confirmLabel: '全員に配信する',
      });
      if (!ok) return;
    }
    setSending(mode);
    setSendNote(null);
    try {
      const messages = await buildMessages();
      const result = await sendLineMessages(mode, messages);
      const label = mode === 'validate' ? '形式チェックOK。LINE に送れる内容です' : mode === 'test' ? 'テスト送信しました。自分のLINEで見た目を確認してください' : mode === 'admins' ? '管理者に送りました。各自のLINEで見た目を確認してもらってください' : '友だち全員に配信しました';
      setSendNote(`✅ ${label}（${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}）`);
      showToast(label);
      if (mode !== 'validate') {
        await recordWeeklyDigestSend({ base_date: baseDate, mode, text: greeting, messages, line_status: result.status, draft_id: draftId });
        loadHistory();
        loadQuota();
      }
    } catch (e: any) {
      console.error('LINE 送信エラー:', e);
      setSendNote(`❌ ${e?.message ?? '送信に失敗しました'}`);
      showError(e?.message ?? '送信に失敗しました');
    } finally {
      setSending(null);
    }
  };

  /**
   * カードのリンク（記事・レポート・「ほかの予定も見る」）は siteUrl() で作る。VITE_PUBLIC_SITE_URL が無いと開いている画面の
   * アドレスになり、ローカルから送ると http://localhost:5175/... が全員に届いてしまう（2026-10-05 に実際に起きた）。
   * 全員配信と予約の前に止める。止めたら true
   */
  const localLinkError = () => {
    const base = siteUrl();
    if (!/^https?:\/\/(localhost|127\.|192\.168\.|\[::1\])/.test(base)) return false;
    showError(`カードのリンクが ${base} になっているため、全員には送れません。.env.local に VITE_PUBLIC_SITE_URL=https://sekigayajichikai.vercel.app を入れてサーバーを起動し直すか、本番の管理画面から送ってください。`);
    return true;
  };

  /** 予約後に画面の内容が変わったかを見分ける値（チラシ画像そのものは比べず、切り出し位置で代用） */
  const contentKey = useMemo(
    () => JSON.stringify({ m: buildWeeklyMessages(digest, greeting, { flyerImageUrls: {}, flyerAspects, linkKinds }), crops: digest.topics.map((t) => crops[t.id] ?? null) }),
    [digest, greeting, flyerAspects, linkKinds, crops]
  );

  /** いまの内容で予約する（形式チェックを通してから保存。画像も予約した時点のもので固定） */
  const schedule = async () => {
    if (localLinkError()) return;
    const at = new Date(scheduleAt);
    if (!scheduleAt || Number.isNaN(at.getTime())) return showError('送る日時を入れてください');
    if (at.getTime() < Date.now() + 60_000) return showError('送る日時は、いまより後にしてください');
    const ok = await appConfirm({
      title: 'この内容で予約しますか？',
      message: `${fmtDateTime(at.toISOString())} ごろ（最大5分遅れ）に、${md(digest.from)}〜${md(digest.to)} の「今週のお知らせ」を友だち全員に送ります。\n予約した時点の内容で送ります。あとで画面を直したときは、予約を取り消して予約し直してください。${pendingThisWeek ? '\n\n⚠ この配信日にはすでに予約があります。二重配信にならないよう、古い予約は取り消してください。' : ''}`,
      confirmLabel: '予約する',
    });
    if (!ok) return;
    setScheduling(true);
    setSendNote(null);
    try {
      const id = crypto.randomUUID();
      const messages = await buildMessages(`sched-${id.slice(0, 8)}`);
      // 送る時になって形式エラーで落ちないよう、予約の前に LINE 側でチェックする
      await sendLineMessages('validate', messages);
      await createWeeklyDigestSchedule({ id, base_date: baseDate, send_at: at.toISOString(), messages, text: greeting, content_key: contentKey, draft_id: draftId });
      const label = `${fmtDateTime(at.toISOString())} に予約しました`;
      setSendNote(`⏰ ${label}`);
      showToast(label);
      loadSchedules();
    } catch (e: any) {
      console.error('予約エラー:', e);
      setSendNote(`❌ ${e?.message ?? '予約できませんでした'}`);
      showError(e?.message ?? '予約できませんでした');
    } finally {
      setScheduling(false);
    }
  };

  const cancelSchedule = async (s: WeeklyDigestSchedule) => {
    const ok = await appConfirm({ title: '予約を取り消しますか？', message: `${fmtDateTime(s.send_at)} の予約を取り消します。`, confirmLabel: '取り消す' });
    if (!ok) return;
    try {
      const done = await cancelWeeklyDigestSchedule(s.id);
      showToast(done ? '予約を取り消しました' : 'すでに送信が始まっていたため、取り消せませんでした');
    } catch (e: any) {
      showError(e?.message ?? '取り消せませんでした');
    }
    loadSchedules();
  };

  /** Flex JSON をコピー（LINE Developers の Flex Message Simulator に貼って確認する用） */
  const copyFlexJson = async () => {
    try {
      const messages = buildWeeklyMessages(digest, greeting, { flyerImageUrls: {}, flyerAspects, linkKinds });
      const flex = messages.filter((m) => m.type === 'flex');
      // Flex Message Simulator は1メッセージずつ貼るので、複数あれば配列で（一押し → カルーセル の順）
      await navigator.clipboard.writeText(JSON.stringify(flex.length === 1 ? flex[0] : flex, null, 2));
      showToast('Flex JSON をコピーしました（一押しとカルーセルの2つ。チラシ画像は送信時に付きます）');
    } catch {
      showError('コピーできませんでした');
    }
  };
  const alreadySentThisWeek = history.find((h) => h.mode === 'broadcast' && h.base_date === baseDate);
  /** この配信日の、まだ送っていない予約 */
  const pendingThisWeek = schedules.find((s) => s.status === 'scheduled' && s.base_date === baseDate);

  const counts = {
    topic: digest.topics.length,
    reports: digest.reports.length,
    urgent: digest.urgent.length,
    events: digest.events.length,
    apply: digest.apply.length,
  };
  const total = counts.topic + counts.reports + counts.urgent + counts.events + counts.apply;

  return (
    <div className="space-y-4">
      {editingCardId && (
        <EventCardEditDialog
          cardId={editingCardId}
          onClose={() => setEditingCardId(null)}
          onChanged={() => {
            // 紹介文・切り出しの下書きはカードの新しい値で作り直す（古い下書きが残らないように）
            // 由来PDF・記事を変えたかもしれないので、カード画像も読み直す
            const id = editingCardId;
            setDescDrafts(({ [id]: _d, ...rest }) => rest);
            setCrops(({ [id]: _c, ...rest }) => rest);
            load().then(() => retryFlyer(id));
          }}
        />
      )}
      <div className="bg-white p-6 rounded-2xl shadow border border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Send size={20} className="text-emerald-600" />
              週次配信（今週のお知らせ）
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              公開中の予定カードとレポートから、公式LINEで流すカードを自動で組み立てます。下の「LINE に送る」からテスト送信で確かめてから配信してください。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">配信日</label>
            <input
              type="date"
              value={baseDate}
              onChange={(e) => setBaseDate(e.target.value)}
              className="text-sm border border-slate-300 rounded-lg px-2 py-1.5"
            />
            <button
              onClick={load}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition"
              title="予定データを読み直す"
            >
              <RefreshCw size={14} /> 読み直す
            </button>
          </div>
        </div>
        {/* 下書き（配信日ごとに複数。一押しの選択・外した予定・リンク先・手で直した吹き出しを自動保存） */}
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 mt-2 text-[11px] text-slate-500">
          <label className="flex items-center gap-1">
            <span className="text-slate-500">下書き</span>
            <select
              value={draftId ?? 'new'}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'new') newDraft();
                else {
                  const d = drafts.find((x) => x.id === v);
                  if (d) openDraft(d);
                }
              }}
              className="text-xs border border-slate-300 rounded-lg px-2 py-1 bg-white max-w-[280px]"
              title="開く下書きを選ぶ。配信日が違う下書きを選ぶと配信日も変わります"
            >
              <option value="new">＋ 新しい下書き（{md(baseDate)} 配信）</option>
              {Array.from(new Set(drafts.map((d) => d.base_date))).map((date) => (
                <optgroup key={date} label={`${md(date)} 配信`}>
                  {drafts
                    .filter((d) => d.base_date === date)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {draftLabel(d)}（更新 {new Date(d.updated_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}）
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <span className="flex items-center gap-1 text-slate-400">
            {draftState === 'loading' && (<><Loader2 size={11} className="animate-spin" /> 下書きを確認中…</>)}
            {draftState === 'saving' && (<><Loader2 size={11} className="animate-spin" /> 保存中…</>)}
            {draftState === 'saved' && (<><Check size={11} className="text-emerald-600" /> 保存済み{draftSavedAt ? `（${new Date(draftSavedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}）` : ''}</>)}
            {draftState === 'idle' && '新しい下書き。変更すると自動で保存されます'}
            {draftState === 'error' && <span className="text-red-600">保存できませんでした（sql/migrations/2026-09-24-weekly-digest-drafts*.sql が未適用かもしれません）</span>}
          </span>
          {draftId && (
            <>
              <button onClick={renameDraft} className="flex items-center gap-1 hover:text-slate-800" title="この下書きの名前を変える">
                <Pencil size={11} /> 名前を変える
              </button>
              <button onClick={duplicateDraft} className="flex items-center gap-1 hover:text-slate-800" title="いまの内容で別の下書きを作る（A案・B案の比較用）">
                <Files size={11} /> 複製
              </button>
              <button onClick={discardDraft} className="flex items-center gap-1 hover:text-red-600" title="この下書きを消して、自動で組み立てた状態に戻す">
                <Trash2 size={11} /> 捨てる
              </button>
            </>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-10 justify-center">
            <Loader2 size={16} className="animate-spin" /> 予定を読み込み中...
          </div>
        ) : (
          <>
            {/* 内訳（何が何件入ったか） */}
            <div className="flex flex-wrap gap-2 mt-4 text-xs">
              {[
                ['⭐ 一押し', counts.topic, MAX_TOPICS],
                ['📰 レポート', counts.reports, LIMITS.reports],
                ['⏰ 締切間近', counts.urgent, null],
                ['📅 予定', counts.events, LIMITS.events],
                ['📝 申込受付中', counts.apply, LIMITS.apply],
              ].map(([label, n, max]) => (
                <span
                  key={String(label)}
                  className={`px-2 py-1 rounded-full border ${Number(n) > 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-400'}`}
                >
                  {label} {n}
                  {max !== null ? `/${max}` : ''}件
                </span>
              ))}
              <span className="px-2 py-1 text-slate-400">合計 {total} 件</span>
            </div>
            {total === 0 && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
                この配信日の範囲に予定がありません。予定カードが登録・公開されているか、配信日を確認してください。
              </p>
            )}

            {/* ⭐一押しを人が選ぶ（最大2件・チェックした順）。外れた予定は今週の範囲内なら「今週の予定」に普通の行として載る */}
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="font-bold text-slate-700">⭐ 今週の一押し（最大{MAX_TOPICS}件・チェックした順）</span>
                <span className="text-slate-500">
                  {topicIds === undefined ? '自動: ⭐候補のうち直近の1件' : topicIds.length === 0 ? '今週は一押しなし（テキスト→カード一覧の2吹き出し）' : `${topicIds.length}件を選択中`}
                </span>
                {topicIds !== undefined && (
                  <button onClick={() => setTopicIds(undefined)} className="text-slate-500 hover:text-slate-800 underline">
                    自動に戻す
                  </button>
                )}
                {topicIds === undefined && currentTopicIds.length > 0 && (
                  <button onClick={() => setTopicIds([])} className="text-slate-500 hover:text-slate-800 underline">
                    今週は一押しなし
                  </button>
                )}
              </div>
              <div className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
                {[
                  ...choices.starred.map((c) => ({ c, star: true })),
                  ...choices.dueThisWeek.map((c) => ({ c, star: false })),
                  ...choices.others.map((c) => ({ c, star: false })),
                ].map(({ c, star }) => {
                  // 今週が申込締切のものは印を付ける（開催が先でも、申込のリマインドとして一押しにできる）
                  const due = topicDeadline(c, { from: baseDate, to: addDays(baseDate, 6) });
                  const on = currentTopicIds.includes(c.id);
                  const order = currentTopicIds.indexOf(c.id);
                  const disabled = !on && currentTopicIds.length >= MAX_TOPICS;
                  return (
                    <label key={c.id} className={`flex items-center gap-1.5 cursor-pointer select-none ${disabled ? 'opacity-40' : ''} ${on ? 'text-slate-800 font-bold' : 'text-slate-600'}`}>
                      <input type="checkbox" checked={on} disabled={disabled} onChange={() => toggleTopic(c.id)} />
                      {on && <span className="text-[10px] px-1 rounded bg-amber-500 text-white">{order + 1}</span>}
                      <span className="truncate">
                        {star ? '⭐ ' : ''}
                        {md(c.event_date!)} {c.title}
                        {due?.thisWeek && (
                          <span className="ml-1 text-[10px] px-1 rounded bg-red-100 text-red-700 font-bold">
                            ⏰今週締切 {md(due.deadline)}{due.guessed ? '頃' : ''}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* 拾われた予定の一覧。チェックを外すとこの週のカードから消える。「今後も載せない」は予定カードに保存 */}
            {digestItems.length > 0 && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-bold text-slate-600 mb-1">
                  載せる予定（チェックを外すと今週の配信から外れます）
                  {excluded.size > 0 && <span className="ml-2 font-normal text-amber-700">{excluded.size}件を外しています</span>}
                </p>
                <ul className="space-y-0.5">
                  {digestItems.map(({ card, section }) => {
                    const on = !excluded.has(card.id);
                    return (
                      <li key={card.id} className="flex items-center gap-2 text-xs">
                        <label className={`flex items-center gap-1.5 cursor-pointer select-none flex-1 min-w-0 ${on ? 'text-slate-700' : 'text-slate-400 line-through'}`}>
                          <input type="checkbox" checked={on} onChange={() => toggleExcluded(card.id)} />
                          <span className="shrink-0 text-slate-400 w-24">{section}</span>
                          <span className="truncate">
                            {card.event_date ? md(card.event_date) : ''} {card.title}
                          </span>
                        </label>
                        <button
                          onClick={() => excludeForever(card)}
                          className="shrink-0 text-[11px] text-slate-400 hover:text-red-600"
                          title="予定カードに「週次配信に載せない」を付けて、今後の配信にも出さない（役員向け会議など）"
                        >
                          🚫 今後も載せない
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {/* ⭐一押しごとの設定: 紹介文（予定カードに保存）／リンク先／チラシの切り出し位置 */}
            {digest.topics.map((t, i) => {
              const draft = descDrafts[t.id] ?? '';
              const dirty = draft.trim() !== (t.description ?? '').trim();
              const kinds = availableLinkKinds(t);
              const currentKind = topicLink(t, linkKinds[t.id])?.kind ?? null;
              const flyer = flyers[t.id];
              const imgSrc = topicImageSource(t);
              const savedCrop = normalizeCrop(t.hero_crop, t.hero_crop_y);
              const curCrop = normalizeCrop(crops[t.id]);
              const cropDirty = curCrop.x !== savedCrop.x || curCrop.y !== savedCrop.y || curCrop.scale !== savedCrop.scale || (curCrop.aspect ?? null) !== (savedCrop.aspect ?? null);
              return (
                <div key={t.id} className={`mt-3 rounded-lg border px-3 py-2 ${t.description ? 'border-slate-200 bg-slate-50' : 'border-amber-200 bg-amber-50'}`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="text-xs font-bold text-slate-600">
                      ⭐ 一押し{digest.topics.length > 1 ? `${i + 1}` : ''}「{t.title}」の紹介文（1〜2文）
                    </label>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setEditingCardId(t.id)}
                        className="flex items-center gap-1 px-3 py-1 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                        title="日時・場所・記事リンク・由来PDFなど、予定カードの全項目を編集します（予定タブと同じ画面）"
                      >
                        <Pencil size={12} /> この予定を編集
                      </button>
                      {hasGeminiEventAccess() && (
                        <button
                          onClick={() => generateDescription(t)}
                          disabled={generatingDesc !== null || savingDesc === t.id}
                          className="flex items-center gap-1 px-3 py-1 text-xs font-bold text-amber-800 bg-amber-100 border border-amber-300 rounded-lg hover:bg-amber-200 transition disabled:opacity-40"
                          title={`AI（Gemini 無料枠）が${t.source_pdf_url ? 'チラシPDF' : t.linked_article_id ? 'リンク記事' : 'タイトルと情報'}から1〜2文の紹介文を作ります。読んで直してから保存してください`}
                        >
                          {generatingDesc === t.id ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                          {generatingDesc === t.id ? '作っています…' : 'AIで紹介文を作る'}
                        </button>
                      )}
                      <button
                        onClick={() => saveDescription(t)}
                        disabled={savingDesc === t.id || !dirty}
                        className="flex items-center gap-1 px-3 py-1 text-xs font-bold text-white bg-slate-700 rounded-lg hover:bg-slate-800 transition disabled:opacity-40"
                      >
                        {savingDesc === t.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                        {savingDesc === t.id ? '保存しています…' : '紹介文を保存'}
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={draft}
                    onChange={(e) => setDescDrafts((prev) => ({ ...prev, [t.id]: e.target.value }))}
                    rows={2}
                    placeholder="例: 地元の作品展示と演奏会。お茶を飲みながら気軽に楽しめます。"
                    className="w-full text-sm border border-slate-300 rounded-lg px-2 py-1.5 resize-none leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    {t.description
                      ? '保存すると予定カードにも残り、次回以降もこの紹介文が使われます。'
                      : 'まだ紹介文がありません。ここで入力（または「AIで紹介文を作る」）して保存すると、カードに載ります（予定カードにも保存されます）。'}{' '}
                    {hasGeminiEventAccess() && 'AIの文は必ず読んで直してから保存してください。'} {draft.length} 文字
                  </p>

                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {/* リンク先（チラシPDF／記事。予定ページはカードと同じ情報しか無いので使わない） */}
                    <div className="text-xs">
                      <p className="font-bold text-slate-600 mb-1">「詳しく見る」のリンク先</p>
                      <div className="flex flex-wrap gap-2">
                        {/* 2種類を常に並べ、この予定に無いものはグレーアウト（押せない） */}
                        {LINK_KINDS.map((k) => {
                          const available = kinds.includes(k);
                          const on = currentKind === k;
                          return (
                            <label
                              key={k}
                              className={`flex items-center gap-1 px-2 py-1 rounded-full border ${
                                !available
                                  ? 'bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed line-through'
                                  : on
                                    ? 'bg-slate-700 text-white border-slate-700 cursor-pointer'
                                    : 'bg-white text-slate-600 border-slate-300 cursor-pointer hover:border-slate-400'
                              }`}
                              title={!available ? (k === 'pdf' ? 'この予定にはチラシPDFがありません' : 'この予定にはリンク記事がありません') : ''}
                            >
                              <input type="radio" name={`link-${t.id}`} className="hidden" disabled={!available} checked={on} onChange={() => available && setLinkKinds((prev) => ({ ...prev, [t.id]: k }))} />
                              {LINK_KIND_LABEL[k]}
                            </label>
                          );
                        })}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        {kinds.length === 0
                          ? 'この予定にはチラシも記事も無いので、「詳しく見る」ボタンは付きません。カードの文字だけで伝わるよう紹介文を書いてください。'
                          : `カードのボタン・画像のタップ先に使います。グレーはこの予定に無いもの。${kinds.length === 2 ? '指定しなければ チラシPDF → 記事 の順です。' : ''}`}
                      </p>
                    </div>

                    {/* カード画像の切り出し（チラシPDF or 記事の写真。拡大縮小＋ドラッグで位置決め） */}
                    <div className="text-xs">
                      <p className="font-bold text-slate-600 mb-1">
                        カードに載せる画像の切り出し
                        {imgSrc && (
                          <span className="ml-2 font-normal text-slate-400">
                            {imgSrc.kind === 'photo' ? '（記事の写真）' : imgSrc.fallback ? '（出典号の先頭PDF・代用）' : '（チラシPDFの1ページ目）'}
                          </span>
                        )}
                      </p>
                      {flyerStates[t.id] === 'loading' ? (
                        <p className="text-slate-400 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> 画像を読み込み中...</p>
                      ) : !flyer ? (
                        imgSrc ? (
                          <div className="text-slate-500 space-y-1">
                            <p>
                              画像を読み込めませんでした。{' '}
                              <button onClick={() => retryFlyer(t.id)} className="text-blue-600 hover:underline font-bold">
                                もう一度読み込む
                              </button>
                            </p>
                            {flyerErrors[t.id] && <p className="text-[11px] text-slate-400 break-all">理由: {flyerErrors[t.id]}</p>}
                            <p className="text-[11px] text-slate-400">PCのメモリが足りないときやPDFが大きいときに起きることがあります。それでも駄目なら、画像なしのカードで送れます。</p>
                          </div>
                        ) : (
                          <p className="text-slate-400">この予定にはチラシPDFも記事の写真も無いので、カードは文字だけになります。</p>
                        )
                      ) : (
                        <div>
                          <CropEditor source={flyer} value={curCrop} onChange={(c) => setCrops((prev) => ({ ...prev, [t.id]: c }))} />
                          <button
                            onClick={() => saveCrop(t)}
                            disabled={savingCrop === t.id || !cropDirty}
                            className="mt-1.5 px-2 py-1 text-[11px] font-bold text-white bg-slate-700 rounded-lg hover:bg-slate-800 disabled:opacity-40"
                          >
                            {savingCrop === t.id ? '保存しています…' : '切り出しを保存（次回も同じ）'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* LINE に送る（Flex カルーセル） */}
      {!loading && (
        <div className="bg-white p-6 rounded-2xl shadow border border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <MessageCircle size={18} className="text-emerald-600" />
                LINE に送る（カード形式）
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                短いテキスト → ⭐一押しカード → カード一覧（今週の予定／申込受付中／レポート）の3つの吹き出しを1回の配信（1通）で送ります。まず「テスト送信」で自分のLINEに届く見た目を確認してから「全員に配信」してください。
              </p>
            </div>
          </div>

          {alreadySentThisWeek && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
              ⚠ この配信日（{md(baseDate)}）はすでに全員配信済みです（{new Date(alreadySentThisWeek.sent_at).toLocaleString('ja-JP')}）。二重配信に注意してください。
            </p>
          )}

          {pendingThisWeek && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
              ⏰ この配信日（{md(baseDate)}）は {fmtDateTime(pendingThisWeek.send_at)} に全員配信を予約しています。
            </p>
          )}

          <div className="grid gap-4 lg:grid-cols-2 mt-4">
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-500">テキスト（吹き出し①・編集できます）</label>
                  <button
                    onClick={() => {
                      setGreetingEdited(false);
                      setGreeting(buildGreetingText(digest));
                    }}
                    className={`text-[11px] hover:text-slate-800 ${greetingEdited ? 'text-amber-700 font-bold' : 'text-slate-500'}`}
                    title="自動生成の文に戻す（手で直した内容は消えます）"
                  >
                    {greetingEdited ? '手で直した文（作り直す）' : '作り直す'}
                  </button>
                </div>
                <textarea
                  value={greeting}
                  onChange={(e) => {
                    setGreeting(e.target.value);
                    setGreetingEdited(true);
                  }}
                  rows={4}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => send('validate')}
                  disabled={sending !== null}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 transition disabled:opacity-50"
                  title="送らずに LINE 側で形式だけチェックします"
                >
                  {sending === 'validate' ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} 形式チェック
                </button>
                <button
                  onClick={copyFlexJson}
                  disabled={sending !== null}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 transition disabled:opacity-50"
                  title="LINE Developers の Flex Message Simulator に貼って本物の見た目を確認できます"
                >
                  <Copy size={14} /> Flex JSON をコピー
                </button>
                <button
                  onClick={() => send('test')}
                  disabled={sending !== null}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition disabled:opacity-50"
                  title="自分のLINE（LINE_TEST_USER_ID）にだけ送ります"
                >
                  {sending === 'test' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} テスト送信（自分に）
                </button>
                <button
                  onClick={() => send('admins')}
                  disabled={sending !== null}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 rounded-lg hover:bg-emerald-100 transition disabled:opacity-50"
                  title="管理者（Supabase の Secrets の LINE_ADMIN_USER_IDS。リッチメニューの「管理者だけに反映」と同じ人）にだけ送ります。人数ぶん通数を使います"
                >
                  {sending === 'admins' ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />} 管理者に送る（確認用）
                </button>
                <button
                  onClick={() => send('broadcast')}
                  disabled={sending !== null}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 transition disabled:opacity-50"
                  title="公式LINEの友だち全員に配信します（確認あり）"
                >
                  {sending === 'broadcast' ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />} 全員に配信
                </button>
              </div>
              {/* 予約配信（予約した時点の内容で、指定の日時に全員へ。pg_cron が5分ごとに送る） */}
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <Clock size={14} className="text-amber-700" /> 日時を指定して全員に配信
                  </span>
                  <input
                    type="datetime-local"
                    value={scheduleAt}
                    onChange={(e) => setScheduleAt(e.target.value)}
                    step={300}
                    className="text-xs border border-slate-300 rounded-lg px-2 py-1 bg-white"
                  />
                  <button
                    onClick={schedule}
                    disabled={scheduling || sending !== null}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition disabled:opacity-50"
                    title="いまの内容（画像も）で予約します。指定の時刻から5分以内に送られます"
                  >
                    {scheduling ? <Loader2 size={14} className="animate-spin" /> : <Clock size={14} />} この内容で予約
                  </button>
                </div>
                {schedules.filter((s) => s.status !== 'canceled').length > 0 && (
                  <ul className="text-[11px] text-slate-600 space-y-1">
                    {schedules
                      .filter((s) => s.status !== 'canceled')
                      .map((s) => {
                        const st = SCHEDULE_STATUS_LABEL[s.status];
                        const changed = s.status === 'scheduled' && s.base_date === baseDate && s.content_key !== contentKey;
                        return (
                          <li key={s.id} className="flex flex-wrap items-center gap-1.5">
                            <span className={`px-1.5 py-0.5 rounded font-bold ${st.cls}`}>{st.label}</span>
                            <span>
                              {fmtDateTime(s.send_at)} に送信（配信日 {md(s.base_date)}）
                            </span>
                            {s.status === 'scheduled' && (
                              <button onClick={() => cancelSchedule(s)} className="text-slate-400 hover:text-red-600 underline">
                                取り消す
                              </button>
                            )}
                            {changed && <span className="text-amber-700 font-bold">⚠ 予約後に画面の内容が変わっています（送られるのは予約した時点の内容）</span>}
                            {s.status === 'failed' && s.error && <span className="text-red-600 break-all">理由: {s.error}</span>}
                          </li>
                        );
                      })}
                  </ul>
                )}
              </div>
              {sendNote && <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 whitespace-pre-wrap">{sendNote}</p>}
              {/* 今月の通数（LINE から取得。API で送った分も含む。LINE公式アカウントの管理画面の配信一覧には API 分は出ない） */}
              {quota && (
                <p
                  className={`text-xs font-bold rounded-lg px-3 py-1.5 border ${
                    quota.limit != null && quota.limit - quota.used < 50 ? 'text-red-700 bg-red-50 border-red-200' : 'text-slate-700 bg-slate-50 border-slate-200'
                  }`}
                >
                  📨 今月の通数:{' '}
                  {quota.limit != null
                    ? `残り ${Math.max(0, quota.limit - quota.used)} 通（上限 ${quota.limit} 通のうち ${quota.used} 通使用）`
                    : `${quota.used} 通使用（上限なし）`}
                </p>
              )}
              <p className="text-[11px] text-slate-400">
                テスト送信と全員配信は、送るたびに公式LINEの通数（無料枠は月200通）を使います。全員配信は「友だちの人数」ぶん減ります。テスト送信は1通です。チラシ画像は送信時に自動でアップロードされます。
              </p>

              {history.length > 0 && (
                <div className="pt-1">
                  <p className="text-xs font-bold text-slate-500 mb-1">配信履歴</p>
                  <ul className="text-[11px] text-slate-500 space-y-0.5">
                    {history.map((h) => (
                      <li key={h.id}>
                        {new Date(h.sent_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}{' '}
                        <span className={`px-1.5 py-0.5 rounded font-bold ${h.mode === 'broadcast' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                          {h.mode === 'broadcast' ? '全員配信' : h.mode === 'admins' ? '管理者' : 'テスト'}
                        </span>{' '}
                        配信日 {h.base_date}
                        {h.line_status && h.line_status >= 300 ? ` （LINE ${h.line_status}）` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">見た目のプレビュー（実際の描画はテスト送信で確認）</label>
              <FlexPreview digest={digest} greeting={greeting} flyerSrcs={flyerSrcs} flyerAspects={flyerAspects} linkKinds={linkKinds} />
            </div>
          </div>
        </div>
      )}

      <div className="bg-white p-5 rounded-2xl shadow border border-slate-200 text-xs text-slate-500 space-y-1">
        <p className="font-bold text-slate-600">組み立てのルール</p>
        <p>・⭐一押し: 配信候補（⭐）のうち開催が近いもの1件。紹介文（1〜2文）と、チラシPDF→記事→予定ページの順でいちばん直接的なURLを添えます ／ 📰レポート: 直近14日に公開したもの最大2件</p>
        <p>・📅今週の予定: 要予約以外で配信日から7日間、最大6件 ／ 📝申込受付中: 要予約で締切が14日以内、締切順に最大4件</p>
        <p>・⏰締切間近: 締切が配信日から7日以内（今週締切）。締切が未入力の要予約は「開催7日前」を仮締切にして「頃」を付けます（抽出ダイアログの「締切」欄で入力できます）</p>
        <p>・対象者・参加費は ⭐一押し と 📝申込受付中／⏰締切間近 の行にだけ「（65歳以上・無料）」の形で添えます（📅今週の予定には付けません）</p>
        <p>・件数の上限を超えた分は載りません。載せたいものは ⭐一押しに選ぶと必ず載ります</p>
      </div>
    </div>
  );
};
