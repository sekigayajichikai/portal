/**
 * PDFの点検ダイアログ（号の画面「登録済みPDF」の「PDFの点検」から開く）
 *
 * 2つのことを調べる:
 *   1. 登録済みPDFの点検 … 各PDFが実際に開けるか（サイズ）、記事・予定のどこかで使われているか
 *   2. 同封物一覧との突き合わせ（AI） … 関ヶ谷だより（先頭PDF）に載っている回覧物の一覧を読み、
 *      登録済みPDFの名前と比べて「一覧にあるのに未登録」を出す（入れ忘れを見つける）
 * 2 は AI を呼ぶので、ボタンを押したときだけ動く。
 */

import React, { useEffect, useState } from 'react';
import { getArticlesByNewsletterId, getAdminEventCards, convertPdfUrlToBase64, checkEnclosures, type EnclosureCheckResult } from '@cc-saas/shared';
import { X, Loader2, CheckCircle2, AlertCircle, Sparkles, ClipboardCheck } from 'lucide-react';

interface PdfCheckDialogProps {
  newsletterId: string;
  newsletterTitle: string;
  /** 登録済みPDF（画面の順） */
  pdfs: Array<{ url: string; label: string }>;
  onClose: () => void;
}

interface PdfRow {
  url: string;
  label: string;
  /** 開けるか: checking → ok / ng */
  state: 'checking' | 'ok' | 'ng';
  sizeKb: number | null;
  /** このPDFを添付している記事の数 */
  articles: number;
  /** このPDFを由来にしている予定の数 */
  events: number;
}

/** 開けるかを確かめる（HEAD が通らない置き場もあるので、だめなら GET で先頭だけ） */
async function probePdf(url: string): Promise<{ ok: boolean; sizeKb: number | null }> {
  const read = (res: Response) => {
    const len = Number(res.headers.get('content-length') ?? '');
    return { ok: res.ok, sizeKb: Number.isFinite(len) && len > 0 ? Math.round(len / 1024) : null };
  };
  try {
    const head = await fetch(url, { method: 'HEAD' });
    if (head.ok) return read(head);
  } catch {
    // HEAD が使えない置き場 → GET で試す
  }
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-0' } });
    return { ok: res.ok, sizeKb: read(res).sizeKb };
  } catch {
    return { ok: false, sizeKb: null };
  }
}

export const PdfCheckDialog: React.FC<PdfCheckDialogProps> = ({ newsletterId, newsletterTitle, pdfs, onClose }) => {
  const [rows, setRows] = useState<PdfRow[]>(() => pdfs.map((p) => ({ ...p, state: 'checking', sizeKb: null, articles: 0, events: 0 })));
  const [usageLoaded, setUsageLoaded] = useState(false);
  const [enclosure, setEnclosure] = useState<{ state: 'idle' | 'running' | 'done' | 'error'; result?: EnclosureCheckResult; error?: string }>({ state: 'idle' });

  // 1. 開けるか・使われているか
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [articles, events] = await Promise.all([
        getArticlesByNewsletterId(newsletterId).catch(() => []),
        getAdminEventCards({ newsletterId }).catch(() => []),
      ]);
      const probes = await Promise.all(pdfs.map((p) => probePdf(p.url)));
      if (cancelled) return;
      setRows(
        pdfs.map((p, i) => ({
          ...p,
          state: probes[i].ok ? 'ok' : 'ng',
          sizeKb: probes[i].sizeKb,
          articles: articles.filter((a) => (a.attachments ?? []).some((at) => at.url === p.url)).length,
          events: events.filter((e) => e.source_pdf_url === p.url).length,
        }))
      );
      setUsageLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [newsletterId, pdfs]);

  // Esc で閉じる
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  /** 関ヶ谷だより（無ければ先頭のPDF）。一覧はここに載っている */
  const carrier = pdfs.find((p) => /関ヶ谷だより/.test(p.label)) ?? pdfs[0] ?? null;

  // 2. 同封物一覧との突き合わせ（AI）
  const runEnclosureCheck = async () => {
    if (!carrier) return;
    setEnclosure({ state: 'running' });
    try {
      const b64 = await convertPdfUrlToBase64(carrier.url);
      const labels = pdfs.map((p) => p.label).filter((l) => l && l !== carrier.label);
      const result = await checkEnclosures(b64, labels);
      setEnclosure({ state: 'done', result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setEnclosure({ state: 'error', error: /429|RESOURCE_EXHAUSTED|quota/i.test(msg) ? 'AIの無料枠の回数制限にかかりました。1分ほど待ってからもう一度押してください。' : msg });
    }
  };

  const ngRows = rows.filter((r) => r.state === 'ng');
  const unusedRows = rows.filter((r) => r.state === 'ok' && r.articles === 0 && r.events === 0 && r.label !== carrier?.label);
  const result = enclosure.result;
  const missing = result?.enclosures.filter((e) => !e.matched_label) ?? [];
  const matchedLabels = new Set((result?.enclosures ?? []).map((e) => e.matched_label).filter(Boolean) as string[]);
  const notInList = result ? pdfs.filter((p) => p.label !== carrier?.label && !matchedLabels.has(p.label)) : [];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <ClipboardCheck size={18} className="text-primary-600" />
            PDFの点検
            <span className="text-xs font-normal text-slate-500">{newsletterTitle}</span>
          </h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600" aria-label="閉じる">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-6 text-sm">
          {/* 2. 同封物一覧との突き合わせ */}
          <section>
            <h3 className="font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <Sparkles size={15} className="text-primary-600" />
              入れ忘れがないか（関ヶ谷だよりの一覧と突き合わせ）
            </h3>
            <p className="text-xs text-slate-500 mb-2">
              {carrier ? `「${carrier.label}」` : '先頭のPDF'}に載っている今月の回覧物の一覧を AI に読ませ、登録済みPDFの名前と比べます。
            </p>
            {enclosure.state === 'idle' && (
              <button
                onClick={runEnclosureCheck}
                disabled={!carrier}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
              >
                <Sparkles size={14} /> 一覧と突き合わせる（AI）
              </button>
            )}
            {enclosure.state === 'running' && (
              <p className="flex items-center gap-2 text-slate-600">
                <Loader2 size={16} className="animate-spin" /> 関ヶ谷だよりを読んでいます（30秒ほどかかります）…
              </p>
            )}
            {enclosure.state === 'error' && (
              <div className="flex items-start gap-2 text-red-700 bg-red-50 border border-red-200 rounded p-3">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <div>
                  {enclosure.error}
                  <button onClick={runEnclosureCheck} className="ml-2 text-blue-600 hover:underline">もう一度</button>
                </div>
              </div>
            )}
            {enclosure.state === 'done' && result && (
              <div className="space-y-3">
                {!result.found ? (
                  <p className="text-slate-600 bg-slate-50 border border-slate-200 rounded p-3">
                    紙面の中に回覧物の一覧を見つけられませんでした。一覧が別の書類にある号は、目で確かめてください。
                  </p>
                ) : missing.length === 0 ? (
                  <p className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-3">
                    <CheckCircle2 size={16} /> 一覧の {result.enclosures.length} 件は、すべて登録済みです。
                  </p>
                ) : (
                  <div className="text-red-800 bg-red-50 border border-red-200 rounded p-3">
                    <p className="font-bold flex items-center gap-1.5 mb-1">
                      <AlertCircle size={16} /> 一覧にあるのに、登録が見つからない書類（{missing.length} 件）
                    </p>
                    <ul className="list-disc pl-5 space-y-0.5">
                      {missing.map((m, i) => (
                        <li key={i}>{m.name}</li>
                      ))}
                    </ul>
                    <p className="text-xs mt-2 text-red-700">名前が大きく違うだけのこともあります。登録済みの一覧と見比べてください。</p>
                  </div>
                )}
                {result.found && (
                  <details className="text-xs text-slate-600">
                    <summary className="cursor-pointer">一覧の全 {result.enclosures.length} 件と、対応する登録済みPDF</summary>
                    <table className="w-full mt-2 border-t border-slate-200">
                      <tbody>
                        {result.enclosures.map((e, i) => (
                          <tr key={i} className="border-b border-slate-100">
                            <td className="py-1 pr-2 align-top">{e.name}</td>
                            <td className={`py-1 align-top ${e.matched_label ? 'text-emerald-700' : 'text-red-700'}`}>{e.matched_label ?? '未登録'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                )}
                {result.found && notInList.length > 0 && (
                  <details className="text-xs text-slate-600">
                    <summary className="cursor-pointer">登録済みだが一覧に無いPDF（{notInList.length} 件。一覧に載らない書類や、名前の違いのことが多い）</summary>
                    <ul className="list-disc pl-5 mt-1 space-y-0.5">
                      {notInList.map((p, i) => (
                        <li key={i}>{p.label}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </section>

          {/* 1. 登録済みPDFの点検 */}
          <section>
            <h3 className="font-bold text-slate-700 mb-1">登録済みPDF（{rows.length} 件）が開けるか・使われているか</h3>
            {!usageLoaded ? (
              <p className="flex items-center gap-2 text-slate-600">
                <Loader2 size={16} className="animate-spin" /> 調べています…
              </p>
            ) : (
              <>
                {ngRows.length === 0 ? (
                  <p className="flex items-center gap-2 text-emerald-700 mb-2">
                    <CheckCircle2 size={16} /> すべて開けます。
                  </p>
                ) : (
                  <p className="flex items-center gap-2 text-red-700 mb-2">
                    <AlertCircle size={16} /> 開けないPDFが {ngRows.length} 件あります（削除して入れ直してください）。
                  </p>
                )}
                {unusedRows.length > 0 && (
                  <p className="text-xs text-slate-500 mb-2">記事にも予定にも使われていないPDFが {unusedRows.length} 件あります（回覧板PDFとして読めるだけの書類なら問題ありません）。</p>
                )}
                <table className="w-full text-xs border-t border-slate-200">
                  <thead>
                    <tr className="text-slate-500">
                      <th className="text-left py-1 font-medium">名前</th>
                      <th className="text-right py-1 font-medium whitespace-nowrap">開ける</th>
                      <th className="text-right py-1 font-medium whitespace-nowrap">大きさ</th>
                      <th className="text-right py-1 font-medium whitespace-nowrap">記事</th>
                      <th className="text-right py-1 font-medium whitespace-nowrap">予定</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className={`border-b border-slate-100 ${r.state === 'ng' ? 'bg-red-50 text-red-800' : ''}`}>
                        <td className="py-1 pr-2">{r.label || r.url.split('/').pop()}</td>
                        <td className="py-1 text-right">{r.state === 'ok' ? '○' : '×'}</td>
                        <td className="py-1 text-right whitespace-nowrap">{r.sizeKb != null ? `${r.sizeKb}KB` : '-'}</td>
                        <td className="py-1 text-right">{r.articles || '-'}</td>
                        <td className="py-1 text-right">{r.events || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>
        </div>

        <div className="p-3 border-t border-slate-200 flex justify-end">
          <button onClick={onClose} className="px-4 py-1.5 border border-slate-300 rounded hover:bg-slate-50">閉じる</button>
        </div>
      </div>
    </div>
  );
};
