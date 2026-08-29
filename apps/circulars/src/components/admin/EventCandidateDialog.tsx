/**
 * イベント候補確認ダイアログコンポーネント
 *
 * 回覧板の記事群からAIが抽出したイベント候補を一覧表示し、
 * 人が確認・修正した上でイベントカードとして登録するダイアログです。
 * book-system（自治会カレンダー）連携用のJSONコピー機能も備えます。
 */

import React, { useEffect, useState } from 'react';
import {
  extractEventCandidates,
  addEventCard,
  type EventCandidate,
  type EventCard,
} from '@cc-saas/shared';
import { Newsletter, Article } from '@cc-saas/shared/types';
import { Loader2, AlertCircle, X, Sparkles, Copy, Check } from 'lucide-react';
import { ProcessingIndicator } from '@/components/ui/feedback';

/**
 * 編集可能なイベント候補（選択状態付き）
 */
interface EditableCandidate extends EventCandidate {
  selected: boolean;
  /** 記事へのリンクを付けるか（読者側の「詳しく読む」の有無。AIのhas_details判定が初期値） */
  linkArticle: boolean;
}

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
  const [isExtracting, setIsExtracting] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  /**
   * マウント時にAI抽出を実行
   */
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const results = await extractEventCandidates(articles, newsletter.issue_date);
        if (cancelled) return;
        setCandidates(results.map((c) => ({
          ...c,
          selected: true,
          linkArticle: c.article_index !== null && c.has_details,
        })));
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message ?? 'イベント候補の抽出に失敗しました');
      } finally {
        if (!cancelled) setIsExtracting(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [articles, newsletter.issue_date]);

  /**
   * 候補のフィールドを更新
   */
  const updateCandidate = (index: number, updates: Partial<EditableCandidate>) => {
    setCandidates((prev) => prev.map((c, i) => (i === index ? { ...c, ...updates } : c)));
  };

  /**
   * 既存イベントカードとの重複判定（同一日付＋同一タイトル）
   */
  const isDuplicate = (c: EventCandidate): boolean =>
    existingCards.some((card) => card.event_date === c.event_date && card.title === c.title);

  const selectedCandidates = candidates.filter((c) => c.selected);

  /**
   * 選択した候補をイベントカードとして登録
   */
  const handleRegister = async () => {
    if (selectedCandidates.length === 0) return;
    setIsRegistering(true);
    setError(null);
    try {
      for (let i = 0; i < selectedCandidates.length; i++) {
        const c = selectedCandidates[i];
        await addEventCard({
          newsletter_id: newsletter.id,
          title: c.title,
          event_date: c.event_date,
          event_time: c.event_time,
          event_location: c.event_location,
          linked_article_id:
            c.linkArticle && c.article_index !== null ? articles[c.article_index]?.id ?? null : null,
          display_order: existingCards.length + i,
        });
      }
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
          </h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        {/* 本文 */}
        <div className="flex-1 overflow-y-auto p-4">
          {isExtracting ? (
            <div className="py-8">
              <ProcessingIndicator
                label="AIが記事からイベントの予定を読み取っています…"
                sublabel="記事の量によって1分ほどかかることがあります。このままお待ちください。"
              />
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-12">
              カレンダーに登録できそうなイベントは見つかりませんでした
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 mb-3">
                内容を確認・修正し、登録するものにチェックを入れてください（{candidates.length}件抽出）
              </p>
              {candidates.map((c, i) => {
                const linkedArticle = c.article_index !== null ? articles[c.article_index] : undefined;
                const duplicate = isDuplicate(c);
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
                        <input
                          type="text"
                          value={c.event_location ?? ''}
                          placeholder="場所（例: 自治会館）"
                          onChange={(e) => updateCandidate(i, { event_location: e.target.value || null })}
                          className="text-sm border border-slate-300 rounded px-2 py-1 w-full"
                        />
                        <div className="flex items-center gap-2 flex-wrap">
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
                          {duplicate && (
                            <span className="text-xs text-amber-600 font-medium">⚠ 同じ日付・名前のカードが既にあります</span>
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

        {/* フッター */}
        {!isExtracting && candidates.length > 0 && (
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
                {isRegistering ? '登録しています…' : `選択した${selectedCandidates.length}件を登録`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
