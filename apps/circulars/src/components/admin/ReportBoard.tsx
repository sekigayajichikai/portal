/**
 * 関ヶ谷レポート 管理画面
 *
 * 「関ヶ谷レポート」枠（常設 newsletter）にぶら下がるレポート記事を
 * 一覧・新規作成・編集・削除する。回覧板（CircularBoard）の PDF 抽出フローとは独立。
 *
 * - 一覧: 枠内の記事をイベント日の新しい順に表示（ピン留めは先頭）
 * - 編集: Markdown 本文＋写真アップロードを、公開時と同じレンダラー（EventReportView）で
 *         横に並べてライブプレビューしながら書ける
 * - 公開状態は articles.visibility で表現する
 *     board-only   = 非公開（下書き。公開ページのレポートタブに出ない）
 *     members-only = 公開（住民ページに表示）
 *     public       = 一般公開（将来の外部公開URL用の予約値。今は members-only と同じ見え方なので
 *                    編集画面の選択肢には出さない。既存データが public の場合のみ表示して値を保つ）
 *
 * 設計メモ: docs/記事機能-設計.md
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  getNewsletters,
  getArticlesByNewsletterId,
  addArticlesToNewsletter,
  updateArticle,
  deleteArticle,
  saveNewsletter,
  publishNewsletter,
} from '@cc-saas/shared';
import type { Article, Attachment, Newsletter, Visibility } from '@cc-saas/shared';
import { uploadImage } from '@cc-saas/shared/services/data/storageService';
import {
  Plus,
  Edit3,
  Trash2,
  ArrowLeft,
  Save,
  Loader2,
  Image as ImageIcon,
  Copy,
  ExternalLink,
  Pin,
  Eye,
  EyeOff,
  Heading2,
  Bold,
  Quote,
  Link as LinkIcon,
  Newspaper,
} from 'lucide-react';
import { showToast, showError, appConfirm } from '@/components/ui/feedback';
import EventReportView from '@/components/public/EventReportView';

/** レポート枠（newsletter）のタイトル。ReportsView / MonthlyGuide と揃える */
const REPORT_NEWSLETTER_TITLE = '関ヶ谷レポート';
const REPORT_CATEGORY = 'event-report';
const REPORT_SOURCE = 'DX委員会';
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

type ReportNewsletter = Newsletter & { article_count: number };

function fmtDate(d?: string | null): string {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  if (isNaN(dt.getTime())) return d;
  return `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日（${WEEK[dt.getDay()]}）`;
}

const VISIBILITY_LABEL: Record<Visibility, { label: string; className: string }> = {
  'board-only': { label: '非公開', className: 'bg-slate-100 text-slate-500' },
  'members-only': { label: '公開中', className: 'bg-emerald-100 text-emerald-700' },
  public: { label: '一般公開', className: 'bg-blue-100 text-blue-700' },
};

/** 編集フォームの状態（Article のうち編集対象のフィールドのみ） */
interface ReportForm {
  title: string;
  headline: string;
  event_date: string;
  event_time: string;
  event_location: string;
  brief: string;
  summary: string;
  content: string;
  thumbnail_url: string | null;
  visibility: Visibility;
  is_pinned: boolean;
  attachments: Attachment[];
}

function emptyForm(): ReportForm {
  return {
    title: '',
    headline: '',
    event_date: '',
    event_time: '',
    event_location: '',
    brief: '',
    summary: '',
    content: '',
    thumbnail_url: null,
    visibility: 'board-only',
    is_pinned: false,
    attachments: [],
  };
}

function formFromArticle(a: Article): ReportForm {
  return {
    title: a.title ?? '',
    headline: a.headline ?? '',
    event_date: a.event_date ?? '',
    event_time: a.event_time ?? '',
    event_location: a.event_location ?? '',
    brief: a.brief ?? '',
    summary: a.summary ?? '',
    content: a.content ?? '',
    thumbnail_url: a.thumbnail_url ?? null,
    visibility: a.visibility ?? 'board-only',
    is_pinned: !!a.is_pinned,
    attachments: Array.isArray(a.attachments) ? a.attachments : [],
  };
}

// =====================================================
// 一覧＋編集の親コンポーネント
// =====================================================

export const ReportBoard: React.FC = () => {
  const [frame, setFrame] = useState<ReportNewsletter | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingFrame, setCreatingFrame] = useState(false);
  /** null = 一覧表示 / 'new' = 新規作成 / Article = 編集中 */
  const [editing, setEditing] = useState<'new' | Article | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const ns = await getNewsletters();
      const found = ns.find((n) => n.title === REPORT_NEWSLETTER_TITLE) ?? null;
      setFrame(found);
      if (found) {
        const data = await getArticlesByNewsletterId(found.id);
        setArticles(sortReports(data));
      } else {
        setArticles([]);
      }
    } catch (e) {
      console.error('レポート読み込みエラー:', e);
      showError('レポートを読み込めませんでした。時間をおいてもう一度お試しください。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  /** 枠（newsletter）が無い場合に作成する（SQL の 2026-09-05-sekigaya-report.sql と同じ内容） */
  const handleCreateFrame = async () => {
    setCreatingFrame(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const result = await saveNewsletter(
        {
          organization_id: import.meta.env.VITE_DEFAULT_ORGANIZATION_ID || null,
          title: REPORT_NEWSLETTER_TITLE,
          issue_date: today,
          source_pdf_url: null,
          status: 'published',
          created_by: import.meta.env.VITE_DEFAULT_USER_ID || null,
          published_at: new Date().toISOString(),
          parent_id: null,
        } as any,
        []
      );
      setFrame({ ...result.newsletter, article_count: 0 });
      showToast('「関ヶ谷レポート」の枠を作成しました。レポートを追加できます。');
    } catch (e) {
      console.error('枠作成エラー:', e);
      showError('枠を作成できませんでした。');
    } finally {
      setCreatingFrame(false);
    }
  };

  const handleDelete = async (a: Article) => {
    const ok = await appConfirm({
      title: `「${a.title}」を削除しますか？`,
      message: 'この操作は取り消せません。',
      confirmLabel: '削除する',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteArticle(a.id);
      setArticles((prev) => prev.filter((x) => x.id !== a.id));
      showToast('レポートを削除しました');
    } catch (e) {
      console.error('削除エラー:', e);
      showError('削除できませんでした。');
    }
  };

  const handleToggleVisibility = async (a: Article) => {
    const next: Visibility = a.visibility === 'board-only' ? 'members-only' : 'board-only';
    const label = next === 'board-only' ? '非公開にしますか？' : '公開しますか？';
    const ok = await appConfirm({
      title: `「${a.title}」を${label}`,
      message:
        next === 'board-only'
          ? '住民ページのレポートタブから見えなくなります。'
          : '住民ページのレポートタブに表示されます。',
      confirmLabel: next === 'board-only' ? '非公開にする' : '公開する',
    });
    if (!ok) return;
    try {
      const updated = await updateArticle(a.id, { visibility: next });
      setArticles((prev) => sortReports(prev.map((x) => (x.id === a.id ? { ...x, ...updated } : x))));
      showToast(next === 'board-only' ? '非公開にしました' : '公開しました');
    } catch (e) {
      console.error('公開状態の更新エラー:', e);
      showError('公開状態を変更できませんでした。');
    }
  };

  /** 枠が下書きだと記事を公開しても住民ページに出ないため、枠を公開状態にする */
  const handlePublishFrame = async () => {
    if (!frame) return;
    try {
      const updated = await publishNewsletter(frame.id);
      setFrame({ ...frame, ...updated });
      showToast('レポート枠を公開状態にしました。「公開」にした記事が住民ページに表示されます。');
    } catch (e) {
      console.error('枠の公開エラー:', e);
      showError('枠を公開状態にできませんでした。');
    }
  };


  // ---------- 編集画面 ----------
  if (editing && frame) {
    return (
      <ReportEditor
        frameId={frame.id}
        article={editing === 'new' ? null : editing}
        onBack={() => setEditing(null)}
        onSaved={(saved) => {
          setArticles((prev) => {
            const exists = prev.some((x) => x.id === saved.id);
            return sortReports(exists ? prev.map((x) => (x.id === saved.id ? saved : x)) : [saved, ...prev]);
          });
          // 保存後は編集を続けられるよう、編集対象を保存済み記事に差し替える
          setEditing(saved);
        }}
      />
    );
  }

  // ---------- 一覧画面 ----------
  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow border border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Newspaper size={20} className="text-[#c0392b]" />
              関ヶ谷レポート
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              まちのできごとを写真と読み物で届けるレポート。公開すると住民ページの「レポート」タブに表示されます。
            </p>
          </div>
          {frame && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => window.open('/', '_blank', 'noopener')}
                className="flex items-center gap-1.5 px-3 py-2 text-sm bg-slate-100 text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-200 transition"
                title="住民が見る公開ページ（回覧板・レポート）を別タブで開く"
              >
                <ExternalLink size={16} />
                公開ページを開く
              </button>
              <button
                onClick={() => setEditing('new')}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-[#c0392b] rounded-lg hover:bg-[#a93226] transition"
              >
                <Plus size={16} />
                新しいレポート
              </button>
            </div>
          )}
        </div>

        {frame && frame.status !== 'published' && (
          <div className="mt-3 flex flex-wrap items-center gap-3 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
            <span>
              レポート枠が下書きのため、記事を「公開」にしても住民ページには表示されません。
            </span>
            <button
              onClick={handlePublishFrame}
              className="px-3 py-1.5 text-xs font-bold text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition"
            >
              枠を公開状態にする
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-10 justify-center">
            <Loader2 size={16} className="animate-spin" /> 読み込み中...
          </div>
        ) : !frame ? (
          <div className="text-center py-10">
            <p className="text-slate-500 text-sm mb-4">
              レポートを入れる「関ヶ谷レポート」の枠がまだありません。
            </p>
            <button
              onClick={handleCreateFrame}
              disabled={creatingFrame}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-[#c0392b] rounded-lg hover:bg-[#a93226] transition disabled:opacity-50"
            >
              {creatingFrame ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              枠を作成する
            </button>
          </div>
        ) : articles.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-sm">
            まだレポートがありません。「新しいレポート」から作成してください。
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-4">
            {articles.map((a) => {
              const thumb =
                a.thumbnail_url || a.attachments?.find((x) => x.type === 'image')?.url || null;
              const vis = VISIBILITY_LABEL[a.visibility] ?? VISIBILITY_LABEL['board-only'];
              return (
                <div
                  key={a.id}
                  className="bg-white rounded-xl overflow-hidden border border-slate-200 shadow-sm flex flex-col"
                >
                  <button
                    onClick={() => setEditing(a)}
                    className="text-left aspect-[16/10] bg-slate-100 overflow-hidden relative"
                  >
                    {thumb ? (
                      <img src={thumb} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-300">
                        <ImageIcon size={32} />
                      </div>
                    )}
                    <span
                      className={`absolute top-2 left-2 text-[11px] font-bold px-2 py-0.5 rounded-full ${vis.className}`}
                    >
                      {vis.label}
                    </span>
                    {a.is_pinned && (
                      <span className="absolute top-2 right-2 bg-white/90 text-amber-600 rounded-full p-1">
                        <Pin size={12} />
                      </span>
                    )}
                  </button>
                  <div className="p-4 flex-1 flex flex-col">
                    {a.headline && (
                      <span className="text-[11px] font-bold text-[#c0392b] mb-1">{a.headline}</span>
                    )}
                    <h3 className="font-bold text-slate-800 leading-snug mb-1">{a.title}</h3>
                    {a.event_date && (
                      <p className="text-xs text-slate-400">{fmtDate(a.event_date)}</p>
                    )}
                    <div className="flex items-center gap-1 mt-3 pt-3 border-t border-slate-100">
                      <button
                        onClick={() => setEditing(a)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition"
                      >
                        <Edit3 size={14} /> 編集
                      </button>
                      <button
                        onClick={() => handleToggleVisibility(a)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition"
                      >
                        {a.visibility === 'board-only' ? (
                          <>
                            <Eye size={14} /> 公開
                          </>
                        ) : (
                          <>
                            <EyeOff size={14} /> 非公開に
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => copyReviewLink(a.id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition"
                        title="この記事をメンバーに見てもらう確認用リンクをコピー（ログイン不要・公開はしません）"
                      >
                        <Copy size={14} /> 確認リンク
                      </button>
                      <button
                        onClick={() => handleDelete(a)}
                        className="ml-auto flex items-center gap-1 px-2.5 py-1.5 text-xs text-red-500 hover:bg-red-50 rounded-lg transition"
                      >
                        <Trash2 size={14} /> 削除
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * 記事単位のメンバー確認リンクをクリップボードにコピーする。
 * /?report-review=<記事ID> はログイン不要・非公開の記事も表示（公開はしない）。
 */
async function copyReviewLink(articleId: string) {
  // ローカル開発中でも共有できるリンクになるよう、本番URLが設定されていればそちらを使う
  const base = (import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin).replace(/\/+$/, '');
  const link = `${base}/?report-review=${articleId}`;
  try {
    await navigator.clipboard.writeText(link);
    showToast('この記事のメンバー確認リンクをコピーしました。LINE等で共有できます。');
  } catch {
    window.prompt('このリンクをコピーして共有してください', link);
  }
}

function sortReports(list: Article[]): Article[] {
  return [...list].sort((a, b) => {
    if (!!a.is_pinned !== !!b.is_pinned) return a.is_pinned ? -1 : 1;
    return (
      new Date(b.event_date || b.created_at).getTime() -
      new Date(a.event_date || a.created_at).getTime()
    );
  });
}

// =====================================================
// 編集画面
// =====================================================

interface ReportEditorProps {
  frameId: string;
  /** null なら新規作成 */
  article: Article | null;
  onBack: () => void;
  onSaved: (saved: Article) => void;
}

const ReportEditor: React.FC<ReportEditorProps> = ({ frameId, article, onBack, onSaved }) => {
  const [form, setForm] = useState<ReportForm>(article ? formFromArticle(article) : emptyForm());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const bodyImageInputRef = useRef<HTMLInputElement>(null);
  const thumbInputRef = useRef<HTMLInputElement>(null);

  // 編集対象が差し替わったら（保存後など）フォームを同期。ただし未保存の変更は守る
  useEffect(() => {
    if (article && !dirty) setForm(formFromArticle(article));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article?.id, article?.updated_at]);

  const update = <K extends keyof ReportForm>(key: K, value: ReportForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  /** プレビュー用に Article 型へ組み立てる */
  const previewArticle: Article = useMemo(
    () => ({
      id: article?.id ?? 'preview',
      newsletter_id: frameId,
      organization_id: article?.organization_id ?? '',
      title: form.title || '（タイトル未入力）',
      category: REPORT_CATEGORY,
      article_type: 'official',
      priority: 'medium',
      control_date: null,
      event_date: form.event_date || null,
      event_time: form.event_time || null,
      event_location: form.event_location || null,
      headline: form.headline,
      brief: form.brief,
      summary: form.summary,
      content: form.content,
      tags: ['イベントレポート'],
      visibility: form.visibility,
      source: REPORT_SOURCE,
      attachments: form.attachments,
      thumbnail_url: form.thumbnail_url,
      display_order: null,
      is_pinned: form.is_pinned,
      created_at: article?.created_at ?? '',
      updated_at: article?.updated_at ?? '',
    }),
    [form, article, frameId]
  );

  /** テキストエリアのカーソル位置に文字列を挿入する */
  const insertAtCursor = (text: string, wrapSelection?: (sel: string) => string) => {
    const el = contentRef.current;
    const start = el?.selectionStart ?? form.content.length;
    const end = el?.selectionEnd ?? form.content.length;
    const before = form.content.slice(0, start);
    const selected = form.content.slice(start, end);
    const after = form.content.slice(end);
    const inserted = wrapSelection && selected ? wrapSelection(selected) : text;
    const next = before + inserted + after;
    update('content', next);
    // カーソルを挿入直後に戻す
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = before.length + inserted.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const insertBlock = (text: string) => {
    const el = contentRef.current;
    const start = el?.selectionStart ?? form.content.length;
    const before = form.content.slice(0, start);
    // 前が改行で終わっていなければ空行を挟む
    const prefix = before.length === 0 || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    insertAtCursor(`${prefix}${text}\n\n`);
  };

  /** 本文に写真を挿入（アップロード→Markdown画像記法をカーソル位置に挿入） */
  const handleBodyImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const newAttachments: Attachment[] = [];
      const lines: string[] = [];
      for (const file of Array.from(files)) {
        const result = await uploadImage(file);
        newAttachments.push({ type: 'image', url: result.url, label: file.name });
        lines.push(`![ここにキャプション](${result.url})`);
      }
      setForm((prev) => ({ ...prev, attachments: [...prev.attachments, ...newAttachments] }));
      insertBlock(lines.join('\n\n'));
      // 扉写真が未設定なら最初の写真を使う
      if (!form.thumbnail_url && newAttachments[0]) {
        update('thumbnail_url', newAttachments[0].url);
      }
      showToast(`写真を${newAttachments.length}枚挿入しました。「ここにキャプション」を書き換えてください。`);
    } catch (e: any) {
      console.error('写真アップロードエラー:', e);
      showError(e?.message || '写真をアップロードできませんでした。');
    } finally {
      setUploading(false);
      if (bodyImageInputRef.current) bodyImageInputRef.current.value = '';
    }
  };

  /** 扉写真（thumbnail_url）をアップロード */
  const handleThumb = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const result = await uploadImage(files[0]);
      setForm((prev) => ({
        ...prev,
        thumbnail_url: result.url,
        attachments: [...prev.attachments, { type: 'image', url: result.url, label: files[0].name }],
      }));
      setDirty(true);
      showToast('扉写真を設定しました');
    } catch (e: any) {
      console.error('扉写真アップロードエラー:', e);
      showError(e?.message || '写真をアップロードできませんでした。');
    } finally {
      setUploading(false);
      if (thumbInputRef.current) thumbInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      showError('タイトルを入力してください。');
      return;
    }
    if (!form.content.trim()) {
      showError('本文を入力してください。');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        headline: form.headline.trim(),
        brief: form.brief.trim(),
        summary: form.summary.trim(),
        content: form.content,
        event_date: form.event_date || null,
        event_time: form.event_time.trim() || null,
        event_location: form.event_location.trim() || null,
        thumbnail_url: form.thumbnail_url,
        visibility: form.visibility,
        is_pinned: form.is_pinned,
        attachments: form.attachments,
      };
      let saved: Article;
      if (article) {
        saved = await updateArticle(article.id, payload);
      } else {
        const [created] = await addArticlesToNewsletter(frameId, [
          {
            organization_id: import.meta.env.VITE_DEFAULT_ORGANIZATION_ID || null,
            category: REPORT_CATEGORY,
            article_type: 'official',
            priority: 'medium',
            control_date: null,
            tags: ['イベントレポート'],
            source: REPORT_SOURCE,
            display_order: null,
            ...payload,
          } as any,
        ]);
        saved = created;
      }
      setDirty(false);
      onSaved(saved);
      showToast(
        form.visibility === 'board-only'
          ? '保存しました（非公開）。公開するには「公開状態」を変更して保存してください。'
          : '保存しました。住民ページのレポートタブに表示されます。'
      );
    } catch (e) {
      console.error('レポート保存エラー:', e);
      showError('保存できませんでした。時間をおいてもう一度お試しください。');
    } finally {
      setSaving(false);
    }
  };

  const handleBack = async () => {
    if (dirty) {
      const ok = await appConfirm({
        title: '保存していない変更があります',
        message: 'このまま一覧に戻ると変更は失われます。',
        confirmLabel: '戻る',
        cancelLabel: '編集を続ける',
        danger: true,
      });
      if (!ok) return;
    }
    onBack();
  };

  const inputClass =
    'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c0392b]/30 focus:border-[#c0392b]';
  const labelClass = 'block text-xs font-bold text-slate-500 mb-1';

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="bg-white p-4 rounded-2xl shadow border border-slate-200 flex flex-wrap items-center gap-3">
        <button
          onClick={handleBack}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition"
        >
          <ArrowLeft size={16} />
          一覧へ
        </button>
        <h2 className="text-lg font-bold text-slate-800">
          {article ? 'レポートを編集' : '新しいレポート'}
        </h2>
        {dirty && <span className="text-xs text-amber-600 font-medium">未保存の変更あり</span>}
        <div className="ml-auto flex items-center gap-2">
          {article && (
            <button
              onClick={() => copyReviewLink(article.id)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition"
              title="この記事をメンバーに見てもらう確認用リンクをコピー（保存済みの内容が表示されます）"
            >
              <Copy size={16} />
              確認リンク
            </button>
          )}
          <button
            onClick={() => setShowPreview((v) => !v)}
            className="hidden lg:flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition"
          >
            {showPreview ? <EyeOff size={16} /> : <Eye size={16} />}
            {showPreview ? 'プレビューを隠す' : 'プレビューを表示'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || uploading}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-[#c0392b] rounded-lg hover:bg-[#a93226] transition disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            保存
          </button>
        </div>
      </div>

      <div className={`grid gap-4 ${showPreview ? 'lg:grid-cols-2' : ''}`}>
        {/* 左: 入力フォーム */}
        <div className="bg-white p-5 rounded-2xl shadow border border-slate-200 space-y-4">
          <div>
            <label className={labelClass}>タイトル（記事の見出し）</label>
            <input
              className={inputClass}
              value={form.title}
              onChange={(e) => update('title', e.target.value)}
              placeholder="例: みんなで作った櫓（やぐら）"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>イベント名（短く）</label>
              <input
                className={inputClass}
                value={form.headline}
                onChange={(e) => update('headline', e.target.value)}
                placeholder="例: 納涼大会"
              />
            </div>
            <div>
              <label className={labelClass}>開催日</label>
              <input
                type="date"
                className={inputClass}
                value={form.event_date}
                onChange={(e) => update('event_date', e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>時間</label>
              <input
                className={inputClass}
                value={form.event_time}
                onChange={(e) => update('event_time', e.target.value)}
                placeholder="例: 17:00-20:00"
              />
            </div>
            <div>
              <label className={labelClass}>場所</label>
              <input
                className={inputClass}
                value={form.event_location}
                onChange={(e) => update('event_location', e.target.value)}
                placeholder="例: 草舞台公園"
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>ひとこと（15文字程度・一覧やLINE配信用）</label>
            <input
              className={inputClass}
              value={form.brief}
              onChange={(e) => update('brief', e.target.value)}
              placeholder="例: 脚立4本で作った手作りの照明櫓"
            />
          </div>
          <div>
            <label className={labelClass}>概要（40文字程度）</label>
            <textarea
              className={`${inputClass} resize-none`}
              rows={2}
              value={form.summary}
              onChange={(e) => update('summary', e.target.value)}
              placeholder="例: 会員が持ち寄った脚立4本で照明櫓を手作り。盆踊りや模擬店で賑わった納涼大会2026のレポート。"
            />
          </div>

          {/* 扉写真 */}
          <div>
            <label className={labelClass}>扉写真（記事の先頭と一覧のサムネイル）</label>
            <div className="flex items-center gap-3">
              <div className="w-28 h-20 rounded-lg bg-slate-100 overflow-hidden flex items-center justify-center text-slate-300 shrink-0">
                {form.thumbnail_url ? (
                  <img src={form.thumbnail_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon size={24} />
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={() => thumbInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-100 text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-200 transition disabled:opacity-50"
                >
                  <ImageIcon size={14} />
                  {form.thumbnail_url ? '写真を差し替え' : '写真を選ぶ'}
                </button>
                {form.thumbnail_url && (
                  <button
                    onClick={() => update('thumbnail_url', null)}
                    className="text-xs text-slate-400 hover:text-red-500 text-left"
                  >
                    扉写真を外す
                  </button>
                )}
              </div>
              <input
                ref={thumbInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleThumb(e.target.files)}
              />
            </div>
          </div>

          {/* 本文 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={labelClass + ' mb-0'}>本文（Markdown）</label>
              <div className="flex items-center gap-1">
                <ToolbarButton
                  title="見出し"
                  onClick={() => insertBlock('## 見出し')}
                >
                  <Heading2 size={14} />
                </ToolbarButton>
                <ToolbarButton
                  title="太字"
                  onClick={() => insertAtCursor('**太字**', (s) => `**${s}**`)}
                >
                  <Bold size={14} />
                </ToolbarButton>
                <ToolbarButton
                  title="引用（囲み）"
                  onClick={() => insertBlock('> 引用文')}
                >
                  <Quote size={14} />
                </ToolbarButton>
                <ToolbarButton
                  title="リンク"
                  onClick={() => insertAtCursor('[リンク文字](https://)', (s) => `[${s}](https://)`)}
                >
                  <LinkIcon size={14} />
                </ToolbarButton>
                <button
                  onClick={() => bodyImageInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-white bg-[#c0392b] rounded-lg hover:bg-[#a93226] transition disabled:opacity-50"
                  title="写真をアップロードしてカーソル位置に挿入"
                >
                  {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />}
                  写真を挿入
                </button>
                <input
                  ref={bodyImageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => handleBodyImages(e.target.files)}
                />
              </div>
            </div>
            <textarea
              ref={contentRef}
              className={`${inputClass} font-mono text-[13px] leading-relaxed`}
              rows={24}
              value={form.content}
              onChange={(e) => update('content', e.target.value)}
              placeholder={
                'こんにちは、DX委員会です。…\n\n## 見出し\n\n本文。**太字**にすると赤く強調されます。\n\n![写真のキャプション](画像URL)\n\n> 囲み（引用）'
              }
            />
            <p className="text-[11px] text-slate-400 mt-1">
              写真は「写真を挿入」で本文に入ります。[ ] の中の文字がキャプションになります。動画は .mp4 のURLを画像と同じ書き方で貼れます。
              太字にするときは「」や（）を ** の外側に置いてください（例: 「**太字**」）。内側に入れると太字になりません。
            </p>
          </div>

          {/* 公開設定 */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
            <div>
              <label className={labelClass}>公開状態</label>
              <select
                className={inputClass}
                value={form.visibility}
                onChange={(e) => update('visibility', e.target.value as Visibility)}
              >
                <option value="board-only">非公開（下書き）</option>
                <option value="members-only">公開</option>
                {/* 外部公開URLの仕組みができるまで「一般公開(public)」は選択肢に出さない。
                    既存データが public の場合だけ、その値を保てるよう表示する */}
                {form.visibility === 'public' && <option value="public">一般公開</option>}
              </select>
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_pinned}
                  onChange={(e) => update('is_pinned', e.target.checked)}
                  className="w-4 h-4"
                />
                <Pin size={14} className="text-amber-500" />
                一覧の先頭に固定
              </label>
            </div>
          </div>
        </div>

        {/* 右: ライブプレビュー（公開時と同じレンダラー） */}
        {showPreview && (
          <div className="hidden lg:block">
            <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto bg-white rounded-2xl shadow border border-slate-200">
              <div className="px-4 py-2 border-b border-slate-100 text-xs font-bold text-slate-400 sticky top-0 bg-white z-10">
                プレビュー（住民ページでの見え方）
              </div>
              <EventReportView article={previewArticle} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const ToolbarButton: React.FC<{ title: string; onClick: () => void; children: React.ReactNode }> = ({
  title,
  onClick,
  children,
}) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg transition"
  >
    {children}
  </button>
);
