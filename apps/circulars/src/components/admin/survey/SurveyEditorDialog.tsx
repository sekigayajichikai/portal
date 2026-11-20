/**
 * アンケートの定義を作る・直す（名前、用紙の題名、設問と選択肢）
 *
 * - 選択肢は1行に1つ書く（テキストエリア）。番号は上から 1, 2, 3… と自動で付く
 * - 設問の種類: 単一回答／複数回答／自由記述
 * - 票を読み取ったあとに設問を変えると集計がずれるので、票があるアンケートでは注意書きを出す
 */
import React, { useState } from 'react';
import { X, Plus, Trash2, ArrowUp, ArrowDown, Save } from 'lucide-react';
import { emptyQuestion, renumberQuestions, validateDefinition, type SurveyDefinition, type SurveyQuestion } from '@cc-saas/shared';
import { showError } from '@/components/ui/feedback';

export const SurveyEditorDialog: React.FC<{
  initial: SurveyDefinition;
  isNew: boolean;
  hasSheets: boolean;
  onClose: () => void;
  onSave: (def: SurveyDefinition) => Promise<void>;
}> = ({ initial, isNew, hasSheets, onClose, onSave }) => {
  const [def, setDef] = useState<SurveyDefinition>(() => ({ ...initial, questions: initial.questions.map((q) => ({ ...q, choices: q.choices.map((c) => ({ ...c })) })) }));
  const [busy, setBusy] = useState(false);

  const setQ = (i: number, patch: Partial<SurveyQuestion>) => {
    const qs = def.questions.slice();
    qs[i] = { ...qs[i], ...patch };
    setDef({ ...def, questions: qs });
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= def.questions.length) return;
    const qs = def.questions.slice();
    [qs[i], qs[j]] = [qs[j], qs[i]];
    setDef({ ...def, questions: renumberQuestions(qs) });
  };
  const remove = (i: number) => setDef({ ...def, questions: renumberQuestions(def.questions.filter((_, k) => k !== i)) });
  const add = () => setDef({ ...def, questions: [...def.questions, emptyQuestion(def.questions.length + 1)] });

  const save = async () => {
    const cleaned: SurveyDefinition = {
      ...def,
      title: def.title.trim(),
      sheetTitle: def.sheetTitle.trim() || def.title.trim(),
      questions: renumberQuestions(def.questions.map((q) => ({ ...q, text: q.text.trim(), choices: q.kind === 'free' ? [] : q.choices.map((c) => ({ ...c, label: c.label.trim() })).filter((c) => c.label) }))),
    };
    const errs = validateDefinition(cleaned);
    if (errs.length) { showError(errs.join('\n')); return; }
    setBusy(true);
    try { await onSave(cleaned); onClose(); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[95vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <div className="font-bold text-slate-800">{isNew ? '新しいアンケート' : 'アンケートの設問を直す'}</div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100"><X size={18} /></button>
        </div>
        {hasSheets && (
          <div className="px-5 py-2 bg-amber-50 border-b border-amber-200 text-sm text-amber-800">
            このアンケートには読み取った票があります。設問や選択肢の数を変えると、読み取り済みの票の番号がずれます。
          </div>
        )}
        <div className="flex-1 overflow-auto p-5 space-y-4 text-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-slate-500">アンケートの名前</span>
              <input value={def.title} onChange={(e) => setDef({ ...def, title: e.target.value })} placeholder="例: 2027年 防災意識アンケート" className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500">用紙の題名（回答用紙の一番上に印刷されている文字。AI に用紙の構成を伝える）</span>
              <input value={def.sheetTitle} onChange={(e) => setDef({ ...def, sheetTitle: e.target.value })} placeholder="空なら名前と同じ" className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500">状態</span>
              <select value={def.status ?? 'open'} onChange={(e) => setDef({ ...def, status: e.target.value as SurveyDefinition['status'] })} className="mt-1 border border-slate-300 rounded-lg px-3 py-2">
                <option value="draft">準備中</option>
                <option value="open">回収中</option>
                <option value="closed">集計済み</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-500">メモ</span>
              <input value={def.note ?? ''} onChange={(e) => setDef({ ...def, note: e.target.value })} placeholder="配布日、回収の締切など" className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2" />
            </label>
          </div>

          <div className="space-y-3">
            {def.questions.map((q, i) => (
              <div key={i} className="border border-slate-200 rounded-xl p-3">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-800 w-12">問{q.no}</span>
                  <input value={q.text} onChange={(e) => setQ(i, { text: e.target.value })} placeholder="設問文" className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5" />
                  <select value={q.kind} onChange={(e) => setQ(i, { kind: e.target.value as SurveyQuestion['kind'], choices: e.target.value === 'free' ? [] : q.choices.length ? q.choices : emptyQuestion(q.no).choices })} className="border border-slate-300 rounded-lg px-2 py-1.5">
                    <option value="single">単一回答（1つだけ○）</option>
                    <option value="multi">複数回答（いくつでも○）</option>
                    <option value="free">自由記述</option>
                  </select>
                  <button onClick={() => move(i, -1)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="上へ"><ArrowUp size={14} /></button>
                  <button onClick={() => move(i, 1)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="下へ"><ArrowDown size={14} /></button>
                  <button onClick={() => remove(i)} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-700" title="この設問を消す"><Trash2 size={14} /></button>
                </div>
                {q.kind !== 'free' && (
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-xs text-slate-500">選択肢（1行に1つ。上から 1, 2, 3… の番号になる）</span>
                      <textarea
                        value={q.choices.map((c) => c.label).join('\n')}
                        onChange={(e) => setQ(i, { choices: e.target.value.split('\n').map((label, j) => ({ no: j + 1, label })) })}
                        rows={Math.max(3, q.choices.length + 1)}
                        className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-1.5 font-mono text-xs"
                      />
                    </label>
                    <div className="text-xs text-slate-500 pt-5">
                      <div className="mb-1">用紙の枠の並び（見え方の確認）</div>
                      <div className="flex flex-wrap gap-1">
                        {q.choices.map((c) => (
                          <span key={c.no} title={c.label} className="w-8 h-8 border-2 border-slate-700 rounded-sm flex items-center justify-center font-bold text-slate-800 bg-white">{c.no}</span>
                        ))}
                      </div>
                      <input value={q.note ?? ''} onChange={(e) => setQ(i, { note: e.target.value || undefined })} placeholder="補足（例: 問5で1を選んだ方向け）" className="mt-2 w-full border border-slate-300 rounded px-2 py-1" />
                    </div>
                  </div>
                )}
              </div>
            ))}
            <button onClick={add} className="flex items-center gap-1 px-3 py-2 rounded-lg border border-dashed border-slate-300 text-slate-600 hover:bg-slate-50">
              <Plus size={14} /> 設問を足す
            </button>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">閉じる</button>
          <button disabled={busy} onClick={() => void save()} className="flex items-center gap-1 px-4 py-2 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-lg">
            <Save size={14} /> 保存
          </button>
        </div>
      </div>
    </div>
  );
};
