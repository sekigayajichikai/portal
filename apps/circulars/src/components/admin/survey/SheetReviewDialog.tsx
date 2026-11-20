/**
 * 1票の確認画面: 用紙の画像と AI の読み取りを並べ、人が直して「確認済み」にする
 *
 * - low / mid の設問は色を付けて目立たせる。flags（AI が迷った理由）を上に出す
 * - 直した値は corrected に入れ、AI の元の値（reading）は残す（どこを直したか後で分かるように）
 */
import React, { useState } from 'react';
import { X, Check, Ban, RotateCw } from 'lucide-react';
import type { SurveyDefinition, SurveySheet } from '@cc-saas/shared';

const confClass: Record<string, string> = {
  high: '',
  mid: 'bg-amber-50 border-amber-300',
  low: 'bg-red-50 border-red-300',
};

export const SheetReviewDialog: React.FC<{
  def: SurveyDefinition;
  sheet: SurveySheet;
  onClose: () => void;
  onSave: (next: { corrected: Record<string, number[] | string> | null; status: SurveySheet['status']; note: string | null }) => Promise<void>;
}> = ({ def, sheet, onClose, onSave }) => {
  const base = sheet.corrected ?? sheet.reading?.answers ?? {};
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(def.questions.map((q) => [q.key, Array.isArray(base[q.key]) ? (base[q.key] as number[]).join(',') : String(base[q.key] ?? '')]))
  );
  const [note, setNote] = useState(sheet.note ?? '');
  const [busy, setBusy] = useState(false);
  const [rotated, setRotated] = useState(false);

  const toAnswers = (): Record<string, number[] | string> =>
    Object.fromEntries(
      def.questions.map((q) => [
        q.key,
        q.kind === 'free'
          ? values[q.key].trim()
          : Array.from(new Set(values[q.key].split(/[,、 ]+/).map((s) => Number(s)).filter((n) => Number.isInteger(n) && n >= 1 && n <= q.choices.length))).sort((a, b) => a - b),
      ])
    );

  const save = async (status: SurveySheet['status']) => {
    setBusy(true);
    try {
      const corrected = toAnswers();
      const same = sheet.reading && JSON.stringify(corrected) === JSON.stringify(sheet.reading.answers);
      await onSave({ corrected: same ? null : corrected, status, note: note.trim() || null });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl max-h-[95vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <div>
            <div className="font-bold text-slate-800">
              {sheet.source_name} <span className="text-slate-500">p{sheet.source_page}</span>
            </div>
            <div className="text-xs text-slate-500">
              {sheet.status === 'confirmed' ? '確認済み' : sheet.status === 'invalid' ? '無効票' : sheet.status === 'review' ? '確認待ち' : 'AI が読んだ票'}
              {sheet.model && ` ／ ${sheet.model}`}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
        {sheet.reading?.flags.length ? (
          <div className="px-5 py-2 bg-amber-50 border-b border-amber-200 text-sm text-amber-800">
            AI が迷った点: {sheet.reading.flags.join(' ／ ')}
          </div>
        ) : null}
        {sheet.reading?.blank && <div className="px-5 py-2 bg-slate-100 text-sm text-slate-700">AI は「印が無い用紙」と判断しました</div>}
        <div className="flex-1 overflow-auto grid grid-cols-1 lg:grid-cols-2 gap-4 p-5">
          <div className="relative">
            {sheet.thumb ? (
              <img src={sheet.thumb} alt="回答用紙" className={`w-full border border-slate-200 rounded ${rotated ? 'rotate-180' : ''}`} />
            ) : (
              <div className="text-sm text-slate-400">画像は保存されていません</div>
            )}
            <button onClick={() => setRotated((v) => !v)} className="absolute top-2 right-2 bg-white/90 border border-slate-300 rounded-lg px-2 py-1 text-xs flex items-center gap-1 hover:bg-slate-50" title="表示だけ180度回す">
              <RotateCw size={12} /> 回す
            </button>
          </div>
          <div className="space-y-1.5 text-sm">
            {def.questions.map((q) => {
              const conf = sheet.reading?.confidence[q.key] ?? 'high';
              return (
                <div key={q.key} className={`border rounded-lg px-3 py-1.5 ${confClass[conf] || 'border-slate-200'}`}>
                  <div className="flex items-baseline gap-2">
                    <span className="font-bold text-slate-800 w-10 shrink-0">問{q.no}</span>
                    <span className="text-slate-600 text-xs leading-snug">{q.text}</span>
                    {conf !== 'high' && <span className={`ml-auto text-[11px] font-bold ${conf === 'low' ? 'text-red-700' : 'text-amber-700'}`}>{conf === 'low' ? '自信 低' : '自信 中'}</span>}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    {q.kind === 'free' ? (
                      <textarea value={values[q.key]} onChange={(e) => setValues({ ...values, [q.key]: e.target.value })} rows={2} className="flex-1 border border-slate-300 rounded px-2 py-1 text-sm" />
                    ) : (
                      <>
                        <div className="flex flex-wrap gap-1">
                          {q.choices.map((ch) => {
                            const sel = values[q.key].split(/[,、 ]+/).includes(String(ch.no));
                            return (
                              <button
                                key={ch.no}
                                type="button"
                                title={ch.label}
                                onClick={() => {
                                  const cur = values[q.key].split(/[,、 ]+/).filter(Boolean);
                                  let next: string[];
                                  if (q.kind === 'single') next = sel ? [] : [String(ch.no)];
                                  else next = sel ? cur.filter((x) => x !== String(ch.no)) : [...cur, String(ch.no)];
                                  setValues({ ...values, [q.key]: next.map(Number).sort((a, b) => a - b).join(',') });
                                }}
                                className={`w-8 h-8 rounded border text-sm font-bold ${sel ? 'bg-primary-600 border-primary-600 text-white' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                              >
                                {ch.no}
                              </button>
                            );
                          })}
                        </div>
                        {sheet.reading && sheet.corrected && JSON.stringify(sheet.reading.answers[q.key]) !== JSON.stringify(sheet.corrected[q.key]) && (
                          <span className="text-[11px] text-slate-400">AI: {(sheet.reading.answers[q.key] as number[]).join(',') || 'なし'}</span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            <div className="pt-2">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="メモ（例: 原本で確認済み）" className="w-full border border-slate-300 rounded px-2 py-1 text-sm" />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-slate-200">
          <button disabled={busy} onClick={() => save('invalid')} className="flex items-center gap-1 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
            <Ban size={14} /> 無効票にする
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">閉じる</button>
            <button disabled={busy} onClick={() => save('confirmed')} className="flex items-center gap-1 px-4 py-2 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-lg">
              <Check size={14} /> この内容で確認済みにする
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
