/**
 * 設問ごとの集計表（件数・割合・横棒）
 *
 * - 集計に入れるのは「確認済み」と「AI が読んで確認不要（全問 high・flags なし）」の票。
 *   「確認待ち」の票は入れない（人が見てから入る）。無効票は件数だけ数える
 * - 人が直した値（corrected）があればそれを使う
 */
import React, { useMemo } from 'react';
import type { SurveyDefinition, SurveySheet } from '@cc-saas/shared';

export function effectiveAnswers(s: SurveySheet): Record<string, number[] | string> | null {
  if (s.status === 'invalid' || !s.reading) return null;
  return s.corrected ?? s.reading.answers;
}

export function countsForTally(def: SurveyDefinition, sheets: SurveySheet[]) {
  const valid = sheets.filter((s) => (s.status === 'confirmed' || s.status === 'read') && s.reading);
  const pending = sheets.filter((s) => s.status === 'review').length;
  const invalid = sheets.filter((s) => s.status === 'invalid').length;
  const unread = sheets.filter((s) => s.status === 'unread').length;
  const perQ = def.questions.map((q) => {
    const counts = q.choices.map(() => 0);
    let blank = 0;
    const free: { text: string; sheet: SurveySheet }[] = [];
    for (const s of valid) {
      const a = effectiveAnswers(s)?.[q.key];
      if (q.kind === 'free') {
        if (typeof a === 'string' && a.trim()) free.push({ text: a.trim(), sheet: s });
        continue;
      }
      const nums = Array.isArray(a) ? a : [];
      if (nums.length === 0) blank++;
      for (const n of nums) if (n >= 1 && n <= counts.length) counts[n - 1]++;
    }
    return { q, counts, blank, free };
  });
  return { n: valid.length, pending, invalid, unread, perQ };
}

export const SurveyTally: React.FC<{ def: SurveyDefinition; sheets: SurveySheet[] }> = ({ def, sheets }) => {
  const t = useMemo(() => countsForTally(def, sheets), [def, sheets]);
  const pct = (c: number) => (t.n ? Math.round((c * 100) / t.n) : 0);
  return (
    <div className="space-y-4">
      <div className="text-sm text-slate-600">
        集計対象 <b className="text-slate-800">{t.n} 票</b>
        {t.pending > 0 && <span className="ml-3 text-amber-700">確認待ち {t.pending} 票（確認すると集計に入ります）</span>}
        {t.invalid > 0 && <span className="ml-3 text-slate-500">無効票 {t.invalid}</span>}
        {t.unread > 0 && <span className="ml-3 text-slate-500">未読 {t.unread}</span>}
        <span className="ml-3 text-slate-400">割合は集計対象に対する割合。複数回答は合計が100%を超えます</span>
      </div>
      {t.perQ.map(({ q, counts, blank, free }) => (
        <div key={q.key} className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-bold text-slate-800">問{q.no}</span>
            <span className="text-slate-700">{q.text}</span>
            <span className="text-xs text-slate-400">{q.kind === 'multi' ? '複数回答' : q.kind === 'single' ? '単一回答' : '自由記述'}</span>
            {q.note && <span className="text-xs text-slate-400">（{q.note}）</span>}
          </div>
          {q.kind === 'free' ? (
            <ul className="mt-2 text-sm text-slate-700 list-disc pl-5 space-y-1">
              {free.length === 0 && <li className="text-slate-400 list-none pl-0">記入なし</li>}
              {free.map((f, i) => (
                <li key={i}>
                  {f.text} <span className="text-xs text-slate-400">（{f.sheet.source_name} p{f.sheet.source_page}）</span>
                </li>
              ))}
            </ul>
          ) : (
            <table className="mt-2 w-full text-sm">
              <tbody>
                {q.choices.map((ch, i) => (
                  <tr key={ch.no} className="border-t border-slate-100">
                    <td className="py-1 pr-2 w-6 text-slate-500 align-top">{ch.no}</td>
                    <td className="py-1 pr-3 text-slate-700">{ch.label}</td>
                    <td className="py-1 w-48">
                      <div className="h-3 bg-slate-100 rounded">
                        <div className="h-3 bg-primary-500 rounded" style={{ width: `${pct(counts[i])}%` }} />
                      </div>
                    </td>
                    <td className="py-1 pl-3 w-14 text-right tabular-nums text-slate-800 font-bold">{counts[i]}</td>
                    <td className="py-1 pl-2 w-14 text-right tabular-nums text-slate-500">{pct(counts[i])}%</td>
                  </tr>
                ))}
                <tr className="border-t border-slate-100 text-slate-400">
                  <td />
                  <td className="py-1">無回答</td>
                  <td />
                  <td className="py-1 pl-3 text-right tabular-nums">{blank}</td>
                  <td className="py-1 pl-2 text-right tabular-nums">{pct(blank)}%</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  );
};
