/**
 * 「アンケート」タブ: 紙の回答用紙を AI で読み取り、人が確認して集計する
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
  SURVEY_DEFINITIONS,
  SURVEY_READ_MODEL,
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
import { Upload, Sparkles, Loader2, AlertTriangle, CheckCircle2, Table2, BarChart3, Receipt, Download, Trash2, FileJson, RotateCw } from 'lucide-react';
import { appConfirm, showError, showToast } from '@/components/ui/feedback';
import { filesToSheetImages, rotateSheetImage, type SheetImage } from './sheetImages';
import { SheetReviewDialog } from './SheetReviewDialog';
import { SurveyTally, effectiveAnswers } from './SurveyTally';

const REGIONS = ['関ヶ谷', '山の手', '夏山'];
type View = 'sheets' | 'tally' | 'usage';

const statusLabel: Record<SurveySheet['status'], { text: string; cls: string }> = {
  unread: { text: '未読', cls: 'bg-slate-100 text-slate-600' },
  read: { text: 'AI 読取済', cls: 'bg-green-100 text-green-700' },
  review: { text: '要確認', cls: 'bg-amber-100 text-amber-800' },
  confirmed: { text: '確認済み', cls: 'bg-blue-100 text-blue-700' },
  invalid: { text: '無効票', cls: 'bg-slate-200 text-slate-500' },
};

const localId = () => `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const SurveyPanel: React.FC = () => {
  const [def, setDef] = useState<SurveyDefinition>(BOSAI_KYOTEN_SURVEY);
  const [region, setRegion] = useState(REGIONS[0]);
  const [billing, setBilling] = useState<'free' | 'paid'>(() => (localStorage.getItem('survey-billing') === 'paid' ? 'paid' : 'free'));
  const [sheets, setSheets] = useState<SurveySheet[]>([]);
  const [logs, setLogs] = useState<AiUsageLog[]>([]);
  const [view, setView] = useState<View>('sheets');
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState<string | null>(null);
  const [reading, setReading] = useState<{ done: number; total: number; msg: string } | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [dbOk, setDbOk] = useState(true);
  /** AI に送る画像（保存しない。再読み込みで消える） */
  const images = useRef<Map<string, SheetImage>>(new Map());
  const stopRef = useRef(false);

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
      let dup = 0;
      for (const img of list) {
        if (sheets.some((s) => s.source_name === img.sourceName && s.source_page === img.sourcePage)) { dup++; continue; }
        const row: SurveySheet = {
          id: localId(), survey_id: def.id, region, source_name: img.sourceName, source_page: img.sourcePage,
          reading: null, corrected: null, status: 'unread', model: null, usage: null, thumb: img.thumbDataUrl, note: img.rotated ? '向きを自動で直した' : null,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        };
        images.current.set(row.id, img);
        await persist(row);
      }
      showToast(`${list.length - dup} 枚を追加しました${dup ? `（同じ名前の ${dup} 枚は飛ばしました）` : ''}`);
    } catch (e) {
      showError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(null);
    }
  };

  const unreadWithImage = useMemo(() => sheets.filter((s) => s.status === 'unread' && images.current.has(s.id)), [sheets]);

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
    setReading({ done: 0, total: targets.length, msg: '' });
    const total: TokenUsage = { input: 0, output: 0, thinking: 0 };
    let done = 0, model = SURVEY_READ_MODEL, stopNote: string | null = null;
    for (const s of targets) {
      if (stopRef.current) { stopNote = '利用者が中止'; break; }
      const img = images.current.get(s.id);
      if (!img) continue;
      try {
        const r = await readSurveySheet(def, img.pngBase64, 'image/png', { onRetry: (msg) => setReading({ done, total: targets.length, msg }) });
        total.input += r.usage.input; total.output += r.usage.output; total.thinking += r.usage.thinking; model = r.model;
        await persist({ ...s, reading: r.reading, status: needsReview(r.reading) ? 'review' : 'read', model: r.model, usage: r.usage, region });
        done++;
        setReading({ done, total: targets.length, msg: '' });
        if (done < targets.length) await new Promise((r) => setTimeout(r, 13000)); // 無料枠 1分5回に合わせる
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
    const head = ['票ID', 'ファイル', 'ページ', '地域', '状態', ...def.questions.map((q) => `問${q.no}`), 'AIが迷った点', 'メモ'];
    const rows = sheets.map((s) => {
      const a = effectiveAnswers(s) ?? {};
      return [s.id, s.source_name, String(s.source_page), s.region ?? '', statusLabel[s.status].text, ...def.questions.map((q) => (Array.isArray(a[q.key]) ? (a[q.key] as number[]).join(',') : String(a[q.key] ?? ''))), (s.reading?.flags ?? []).join(' / '), s.note ?? ''];
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
          <div>
            <h2 className="text-xl font-bold text-slate-800">アンケートの読み取りと集計</h2>
            <p className="text-sm text-slate-500 mt-1">
              紙の回答用紙（スキャン PDF かスマホ写真）を AI が読み、○の付いた番号を表にします。AI が迷った票だけ人が確認します。
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <select value={def.id} onChange={(e) => setDef(SURVEY_DEFINITIONS.find((d) => d.id === e.target.value) ?? BOSAI_KYOTEN_SURVEY)} className="border border-slate-300 rounded-lg px-2 py-1.5">
              {SURVEY_DEFINITIONS.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
            <select value={region} onChange={(e) => setRegion(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5" title="紙の票の地域（回収ルートで決まる）">
              {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
        {!dbOk && (
          <div className="mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            保存先の表（survey_sheets / ai_usage_log）がまだありません。画面は動きますが、再読み込みすると消えます。sql/migrations/2026-11-21-survey-reading.sql を Supabase で実行してください。
          </div>
        )}
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <label className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold cursor-pointer ${importing || reading ? 'bg-slate-100 text-slate-400' : 'bg-slate-800 text-white hover:bg-slate-700'}`}>
            <Upload size={16} /> PDF・写真を選ぶ
            <input type="file" multiple accept="application/pdf,image/*" className="hidden" disabled={!!importing || !!reading} onChange={(e) => { void onFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
          </label>
          <button
            onClick={() => void runRead()}
            disabled={!!importing || !!reading || unreadWithImage.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold bg-primary-600 text-white hover:bg-primary-700 disabled:bg-slate-200 disabled:text-slate-400"
            title={unreadWithImage.length ? `${unreadWithImage.length} 枚を読みます` : '読む票がありません'}
          >
            <Sparkles size={16} /> AI で読み取る{unreadWithImage.length > 0 && `（${unreadWithImage.length} 枚・見込み ${formatJpy(estimateSurveyCostJpy(unreadWithImage.length))}）`}
          </button>
          <label className="flex items-center gap-1 text-xs text-slate-500 ml-1">
            <select value={billing} onChange={(e) => setBilling(e.target.value as 'free' | 'paid')} className="border border-slate-300 rounded px-1 py-1 text-xs">
              <option value="free">無料枠のキー</option>
              <option value="paid">有料枠のキー</option>
            </select>
          </label>
          <span className="ml-auto text-xs text-slate-500">今月の AI 利用 {formatJpy(monthTotal)}</span>
          {importing && <span className="text-sm text-slate-500 flex items-center gap-1"><Loader2 size={14} className="animate-spin" />{importing}</span>}
        </div>
        {reading && (
          <div className="mt-3 flex items-center gap-3 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <Loader2 size={16} className="animate-spin text-primary-600" />
            <span>{reading.done} / {reading.total} 枚を読みました。{reading.msg}</span>
            <button onClick={() => { stopRef.current = true; }} className="ml-auto text-xs text-slate-500 underline">中止</button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 border-b border-slate-200">
        {([['sheets', '票の一覧', Table2], ['tally', '集計', BarChart3], ['usage', 'AI 利用記録', Receipt]] as const).map(([v, label, Icon]) => (
          <button key={v} onClick={() => setView(v)} className={`flex items-center gap-1.5 px-4 py-2 text-sm font-bold border-b-2 ${view === v ? 'border-primary-600 text-primary-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
            <Icon size={15} /> {label}
            {v === 'sheets' && counts.review > 0 && <span className="ml-1 px-1.5 rounded-full bg-amber-100 text-amber-800 text-[11px]">要確認 {counts.review}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-slate-500 text-sm">読み込み中…</div>
      ) : view === 'sheets' ? (
        <div className="bg-white rounded-2xl shadow border border-slate-200 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-100 text-xs text-slate-500">
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
            <div className="p-8 text-center text-sm text-slate-400">「PDF・写真を選ぶ」から回答用紙を入れてください</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
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
                    return (
                      <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => s.reading && setReviewId(s.id)}>
                        <td className="px-2 py-1.5 whitespace-nowrap text-slate-700">
                          {s.source_name.replace(/\.[^.]+$/, '').slice(0, 24)} <span className="text-slate-400">p{s.source_page}</span>
                        </td>
                        <td className="px-2 py-1.5 whitespace-nowrap"><span className={`px-1.5 py-0.5 rounded ${statusLabel[s.status].cls}`}>{statusLabel[s.status].text}</span></td>
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
                            <button onClick={() => void rotateOne(s)} className="text-slate-400 hover:text-slate-700 mr-2" title="180度回す（逆さまのとき）"><RotateCw size={13} /></button>
                          )}
                          {s.reading && (
                            <button onClick={() => setReviewId(s.id)} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${s.status === 'review' ? 'bg-amber-600 text-white hover:bg-amber-700' : 'text-slate-500 hover:bg-slate-100'}`}>
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
          <div className="px-4 py-2 border-b border-slate-100 text-xs text-slate-500">AI を呼ぶたびに1行。見込みはボタンに出した金額、実績は使ったトークン×単価。今月の合計 {formatJpy(monthTotal)}</div>
          {logs.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">まだ記録がありません</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
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
                    <td className="px-3 py-1.5 text-slate-500">{l.note}</td>
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
