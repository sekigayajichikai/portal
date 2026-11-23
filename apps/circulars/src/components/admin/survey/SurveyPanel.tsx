/**
 * 「アンケート」タブ: アンケートの一覧（回覧板の号と同じ扱い）と、各アンケートの読み取り・確認・集計
 *
 * SurveyPanel = 一覧（新しいアンケート・設問の編集・開く）／ SurveyDetail = 1つのアンケートの票・集計・AI 利用記録
 *
 * 流れ: PDF/写真を選ぶ → 「AI で読み取りますか？ 見込み ○○円」 → 1枚ずつ読む（進捗表示）
 *      → 自信の低い票だけ人が確認 → 集計 → CSV
 * 要件: _private/アンケート回収_2026-11/要件定義.md（git 管理外）。
 * 読み取りの中身は packages/shared/services/survey/、保存は services/data/surveyService.ts。
 * SQL（survey_sheets / ai_usage_log）が未適用でも画面は動くが、再読み込みで消える。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BOSAI_KYOTEN_SURVEY,
  SURVEY_READ_MODEL,
  countSurveySheets,
  deleteSurvey,
  emptyQuestion,
  listSurveys,
  newSurveyId,
  upsertSurvey,
  addAiUsageLog,
  canReadSurvey,
  costJpy,
  deleteSurveySheets,
  estimateSurveyCostJpy,
  formatJpy,
  listAiUsageLogs,
  listSurveySheets,
  needsReview,
  readSurveySheet,
  upsertSurveySheet,
  type AiUsageLog,
  type SurveyDefinition,
  type SurveySheet,
  type SurveySheetReading,
  type TokenUsage,
} from '@cc-saas/shared';
import { Upload, Sparkles, Loader2, AlertTriangle, CheckCircle2, Table2, BarChart3, Receipt, Download, Trash2, FileJson, RotateCw, ArrowLeft, Plus, Edit3, ClipboardList } from 'lucide-react';
import { appConfirm, showError, showToast } from '@/components/ui/feedback';
import { filesToSheetImages, rotateSheetImage, type SheetImage } from './sheetImages';
import { SheetReviewDialog } from './SheetReviewDialog';
import { SurveyTally, effectiveAnswers } from './SurveyTally';
import { SurveyEditorDialog } from './SurveyEditorDialog';

type View = 'sheets' | 'tally' | 'usage';

const statusLabel: Record<SurveySheet['status'], { text: string; cls: string }> = {
  unread: { text: '未読', cls: 'bg-slate-100 text-slate-600' },
  read: { text: 'AI 読取済', cls: 'bg-green-100 text-green-700' },
  review: { text: '要確認', cls: 'bg-amber-100 text-amber-800' },
  confirmed: { text: '確認済み', cls: 'bg-blue-100 text-blue-700' },
  invalid: { text: '無効票', cls: 'bg-slate-200 text-slate-600' },
};

const localId = () => `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const SurveyDetail: React.FC<{ def: SurveyDefinition; onBack: () => void; onEdit: (hasSheets: boolean) => void }> = ({ def, onBack, onEdit }) => {
  const [billing, setBilling] = useState<'free' | 'paid'>(() => (localStorage.getItem('survey-billing') === 'paid' ? 'paid' : 'free'));
  const [sheets, setSheets] = useState<SurveySheet[]>([]);
  const [logs, setLogs] = useState<AiUsageLog[]>([]);
  const [view, setView] = useState<View>('sheets');
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState<string | null>(null);
  /** 読み取りの進み具合。currentId = いま AI に送っている票、queue = まだ順番待ちの票、stopping = 中止を押した（今の1枚が終わったら止まる） */
  const [reading, setReading] = useState<{ done: number; total: number; msg: string; currentId: string | null; queue: string[]; stopping?: boolean } | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [dbOk, setDbOk] = useState(true);
  /** AI に送る画像（保存しない。再読み込みで消える） */
  const images = useRef<Map<string, SheetImage>>(new Map());
  const stopRef = useRef(false);
  /** images（ref）を書き換えたときに「読み取れる票」を数え直すための合図 */
  const [imageTick, setImageTick] = useState(0);

  const reload = async () => {
    setLoading(true);
    const [s, l] = await Promise.all([listSurveySheets(def.id), listAiUsageLogs(100)]);
    setSheets(s);
    setLogs(l);
    setLoading(false);
  };
  useEffect(() => { void reload(); }, [def.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { localStorage.setItem('survey-billing', billing); }, [billing]);

  /** 保存して一覧を更新。DB に書けなければメモリ上だけ更新して知らせる */
  const persist = async (row: SurveySheet): Promise<SurveySheet> => {
    const { id, ...rest } = row;
    const input = { ...rest } as Partial<SurveySheet>;
    delete input.created_at;
    delete input.updated_at;
    const saved = await upsertSurveySheet((id.startsWith('local-') ? input : { id, ...input }) as Parameters<typeof upsertSurveySheet>[0]);
    const next = saved ?? row;
    if (!saved) setDbOk(false);
    if (saved && saved.id !== row.id) {
      const img = images.current.get(row.id);
      if (img) { images.current.set(saved.id, img); images.current.delete(row.id); }
    }
    setSheets((prev) => {
      const i = prev.findIndex((p) => p.id === row.id);
      if (i < 0) return [...prev, next];
      const copy = prev.slice();
      copy[i] = next;
      return copy;
    });
    return next;
  };

  const onFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setImporting('画像にしています…');
    try {
      const list = await filesToSheetImages(files, (label) => setImporting(`画像にしています… ${label}`));
      let dup = 0, reattached = 0;
      for (const img of list) {
        const existing = sheets.find((s) => s.source_name === img.sourceName && s.source_page === img.sourcePage);
        if (existing) {
          // 画像は保存していないので、再読み込みすると「未読」の票だけが残り、読み取りボタンが押せなくなる。
          // 同じファイルを選び直したら、残っている未読の票に画像を付け直す（2026-11-23）
          if (existing.status === 'unread' && !images.current.has(existing.id)) { images.current.set(existing.id, img); reattached++; }
          else dup++;
          continue;
        }
        const row: SurveySheet = {
          id: localId(), survey_id: def.id, region: null, source_name: img.sourceName, source_page: img.sourcePage,
          reading: null, corrected: null, status: 'unread', model: null, usage: null, thumb: img.thumbDataUrl, note: img.rotated ? '向きを自動で直した' : null,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        };
        images.current.set(row.id, img);
        await persist(row);
      }
      setImageTick((n) => n + 1);
      const added = list.length - dup - reattached;
      showToast([added ? `${added} 枚を追加しました` : '', reattached ? `未読の ${reattached} 枚を読み取れる状態に戻しました` : '', dup ? `同じ名前の ${dup} 枚は飛ばしました` : ''].filter(Boolean).join('／') || '追加する票はありませんでした');
    } catch (e) {
      showError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(null);
    }
  };

  const unreadWithImage = useMemo(() => sheets.filter((s) => s.status === 'unread' && images.current.has(s.id)), [sheets, imageTick]);
  /** 未読だが画像が手元に無い票の数（再読み込みで画像が消えたもの。選び直すまで読めない） */
  const unreadNoImage = useMemo(() => sheets.filter((s) => s.status === 'unread' && !images.current.has(s.id)).length, [sheets, imageTick]);

  const runRead = async () => {
    const targets = unreadWithImage;
    if (targets.length === 0) { showError('読み取る票がありません。PDF か写真を選んでください（再読み込みした場合は選び直し）'); return; }
    if (!canReadSurvey()) { showError('AI の準備ができていません。ログインし直してください'); return; }
    const estimate = estimateSurveyCostJpy(targets.length);
    const ok = await appConfirm({
      title: 'AI で読み取りますか？',
      message: `${targets.length} 枚を ${SURVEY_READ_MODEL} で読みます。見込み ${formatJpy(estimate)}（${billing === 'free' ? '無料枠のキーなら 0 円' : '有料枠'}）。1枚 5〜20 秒、混んでいると数分かかります。終わったら実績を記録します。`,
      confirmLabel: `読み取る（見込み ${formatJpy(estimate)}）`,
    });
    if (!ok) return;
    stopRef.current = false;
    const ids = targets.map((t) => t.id);
    setReading({ done: 0, total: targets.length, msg: '', currentId: null, queue: ids });
    const total: TokenUsage = { input: 0, output: 0, thinking: 0 };
    let done = 0, model = SURVEY_READ_MODEL, stopNote: string | null = null;
    for (const s of targets) {
      if (stopRef.current) { stopNote = '利用者が中止'; break; }
      const img = images.current.get(s.id);
      if (!img) continue;
      const queue = ids.slice(ids.indexOf(s.id) + 1);
      setReading((prev) => ({ done, total: targets.length, msg: '', currentId: s.id, queue, stopping: prev?.stopping }));
      try {
        const r = await readSurveySheet(def, img.pngBase64, 'image/png', { onRetry: (msg) => setReading((prev) => ({ done, total: targets.length, msg, currentId: s.id, queue, stopping: prev?.stopping })) });
        total.input += r.usage.input; total.output += r.usage.output; total.thinking += r.usage.thinking; model = r.model;
        await persist({ ...s, reading: r.reading, status: needsReview(r.reading) ? 'review' : 'read', model: r.model, usage: r.usage });
        done++;
        // 次の票まで 13 秒あける（無料枠 1分5回に合わせる）。その間は「次の票を待っています」と出す
        setReading((prev) => ({ done, total: targets.length, msg: done < targets.length ? '次の票まで少し待っています（回数制限のため 13 秒あけます）' : '', currentId: null, queue, stopping: prev?.stopping }));
        if (done < targets.length && !stopRef.current) await new Promise((r) => setTimeout(r, 13000));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        stopNote = `${s.source_name} p${s.source_page} で停止: ${msg}`;
        showError(msg);
        break;
      }
    }
    setReading(null);
    const actual = costJpy(total, model);
    if (done > 0 || stopNote) {
      const log = await addAiUsageLog({
        feature: 'survey_read', target: def.id, items: done, model,
        input_tokens: total.input, output_tokens: total.output, thinking_tokens: total.thinking,
        estimated_jpy: Math.round(estimate * 100) / 100, actual_jpy: Math.round(actual * 100) / 100, billing,
        note: stopNote ? `${done}/${targets.length} 枚で中断。${stopNote}` : null,
      });
      if (log) setLogs((prev) => [log, ...prev]); else setDbOk(false);
    }
    if (done > 0) showToast(`${done} 枚を読みました。実績 ${formatJpy(actual)}（トークン ${total.input + total.output + total.thinking}）`);
  };

  const saveReview = async (id: string, next: { corrected: Record<string, number[] | string> | null; status: SurveySheet['status']; note: string | null }) => {
    const s = sheets.find((x) => x.id === id);
    if (!s) return;
    await persist({ ...s, ...next });
    showToast(next.status === 'invalid' ? '無効票にしました' : '確認済みにしました');
  };

  const removeAll = async () => {
    if (!(await appConfirm({ title: 'この一覧をすべて消しますか？', message: `${sheets.length} 枚の読み取り結果と確認内容を消します。元の PDF や写真は消えません。`, confirmLabel: '消す', danger: true }))) return;
    const ids = sheets.filter((s) => !s.id.startsWith('local-')).map((s) => s.id);
    if (ids.length) await deleteSurveySheets(ids);
    images.current.clear();
    setSheets([]);
  };

  const rotateOne = async (s: SurveySheet) => {
    const img = images.current.get(s.id);
    if (!img) { showError('画像が手元にありません（再読み込みした場合は選び直してください）'); return; }
    const r = await rotateSheetImage(img);
    images.current.set(s.id, r);
    await persist({ ...s, thumb: r.thumbDataUrl, note: '手で回した' });
  };

  /** 試し読みスクリプトの結果 JSON（scripts/survey-test）を取り込む。画像ファイル名（拡張子なし）と sheet 名で突き合わせる */
  const importJson = async (file: File | null) => {
    if (!file) return;
    try {
      const d = JSON.parse(await file.text()) as { model?: string; results?: { sheet: string; result: SurveySheetReading | null; usage?: TokenUsage }[] };
      let hit = 0;
      for (const r of d.results ?? []) {
        if (!r.result) continue;
        const s = sheets.find((x) => x.source_name.replace(/\.[^.]+$/, '') === r.sheet && x.status === 'unread');
        if (!s) continue;
        await persist({ ...s, reading: r.result, status: needsReview(r.result) ? 'review' : 'read', model: d.model ?? 'import', usage: r.usage ?? null });
        hit++;
      }
      showToast(`${hit} 枚に読み取り結果を取り込みました`);
    } catch (e) {
      showError(`JSON を読めませんでした: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const exportCsv = () => {
    const head = ['票ID', 'ファイル', 'ページ', '状態', ...def.questions.map((q) => `問${q.no}`), 'AIが迷った点', 'メモ'];
    const rows = sheets.map((s) => {
      const a = effectiveAnswers(s) ?? {};
      return [s.id, s.source_name, String(s.source_page), statusLabel[s.status].text, ...def.questions.map((q) => (Array.isArray(a[q.key]) ? (a[q.key] as number[]).join(',') : String(a[q.key] ?? ''))), (s.reading?.flags ?? []).join(' / '), s.note ?? ''];
    });
    const csv = '﻿' + [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${def.id}_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const counts = useMemo(() => ({
    unread: sheets.filter((s) => s.status === 'unread').length,
    review: sheets.filter((s) => s.status === 'review').length,
    done: sheets.filter((s) => s.status === 'read' || s.status === 'confirmed').length,
  }), [sheets]);
  const monthTotal = useMemo(() => {
    const ym = new Date().toISOString().slice(0, 7);
    return logs.filter((l) => l.created_at.startsWith(ym)).reduce((a, l) => a + Number(l.actual_jpy), 0);
  }, [logs]);
  const reviewSheet = reviewId ? sheets.find((s) => s.id === reviewId) ?? null : null;

  return (
    <div className="space-y-4">
      <div className="bg-white p-6 rounded-2xl shadow border border-slate-200">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <button onClick={onBack} className="mt-0.5 p-1.5 rounded-lg hover:bg-slate-100 text-slate-600" title="アンケートの一覧へ"><ArrowLeft size={18} /></button>
            <div>
              <h2 className="text-2xl font-bold text-slate-800">{def.title}</h2>
              <p className="text-base text-slate-600 mt-1">
                紙の回答用紙（スキャン PDF かスマホ写真）を AI が読み、○や✓などの付いた番号を表にします。AI が迷った票だけ人が確認します。
                {def.note && <span className="ml-2 text-slate-600">{def.note}</span>}
              </p>
            </div>
          </div>
          <button onClick={() => onEdit(sheets.length > 0)} className="flex items-center gap-1.5 px-3 py-1.5 text-base text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200">
            <Edit3 size={14} /> 設問を見る・直す（{def.questions.length} 問）
          </button>
        </div>
        {!dbOk && (
          <div className="mt-3 text-base text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            保存先の表（survey_sheets / ai_usage_log）がまだありません。画面は動きますが、再読み込みすると消えます。sql/migrations/2026-11-21-survey-reading.sql を Supabase で実行してください。
          </div>
        )}
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <label className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-base font-bold cursor-pointer ${importing || reading ? 'bg-slate-100 text-slate-600' : 'bg-slate-800 text-white hover:bg-slate-700'}`}>
            <Upload size={16} /> PDF・写真を選ぶ
            <input type="file" multiple accept="application/pdf,image/*" className="hidden" disabled={!!importing || !!reading} onChange={(e) => { void onFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
          </label>
          <button
            onClick={() => void runRead()}
            disabled={!!importing || !!reading || unreadWithImage.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-base font-bold bg-primary-600 text-white hover:bg-primary-700 disabled:bg-slate-200 disabled:text-slate-400"
            title={unreadWithImage.length ? `${unreadWithImage.length} 枚を読みます` : unreadNoImage ? '画像が手元にありません。同じ PDF・写真を選び直してください' : '読む票がありません'}
          >
            <Sparkles size={16} /> AI で読み取る{unreadWithImage.length > 0 && `（${unreadWithImage.length} 枚・見込み ${formatJpy(estimateSurveyCostJpy(unreadWithImage.length))}）`}
          </button>
          {/* 「AI で読み取る」と同じ高さ・同じ文字の大きさ（小さくて見にくいとの声。2026-11-23） */}
          <label className="flex items-center">
            <select
              value={billing}
              onChange={(e) => setBilling(e.target.value as 'free' | 'paid')}
              disabled={!!reading}
              aria-label="使うキーの種類"
              className="px-3 py-2 rounded-lg text-base font-bold bg-white text-slate-800 border-2 border-slate-400 hover:border-slate-600 cursor-pointer disabled:text-slate-400"
            >
              <option value="free">無料枠のキー</option>
              <option value="paid">有料枠のキー</option>
            </select>
          </label>
          <span className="ml-auto text-sm text-slate-600">今月の AI 利用 {formatJpy(monthTotal)}</span>
        </div>
        {unreadNoImage > 0 && !importing && !reading && (
          <div className="mt-3 text-base text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            未読の {unreadNoImage} 枚は、画像が手元にないため読み取れません（画面を再読み込みすると画像は消えます）。
            「PDF・写真を選ぶ」で同じファイルをもう一度選ぶと、読み取れるようになります。
          </div>
        )}
        {/* 進み具合の帯（大きく。小さい回転アイコンだけだと止まって見えるため。2026-11-23） */}
        {importing && !reading && (
          <div className="mt-4 flex items-center gap-4 rounded-xl border-2 border-primary-200 bg-primary-50 px-5 py-4" role="status" aria-live="polite">
            <Loader2 size={36} className="animate-spin text-primary-600 shrink-0" />
            <div className="text-lg font-bold text-slate-800">{importing}</div>
          </div>
        )}
        {reading && (() => {
          const pct = Math.round((reading.done / Math.max(reading.total, 1)) * 100);
          const left = reading.total - reading.done;
          // 1枚 = 読み取り 約12秒 ＋ 次まで13秒
          const leftMin = Math.max(1, Math.ceil((left * 25) / 60));
          return (
            <div className="mt-4 rounded-xl border-2 border-primary-200 bg-primary-50 px-5 py-4" role="status" aria-live="polite">
              <div className="flex items-center gap-4">
                <Loader2 size={36} className="animate-spin text-primary-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-lg font-bold text-slate-800">
                    {reading.stopping ? '中止しています…' : 'AI で読み取っています'}
                    <span className="ml-3 tabular-nums">{reading.done} / {reading.total} 枚</span>
                  </div>
                  <div className="mt-2 h-3 rounded-full bg-white border border-primary-200 overflow-hidden">
                    <div className="h-full bg-primary-600 transition-all duration-500" style={{ width: `${Math.max(pct, 3)}%` }} />
                  </div>
                  <div className="mt-2 text-base text-slate-700">
                    {reading.stopping ? '今の1枚が終わったら止まります。' : `残り およそ ${leftMin} 分。`}
                    {reading.msg && <span className="ml-1 text-amber-800">{reading.msg}</span>}
                  </div>
                </div>
                <button
                  onClick={() => { stopRef.current = true; setReading((prev) => (prev ? { ...prev, stopping: true } : prev)); }}
                  disabled={reading.stopping}
                  className="shrink-0 px-4 py-2 rounded-lg text-base font-bold bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:text-slate-400"
                >
                  中止する
                </button>
              </div>
            </div>
          );
        })()}
      </div>

      <div className="flex items-center gap-1 border-b border-slate-200">
        {([['sheets', '票の一覧', Table2], ['tally', '集計', BarChart3], ['usage', 'AI 利用記録', Receipt]] as const).map(([v, label, Icon]) => (
          <button key={v} onClick={() => setView(v)} className={`flex items-center gap-1.5 px-4 py-2 text-base font-bold border-b-2 ${view === v ? 'border-primary-600 text-primary-700' : 'border-transparent text-slate-600 hover:text-slate-600'}`}>
            <Icon size={15} /> {label}
            {v === 'sheets' && counts.review > 0 && <span className="ml-1 px-1.5 rounded-full bg-amber-100 text-amber-800 text-sm">要確認 {counts.review}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-slate-600 text-base">読み込み中…</div>
      ) : view === 'sheets' ? (
        <div className="bg-white rounded-2xl shadow border border-slate-200 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-100 text-sm text-slate-600">
            <span>{sheets.length} 枚</span>
            <span>未読 {counts.unread}</span>
            <span className="text-amber-700">要確認 {counts.review}</span>
            <span>読取済・確認済 {counts.done}</span>
            <div className="ml-auto flex items-center gap-2">
              <label className="flex items-center gap-1 cursor-pointer hover:text-slate-800" title="試し読みスクリプトの結果 JSON を取り込む（画像と名前で突き合わせ）">
                <FileJson size={14} /> 結果 JSON
                <input type="file" accept="application/json" className="hidden" onChange={(e) => { void importJson(e.target.files?.[0] ?? null); e.target.value = ''; }} />
              </label>
              <button onClick={exportCsv} disabled={sheets.length === 0} className="flex items-center gap-1 hover:text-slate-800 disabled:text-slate-300"><Download size={14} /> CSV</button>
              <button onClick={() => void removeAll()} disabled={sheets.length === 0} className="flex items-center gap-1 hover:text-red-700 disabled:text-slate-300"><Trash2 size={14} /> 全部消す</button>
            </div>
          </div>
          {sheets.length === 0 ? (
            <div className="p-8 text-center text-base text-slate-600">「PDF・写真を選ぶ」から回答用紙を入れてください</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-2 py-2 text-left">用紙</th>
                    <th className="px-2 py-2 text-left">状態</th>
                    {def.questions.map((q) => <th key={q.key} className="px-1 py-2 text-center font-normal">問{q.no}</th>)}
                    <th className="px-2 py-2 text-left">AI が迷った点</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {sheets.map((s) => {
                    const a = effectiveAnswers(s);
                    // 読み取り中の行は色を付けて回転アイコン、順番待ちの行は「待ち」（どの票を処理しているか分かるように）
                    const isCurrent = reading?.currentId === s.id;
                    const isQueued = !isCurrent && !!reading?.queue.includes(s.id) && s.status === 'unread';
                    return (
                      <tr key={s.id} className={`border-t border-slate-100 cursor-pointer ${isCurrent ? 'bg-primary-50 ring-2 ring-inset ring-primary-300' : 'hover:bg-slate-50'}`} onClick={() => s.reading && setReviewId(s.id)}>
                        <td className="px-2 py-1.5 whitespace-nowrap text-slate-700">
                          {s.source_name.replace(/\.[^.]+$/, '').slice(0, 24)} <span className="text-slate-600">p{s.source_page}</span>
                        </td>
                        <td className="px-2 py-1.5 whitespace-nowrap">
                          {isCurrent ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary-600 text-white font-bold"><Loader2 size={13} className="animate-spin" /> 読み取り中…</span>
                          ) : isQueued ? (
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">待ち</span>
                          ) : (
                            <span className={`px-1.5 py-0.5 rounded ${statusLabel[s.status].cls}`}>{statusLabel[s.status].text}</span>
                          )}
                        </td>
                        {def.questions.map((q) => {
                          const conf = s.reading?.confidence[q.key] ?? 'high';
                          const v = a?.[q.key];
                          const text = q.kind === 'free' ? (typeof v === 'string' && v ? '✎' : '') : Array.isArray(v) ? v.join(',') : '';
                          const fixed = s.corrected && s.reading && JSON.stringify(s.reading.answers[q.key]) !== JSON.stringify(s.corrected[q.key]);
                          return (
                            <td key={q.key} className={`px-1 py-1.5 text-center tabular-nums ${conf === 'low' ? 'bg-red-50 text-red-800 font-bold' : conf === 'mid' ? 'bg-amber-50 text-amber-800' : 'text-slate-700'} ${fixed ? 'underline decoration-blue-500' : ''}`} title={q.kind === 'free' && typeof v === 'string' ? v : undefined}>
                              {s.status === 'invalid' ? '—' : text}
                            </td>
                          );
                        })}
                        <td className="px-2 py-1.5 text-amber-800 max-w-xs truncate" title={(s.reading?.flags ?? []).join(' / ')}>
                          {s.reading?.blank ? '白紙 ' : ''}{(s.reading?.flags ?? []).join(' / ')}
                        </td>
                        <td className="px-2 py-1.5 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                          {s.status === 'unread' && images.current.has(s.id) && (
                            <button onClick={() => void rotateOne(s)} className="text-slate-600 hover:text-slate-700 mr-2" title="180度回す（逆さまのとき）"><RotateCw size={13} /></button>
                          )}
                          {s.reading && (
                            <button onClick={() => setReviewId(s.id)} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${s.status === 'review' ? 'bg-amber-600 text-white hover:bg-amber-700' : 'text-slate-600 hover:bg-slate-100'}`}>
                              {s.status === 'review' ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />} {s.status === 'review' ? '確認する' : '見る'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : view === 'tally' ? (
        <SurveyTally def={def} sheets={sheets} />
      ) : (
        <div className="bg-white rounded-2xl shadow border border-slate-200 overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-100 text-sm text-slate-600">AI を呼ぶたびに1行。見込みはボタンに出した金額、実績は使ったトークン×単価。今月の合計 {formatJpy(monthTotal)}</div>
          {logs.length === 0 ? (
            <div className="p-8 text-center text-base text-slate-600">まだ記録がありません</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left">日時</th><th className="px-3 py-2 text-left">用途</th><th className="px-3 py-2 text-right">枚数</th><th className="px-3 py-2 text-left">モデル</th>
                  <th className="px-3 py-2 text-right">入力</th><th className="px-3 py-2 text-right">出力</th><th className="px-3 py-2 text-right">思考</th><th className="px-3 py-2 text-right">見込み</th><th className="px-3 py-2 text-right">実績</th><th className="px-3 py-2 text-left">枠</th><th className="px-3 py-2 text-left">備考</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-t border-slate-100">
                    <td className="px-3 py-1.5 whitespace-nowrap">{new Date(l.created_at).toLocaleString('ja-JP')}</td>
                    <td className="px-3 py-1.5">{l.feature === 'survey_read' ? 'アンケート読み取り' : l.feature}{l.target ? ` (${l.target})` : ''}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{l.items}</td>
                    <td className="px-3 py-1.5">{l.model}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{l.input_tokens.toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{l.output_tokens.toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{l.thinking_tokens.toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatJpy(Number(l.estimated_jpy))}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-bold">{formatJpy(Number(l.actual_jpy))}</td>
                    <td className="px-3 py-1.5">{l.billing === 'paid' ? '有料' : '無料'}</td>
                    <td className="px-3 py-1.5 text-slate-600">{l.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {reviewSheet && (
        <SheetReviewDialog def={def} sheet={reviewSheet} onClose={() => setReviewId(null)} onSave={(next) => saveReview(reviewSheet.id, next)} />
      )}
    </div>
  );
};

const surveyStatus: Record<string, { text: string; cls: string }> = {
  draft: { text: '準備中', cls: 'bg-slate-100 text-slate-600' },
  open: { text: '回収中', cls: 'bg-green-100 text-green-700' },
  closed: { text: '集計済み', cls: 'bg-blue-100 text-blue-700' },
};

/** アンケートの一覧。回覧板の号の一覧と同じ位置づけ */
export const SurveyPanel: React.FC = () => {
  const [surveys, setSurveys] = useState<SurveyDefinition[]>([]);
  const [counts, setCounts] = useState<Record<string, { total: number; review: number }>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SurveyDefinition | null>(null);
  const [editor, setEditor] = useState<{ def: SurveyDefinition; isNew: boolean; hasSheets: boolean } | null>(null);
  const [dbOk, setDbOk] = useState(true);

  const reload = async () => {
    setLoading(true);
    const [list, c] = await Promise.all([listSurveys([BOSAI_KYOTEN_SURVEY]), countSurveySheets()]);
    setSurveys(list);
    setCounts(c);
    setLoading(false);
  };
  useEffect(() => { void reload(); }, []);

  const save = async (def: SurveyDefinition) => {
    const saved = await upsertSurvey(def);
    if (!saved) setDbOk(false);
    const next = saved ?? def;
    setSurveys((prev) => (prev.some((p) => p.id === next.id) ? prev.map((p) => (p.id === next.id ? next : p)) : [next, ...prev]));
    if (selected?.id === next.id) setSelected(next);
    showToast('保存しました');
  };

  const remove = async (def: SurveyDefinition) => {
    const n = counts[def.id]?.total ?? 0;
    if (!(await appConfirm({ title: `「${def.title}」を消しますか？`, message: n ? `読み取った ${n} 票も一緒に消えます。元の PDF や写真は消えません。` : '票はありません。', confirmLabel: '消す', danger: true }))) return;
    await deleteSurvey(def.id);
    setSurveys((prev) => prev.filter((p) => p.id !== def.id));
  };

  if (selected) {
    return (
      <>
        <SurveyDetail def={selected} onBack={() => { setSelected(null); void reload(); }} onEdit={(hasSheets) => setEditor({ def: selected, isNew: false, hasSheets })} />
        {editor && <SurveyEditorDialog initial={editor.def} isNew={editor.isNew} hasSheets={editor.hasSheets} onClose={() => setEditor(null)} onSave={save} />}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white p-6 rounded-2xl shadow border border-slate-200">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">アンケート</h2>
            <p className="text-base text-slate-600 mt-1">
              紙の回答用紙を AI で読み取り、人が確認して集計します。アンケートごとに設問を登録し、回収した票を入れていきます。
            </p>
          </div>
          <button
            onClick={() => setEditor({ def: { id: newSurveyId(), title: '', sheetTitle: '', questions: [emptyQuestion(1)], status: 'draft', note: null }, isNew: true, hasSheets: false })}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-base font-bold bg-primary-600 text-white hover:bg-primary-700"
          >
            <Plus size={16} /> 新しいアンケート
          </button>
        </div>
        {!dbOk && (
          <div className="mt-3 text-base text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            保存先の表（surveys）がまだありません。sql/migrations/2026-11-21-survey-reading.sql を Supabase で実行してください。それまでは再読み込みで消えます。
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-slate-600 text-base">読み込み中…</div>
      ) : (
        <div className="space-y-3">
          {surveys.map((d) => {
            const c = counts[d.id];
            const st = surveyStatus[d.status ?? 'open'];
            return (
              <div key={d.id} className="bg-white rounded-xl shadow border border-slate-200 p-4 flex items-center gap-4 hover:border-primary-300 cursor-pointer" onClick={() => setSelected(d)}>
                <div className="w-10 h-10 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center shrink-0"><ClipboardList size={20} /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-800">{d.title}</span>
                    <span className={`px-1.5 py-0.5 rounded text-sm ${st.cls}`}>{st.text}</span>
                    {c && c.review > 0 && <span className="px-1.5 py-0.5 rounded text-sm bg-amber-100 text-amber-800">要確認 {c.review}</span>}
                  </div>
                  <div className="text-sm text-slate-600 mt-0.5">
                    {d.questions.length} 問 ／ 票 {c?.total ?? 0}
                    {d.note && <span className="ml-2">{d.note}</span>}
                    {d.createdAt && <span className="ml-2 text-slate-600">{new Date(d.createdAt).toLocaleDateString('ja-JP')} 作成</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => setEditor({ def: d, isNew: false, hasSheets: (c?.total ?? 0) > 0 })} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600" title="設問を直す"><Edit3 size={15} /></button>
                  <button onClick={() => void remove(d)} className="p-2 rounded-lg hover:bg-red-50 text-slate-600 hover:text-red-700" title="消す"><Trash2 size={15} /></button>
                  <button onClick={() => setSelected(d)} className="ml-1 px-3 py-1.5 rounded-lg text-base font-bold bg-slate-800 text-white hover:bg-slate-700">開く</button>
                </div>
              </div>
            );
          })}
          {surveys.length === 0 && <div className="text-base text-slate-600 p-8 text-center">「新しいアンケート」から作ってください</div>}
        </div>
      )}
      {editor && <SurveyEditorDialog initial={editor.def} isNew={editor.isNew} hasSheets={editor.hasSheets} onClose={() => setEditor(null)} onSave={save} />}
    </div>
  );
};
