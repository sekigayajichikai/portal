/**
 * 予定カードの編集ダイアログ（予定タブ・号の画面・週次配信の3か所から同じものを開く）
 *
 * 以前は号の画面のインライン編集（日付・時間・題名・場所・紹介文・配信除外）と、
 * 週次配信の一押し枠（紹介文・切り出し・今後も載せない）に編集機能が分かれていた。
 * ここに集約し、号をまたぐ記事リンク（ArticleLinkPicker）もここで選ぶ。
 * 号の移動はできない（第1段）。仕様: docs/予定管理-設計.md
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  getAdminEventCardById,
  updateEventCard,
  deleteEventCard,
  removeCalendarEventByCard,
  getOrganizersSafe,
  addOrganizer,
  resolveOrganizerName,
  getVenuesSafe,
  resolveVenueName,
  getArticleById,
  convertPdfUrlToBase64,
  generateEventDescriptionWithGemini,
  hasGeminiEventAccess,
  type AdminEventCard,
  type EventCard,
  type Venue,
  type Organizer,
} from '@cc-saas/shared';
import { Loader2, X, Trash2, Sparkles, Calendar } from 'lucide-react';
import { showError, showToast, appConfirm } from '@/components/ui/feedback';
import { OrganizerSelect, CATEGORY_KEYS, CATEGORY_META, KIND_KEYS, KIND_META } from './EventCandidateDialog';
import { ArticleLinkPicker } from './ArticleLinkPicker';
import { CropEditor } from './CropEditor';
import { type HeroCrop, normalizeCrop, resolveCrop, loadImageCanvas, renderPdfFirstPage } from './heroCrop';
import { inspectPdf, type PdfInfo } from './pdfInspect';
import { PdfPagePeek } from './PdfPagePeek';
import { topicImageSource } from './weeklyDigestCore';

interface EventCardEditDialogProps {
  cardId: string;
  onClose: () => void;
  /** 保存・削除のあと（呼び出し元で一覧を読み直す） */
  onChanged: () => void;
}

/** ダイアログで編集する項目（文字列は空欄＝null として保存） */
interface Form {
  title: string;
  event_date: string;
  event_time: string;
  event_location: string;
  organizer: string | null;
  category: EventCard['category'];
  kind: EventCard['kind'];
  weekly_topic: boolean;
  topic_reason: string;
  apply_deadline: string;
  target_audience: string;
  fee: string;
  description: string;
  digest_exclude: boolean;
  linked_article_id: string | null;
  source_pdf_url: string | null;
}

function toForm(c: AdminEventCard): Form {
  return {
    title: c.title,
    event_date: c.event_date ?? '',
    event_time: c.event_time ?? '',
    event_location: c.event_location ?? '',
    organizer: c.organizer ?? null,
    category: c.category ?? null,
    kind: c.kind ?? null,
    weekly_topic: !!c.weekly_topic,
    topic_reason: c.topic_reason ?? '',
    apply_deadline: c.apply_deadline ?? '',
    target_audience: c.target_audience ?? '',
    fee: c.fee ?? '',
    description: c.description ?? '',
    digest_exclude: !!c.digest_exclude,
    linked_article_id: c.linked_article_id,
    source_pdf_url: c.source_pdf_url ?? null,
  };
}

/** フォームを保存用の値にする（空欄は null） */
function toValues(f: Form): Partial<EventCard> {
  const s = (v: string) => v.trim() || null;
  return {
    title: f.title.trim(),
    event_date: f.event_date || null,
    event_time: s(f.event_time),
    event_location: s(f.event_location),
    organizer: f.organizer,
    category: f.category,
    kind: f.kind,
    weekly_topic: f.weekly_topic,
    topic_reason: s(f.topic_reason),
    apply_deadline: f.apply_deadline || null,
    target_audience: s(f.target_audience),
    fee: s(f.fee),
    description: s(f.description),
    digest_exclude: f.digest_exclude,
    linked_article_id: f.linked_article_id,
    source_pdf_url: f.source_pdf_url,
  };
}

const STATUS_LABEL: Record<string, string> = { draft: '下書き', published: '公開中', archived: '旧版' };

const inputCls = 'text-sm border border-slate-300 rounded px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-primary-400/40';
const labelCls = 'text-[11px] font-bold text-slate-500 mb-0.5 block';

export const EventCardEditDialog: React.FC<EventCardEditDialogProps> = ({ cardId, onClose, onChanged }) => {
  const [card, setCard] = useState<AdminEventCard | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [orgs, setOrgs] = useState<Organizer[]>([]);
  const [orgOptions, setOrgOptions] = useState<string[]>([]);
  const [pickingArticle, setPickingArticle] = useState(false);
  /** 記事を選び直したときの表示用（題名・号名）。保存前の表示にだけ使う */
  const [pickedArticle, setPickedArticle] = useState<{ title: string; newsletter_title: string | null } | null>(null);
  const [generatingDesc, setGeneratingDesc] = useState(false);
  /** 画像の切り出し: 元画像（押したときだけ読み込む。PDFの描画は重いので開いた瞬間には読まない） */
  const [cropSource, setCropSource] = useState<HTMLCanvasElement | null>(null);
  const [cropState, setCropState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [crop, setCrop] = useState<HeroCrop | null>(null);
  /** 由来PDFの中身（スキャン画像なら「元のページと見比べる」を出す） */
  const [pdfInfo, setPdfInfo] = useState<PdfInfo | null>(null);

  useEffect(() => {
    getAdminEventCardById(cardId)
      .then((c) => {
        if (!c) {
          setLoadError('この予定は見つかりませんでした（削除された可能性があります）。');
          return;
        }
        setCard(c);
        setForm(toForm(c));
      })
      .catch((e) => {
        console.error('予定の読み込みエラー:', e);
        setLoadError('予定を読み込めませんでした。');
      });
    getVenuesSafe().then(setVenues);
    getOrganizersSafe().then((os) => {
      setOrgs(os);
      setOrgOptions(os.filter((o) => o.use_as_organizer).map((o) => o.name));
    });
  }, [cardId]);

  // 由来PDFがスキャン画像かを調べる（ブラウザ内の pdf.js。AIは呼ばない）
  const sourcePdfUrl = form?.source_pdf_url ?? null;
  useEffect(() => {
    setPdfInfo(null);
    if (!sourcePdfUrl) return;
    let cancelled = false;
    inspectPdf(sourcePdfUrl)
      .then((info) => {
        if (!cancelled) setPdfInfo(info);
      })
      .catch((e) => console.warn('由来PDFの中身を調べられませんでした:', e));
    return () => {
      cancelled = true;
    };
  }, [sourcePdfUrl]);

  // Esc で閉じる（記事の選択中はそちらを閉じる）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (pickingArticle) setPickingArticle(false);
      else onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pickingArticle, onClose]);

  const set = (patch: Partial<Form>) => setForm((f) => (f ? { ...f, ...patch } : f));

  /** 変更された項目だけ（保存ボタンの有効化と更新内容に使う） */
  const changes = useMemo(() => {
    if (!card || !form) return {};
    const before = toValues(toForm(card));
    const after = toValues(form);
    const u: Partial<EventCard> = {};
    for (const k of Object.keys(after) as Array<keyof EventCard>) {
      if ((after as any)[k] !== (before as any)[k]) (u as any)[k] = (after as any)[k];
    }
    return u;
  }, [card, form]);

  const savedCrop = card ? normalizeCrop(card.hero_crop, card.hero_crop_y) : null;
  const cropDirty =
    !!crop && !!savedCrop && (crop.x !== savedCrop.x || crop.y !== savedCrop.y || crop.scale !== savedCrop.scale || (crop.aspect ?? null) !== (savedCrop.aspect ?? null));
  const dirty = Object.keys(changes).length > 0 || cropDirty;

  const close = async () => {
    if (dirty && !(await appConfirm({ title: '保存していない変更があります。閉じますか？', confirmLabel: '保存せずに閉じる', danger: true }))) return;
    onClose();
  };

  const save = async () => {
    if (!card || !form || !form.title.trim()) return;
    setSaving(true);
    try {
      const updates: Partial<EventCard> = { ...changes };
      if ('event_location' in updates) {
        updates.event_location = resolveVenueName(updates.event_location ?? null, venues);
      }
      if ('organizer' in updates) {
        updates.organizer = resolveOrganizerName(updates.organizer ?? null, orgs);
      }
      if (cropDirty && crop && cropSource) {
        const c = resolveCrop(crop, cropSource.width, cropSource.height);
        updates.hero_crop = c;
        updates.hero_crop_y = c.y;
      }
      const saved = await updateEventCard(card.id, updates);
      // 未追加の列は updateEventCard が黙って外すので、返ってきた行に列が無ければ知らせる
      const dropped = (Object.keys(updates) as string[]).filter((k) => !(k in saved));
      if (dropped.length > 0) {
        showError(`次の項目は保存されませんでした（DBに列がありません。sql/migrations を確認してください）: ${dropped.join(', ')}`);
      } else {
        showToast('予定を保存しました');
      }
      onChanged();
      onClose();
    } catch (e) {
      console.error('予定の保存エラー:', e);
      showError('保存できませんでした。時間をおいてもう一度お試しください。');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!card) return;
    if (!(await appConfirm({ title: `「${card.title}」を削除しますか？`, message: 'カレンダー・週次配信からも消えます。間違えたときは「ゴミ箱」から元に戻せます。', confirmLabel: '削除する', danger: true }))) return;
    try {
      await deleteEventCard(card.id);
      // カレンダーに載せていた場合は、そちらからも消す
      await removeCalendarEventByCard(card.id).catch((e) => console.warn('カレンダーからの削除に失敗:', e));
      showToast('予定を削除しました');
      onChanged();
      onClose();
    } catch (e) {
      console.error('予定の削除エラー:', e);
      showError('削除できませんでした。');
    }
  };

  const handleCreateOrganizer = async (name: string) => {
    try {
      const created = await addOrganizer(name);
      setOrgs((prev) => (prev.some((o) => o.name === name) ? prev : [...prev, created]));
    } catch {
      // 既に存在／マスタ未作成でも選択は通す
    }
    setOrgOptions((prev) => (prev.includes(name) ? prev : [...prev, name]));
  };

  /** 紹介文を AI（Gemini・無料枠）で作って欄に入れる（保存はしない）。手がかりは チラシPDF ＞ リンク記事の本文 */
  const generateDescription = async () => {
    if (!card || !form) return;
    setGeneratingDesc(true);
    try {
      let articleText: string | null = null;
      if (form.linked_article_id) {
        try {
          const a = await getArticleById(form.linked_article_id);
          articleText = a?.content || a?.summary || null;
        } catch (e) {
          console.warn('記事本文の取得に失敗（紹介文はタイトル等から作る）:', e);
        }
      }
      let pdfBase64: string | null = null;
      if (form.source_pdf_url) {
        try {
          pdfBase64 = await convertPdfUrlToBase64(form.source_pdf_url);
        } catch (e) {
          console.warn('チラシPDFの取得に失敗（紹介文は記事・タイトルから作る）:', e);
        }
      }
      const description = await generateEventDescriptionWithGemini({
        title: form.title,
        eventDate: form.event_date,
        eventTime: form.event_time || null,
        location: form.event_location || null,
        organizer: form.organizer,
        targetAudience: form.target_audience || null,
        fee: form.fee || null,
        articleText,
        pdfBase64,
      });
      set({ description });
      showToast('紹介文を作りました。読んで直してから保存してください');
    } catch (e) {
      console.error('紹介文の生成エラー:', e);
      const msg = e instanceof Error ? e.message : String(e);
      showError(/429|RESOURCE_EXHAUSTED|quota/i.test(msg) ? 'AIの無料枠の回数制限にかかりました。1分ほど待ってからもう一度押してください。' : `紹介文を作れませんでした。${msg}`);
    } finally {
      setGeneratingDesc(false);
    }
  };

  /** 切り出しの元画像（保存済みの由来PDF・記事の写真・号の先頭PDFの順。週次配信と同じ） */
  const imgSrc = card ? topicImageSource(card) : null;
  const loadCropSource = async () => {
    if (!imgSrc || !card) return;
    setCropState('loading');
    try {
      const canvas = await (imgSrc.kind === 'pdf' ? renderPdfFirstPage(imgSrc.url) : loadImageCanvas(imgSrc.url));
      setCropSource(canvas);
      setCrop(normalizeCrop(card.hero_crop, card.hero_crop_y));
      setCropState('idle');
    } catch (e) {
      console.error('切り出し画像の読み込みエラー:', e);
      setCropState('error');
    }
  };

  const linkedTitle = pickedArticle?.title ?? (form?.linked_article_id === card?.linked_article_id ? card?.linked_article?.title : null);
  const linkedNewsletter =
    pickedArticle?.newsletter_title ?? (form?.linked_article_id === card?.linked_article_id ? card?.linked_article_newsletter_title : null);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <datalist id="venue-options-edit">
        {venues.map((v) => (
          <option key={v.id} value={v.name} />
        ))}
      </datalist>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <Calendar size={18} className="text-primary-600" />
            予定の編集
            {card && (
              <span className="text-xs font-normal text-slate-500">
                {card.newsletter_title ?? '号不明'}
                {card.newsletter_status && card.newsletter_status !== 'published' && (
                  <span className="ml-1 px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">{STATUS_LABEL[card.newsletter_status] ?? card.newsletter_status}</span>
                )}
              </span>
            )}
          </h2>
          <button onClick={close} className="p-1 text-slate-400 hover:text-slate-600" title="閉じる">
            <X size={18} />
          </button>
        </div>

        {loadError ? (
          <p className="p-6 text-sm text-red-600">{loadError}</p>
        ) : !card || !form ? (
          <p className="p-6 text-sm text-slate-400 flex items-center gap-2">
            <Loader2 size={16} className="animate-spin" /> 読み込み中...
          </p>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div>
              <label className={labelCls}>題名</label>
              <input type="text" value={form.title} onChange={(e) => set({ title: e.target.value })} className={`${inputCls} font-medium`} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>日付</label>
                <input type="date" value={form.event_date} onChange={(e) => set({ event_date: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>時間</label>
                <input type="text" value={form.event_time} placeholder="例: 10:00-12:00" onChange={(e) => set({ event_time: e.target.value })} className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>場所（会場マスタの正式名に寄せます）</label>
                <input
                  type="text"
                  list="venue-options-edit"
                  value={form.event_location}
                  placeholder="例: 自治会館"
                  onChange={(e) => set({ event_location: e.target.value })}
                  onBlur={(e) => set({ event_location: resolveVenueName(e.target.value, venues) ?? '' })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>主催</label>
                <OrganizerSelect value={form.organizer} options={orgOptions} onChange={(v) => set({ organizer: v })} onCreate={handleCreateOrganizer} />
              </div>
            </div>

            <div>
              <label className={labelCls}>種別・性質</label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {CATEGORY_KEYS.map((cat) => {
                  const active = form.category === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => set({ category: active ? null : cat })}
                      className={`text-xs px-2 py-0.5 rounded font-medium border transition ${active ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-400'}`}
                    >
                      {CATEGORY_META[cat].icon} {CATEGORY_META[cat].label}
                    </button>
                  );
                })}
                <span className="text-slate-300 text-xs">|</span>
                {KIND_KEYS.map((k) => {
                  const active = form.kind === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => set({ kind: active ? null : k })}
                      className={`text-xs px-2 py-0.5 rounded font-medium border transition ${active ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-400'}`}
                      title={KIND_META[k].title}
                    >
                      {KIND_META[k].icon} {KIND_META[k].label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={labelCls}>申込締切</label>
                <input type="date" value={form.apply_deadline} onChange={(e) => set({ apply_deadline: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>対象</label>
                <input type="text" value={form.target_audience} placeholder="例: 65歳以上" onChange={(e) => set({ target_audience: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>費用</label>
                <input type="text" value={form.fee} placeholder="例: 無料" onChange={(e) => set({ fee: e.target.value })} className={inputCls} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-0.5">
                <label className={labelCls}>紹介文（1〜2文。週次配信の⭐一押しと予定ページに表示）</label>
                {hasGeminiEventAccess() && (
                  <button
                    type="button"
                    onClick={generateDescription}
                    disabled={generatingDesc}
                    className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold text-amber-800 bg-amber-100 border border-amber-300 rounded hover:bg-amber-200 disabled:opacity-40"
                  >
                    {generatingDesc ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                    {generatingDesc ? '作っています…' : 'AIで紹介文を作る'}
                  </button>
                )}
              </div>
              <textarea
                value={form.description}
                rows={2}
                placeholder="例: 地元の作品展示と演奏会。お茶を飲みながら気軽に楽しめます。"
                onChange={(e) => set({ description: e.target.value })}
                className={`${inputCls} resize-none leading-relaxed`}
              />
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none">
                <input type="checkbox" checked={form.weekly_topic} onChange={(e) => set({ weekly_topic: e.target.checked })} />
                ⭐ 週次配信の一押し候補
              </label>
              {form.weekly_topic && (
                <input
                  type="text"
                  value={form.topic_reason}
                  placeholder="根拠（例: 単独チラシ）"
                  onChange={(e) => set({ topic_reason: e.target.value })}
                  className="text-xs border border-slate-300 rounded px-2 py-0.5 w-48"
                />
              )}
              <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none" title="週次LINE配信（今週のお知らせ）に載りません。カレンダーには載ります">
                <input type="checkbox" checked={form.digest_exclude} onChange={(e) => set({ digest_exclude: e.target.checked })} />
                🚫 週次配信に載せない（役員向け会議など）
              </label>
            </div>

            {/* 記事リンク（号をまたいで選べる） */}
            <div>
              <label className={labelCls}>記事リンク（読者側の「詳しく読む」）</label>
              {form.linked_article_id ? (
                <div className="flex items-center gap-2 text-sm">
                  <span className="truncate text-primary-700">🔗 {linkedTitle ?? '（記事）'}</span>
                  {linkedNewsletter && <span className="shrink-0 text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{linkedNewsletter}</span>}
                  <button type="button" onClick={() => setPickingArticle(true)} className="shrink-0 text-xs text-slate-500 hover:text-primary-700">
                    選び直す
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      set({ linked_article_id: null });
                      setPickedArticle(null);
                    }}
                    className="shrink-0 text-xs text-slate-400 hover:text-red-500"
                  >
                    解除
                  </button>
                </div>
              ) : (
                !pickingArticle && (
                  <button type="button" onClick={() => setPickingArticle(true)} className="text-xs text-amber-600 hover:text-amber-800">
                    ＋ 記事を選ぶ（公開中の全号から）
                  </button>
                )
              )}
              {pickingArticle && (
                <div className="mt-1.5">
                  <ArticleLinkPicker
                    newsletterId={card.newsletter_id}
                    value={form.linked_article_id}
                    onChange={(a) => {
                      set({ linked_article_id: a?.id ?? null });
                      setPickedArticle(a ? { title: a.title, newsletter_title: a.newsletter_id === card.newsletter_id ? null : a.newsletter_title } : null);
                      setPickingArticle(false);
                    }}
                    onClose={() => setPickingArticle(false)}
                  />
                </div>
              )}
            </div>

            {/* 由来PDF（号のPDFから選ぶ） */}
            <div>
              <label className={labelCls}>由来PDF（チラシ。週次配信の画像とリンク先に使います）</label>
              <select
                value={form.source_pdf_url ?? ''}
                onChange={(e) => set({ source_pdf_url: e.target.value || null })}
                className={inputCls}
                disabled={card.newsletter_pdfs.length === 0 && !form.source_pdf_url}
              >
                <option value="">（なし）</option>
                {card.newsletter_pdfs.map((p) => (
                  <option key={p.url} value={p.url}>
                    {p.label}
                  </option>
                ))}
                {form.source_pdf_url && !card.newsletter_pdfs.some((p) => p.url === form.source_pdf_url) && (
                  <option value={form.source_pdf_url}>（号の一覧に無いPDF）</option>
                )}
              </select>
              {/* スキャン画像のPDFは日付を読み違えていることがあるので、元のページを開いて見比べられるようにする */}
              {form.source_pdf_url && pdfInfo?.isScan && (
                <div className="mt-1.5">
                  <p className="text-[11px] text-amber-800 mb-1">
                    ⚠ このPDFは文字データのない<strong>スキャン画像</strong>です。AIが目で見て読むため、日付や行事名を取り違えていることがあります。
                  </p>
                  <PdfPagePeek
                    url={form.source_pdf_url}
                    label={card.newsletter_pdfs.find((p) => p.url === form.source_pdf_url)?.label ?? '由来PDF'}
                    pages={pdfInfo.pages}
                  />
                </div>
              )}
            </div>

            {/* 画像の切り出し（週次配信の一押しカード用） */}
            <div>
              <label className={labelCls}>
                週次配信カードの画像の切り出し
                {imgSrc && (
                  <span className="ml-1 font-normal text-slate-400">
                    {imgSrc.kind === 'photo' ? '（記事の写真）' : imgSrc.fallback ? '（号の先頭PDF・代用）' : '（チラシPDFの1ページ目）'}
                  </span>
                )}
              </label>
              {!imgSrc ? (
                <p className="text-xs text-slate-400">チラシPDFも記事の写真も無いので、カードは文字だけになります。</p>
              ) : cropSource && crop ? (
                <CropEditor source={cropSource} value={crop} onChange={setCrop} />
              ) : (
                <div className="text-xs text-slate-500">
                  <button
                    type="button"
                    onClick={loadCropSource}
                    disabled={cropState === 'loading'}
                    className="px-2 py-1 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40 flex items-center gap-1"
                  >
                    {cropState === 'loading' && <Loader2 size={12} className="animate-spin" />}
                    {cropState === 'loading' ? '画像を読み込み中…' : '画像を読み込んで切り出しを調整'}
                  </button>
                  {cropState === 'error' && <p className="mt-1 text-red-600">画像を読み込めませんでした。もう一度押してください。</p>}
                  {(form.source_pdf_url ?? null) !== (card.source_pdf_url ?? null) && (
                    <p className="mt-1 text-slate-400">由来PDFを変えた場合は、保存してから開き直すと新しいPDFで切り出せます。</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 p-4 border-t border-slate-200">
          <button
            onClick={remove}
            disabled={!card}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-40"
          >
            <Trash2 size={14} /> 削除
          </button>
          <div className="flex gap-2">
            <button onClick={close} className="px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
              キャンセル
            </button>
            <button
              onClick={save}
              disabled={!form || saving || !dirty || !form.title.trim()}
              className="flex items-center gap-1 px-4 py-1.5 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-40"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? '保存しています…' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
