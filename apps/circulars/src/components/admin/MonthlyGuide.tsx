/**
 * 今月の流れガイド
 *
 * 管理画面を開いた瞬間に「今どこまで終わっていて、次に何をすればいいか」が
 * 分かるステップ表示。最新の回覧板（下書き優先）の状態から自動判定する。
 *
 * 大きな流れ: ① 号を作る・PDF追加 → ② 内容づくり → ③ 担当者に確認 → ④ 公開
 * 「② 内容づくり」では、実際の作業（自治会/地域のお知らせ・写真・発行元・
 * イベント抽出・並び順）をチェックリストとして展開表示する。
 */

import React, { useEffect, useState } from 'react';
import { getNewsletters, getArticlesByNewsletterId, getEventCards } from '@cc-saas/shared';
import { Newsletter, Article } from '@cc-saas/shared/types';
import { Check, PartyPopper, ArrowRight, Circle, AlertTriangle } from 'lucide-react';

type NewsletterWithCount = Newsletter & { article_count: number };

interface MonthlyGuideProps {
  /** 「新しく作る」を押したとき（新規作成タブへ） */
  onCreateNew: () => void;
  /** 「開いて続きをやる」を押したとき（該当の号を開く） */
  onOpenNewsletter: (id: string) => void;
  /** データ再取得のきっかけ（タブ切り替え等で増える値） */
  refreshKey?: number;
  /** 編集中の号（指定時は最新下書きではなくこの号を対象にガイド表示） */
  focusNewsletterId?: string | null;
  /** 詳細チェックリストを表示するか（編集中のみtrue。一覧では概要のみ） */
  detailed?: boolean;
}

/** ガイドの判定結果 */
interface GuideState {
  /** 0=作成前, 1=PDF追加, 2=内容づくり, 3=承認待ち/修正対応, 4=公開, 5=完了 */
  step: number;
  message: string;
  actionLabel: string | null;
  targetId: string | null;
}

/** 内容づくりチェックリストの1項目 */
interface ChecklistItem {
  /** 'done'=完了(緑) | 'todo'=未(グレー) | 'warn'=要対応(黄) | 'info'=手動確認(青) */
  state: 'done' | 'todo' | 'warn' | 'info';
  label: string;
  hint: string;
  /** 直前の項目の子（地域のお知らせ配下など）としてツリー状にインデント表示するか */
  indent?: boolean;
}

const STEPS = ['号を作る・PDF追加', '内容づくり', '担当者に確認', '公開'];

/**
 * レポート系（「関ヶ谷レポート」等）は回覧板とは別トラックなので、
 * 回覧板の進捗ガイドからは除外する（PublicPage の除外タイトルと揃える）。
 */
const REPORT_NEWSLETTER_TITLES = ['関ヶ谷レポート'];
const isReportNewsletter = (n: Newsletter): boolean =>
  REPORT_NEWSLETTER_TITLES.includes(n.title);

/**
 * 号の新しさを表す数値キー（大きいほど新しい）。
 * まずタイトル「YYYY年M月号」を優先（発行日が同じ/誤っていても正しく並ぶ）、
 * 無ければ発行日(issue_date)から算出する。
 */
function newsletterMonthKey(n: Newsletter): number {
  const m = n.title.match(/(\d{4})\s*年\s*(\d{1,2})\s*月/);
  if (m) return Number(m[1]) * 100 + Number(m[2]);
  const d = (n.issue_date || '').match(/(\d{4})-(\d{2})/);
  if (d) return Number(d[1]) * 100 + Number(d[2]);
  return 0;
}

function judge(newsletters: NewsletterWithCount[], focusId?: string | null): GuideState {
  // タイトルの年月（無ければ発行日）が新しい順に並べ、最新の号を対象にする
  // （発行日が同じ/誤っている複数下書きでも正しく最新を選ぶ）
  const active = newsletters
    .filter((n) => n.status !== 'archived' && !isReportNewsletter(n))
    .slice()
    .sort((a, b) => newsletterMonthKey(b) - newsletterMonthKey(a));
  // 開いている/編集中の号が下書きなら、それを対象にする（無ければ最新の下書き）
  const focus = focusId ? active.find((n) => n.id === focusId && n.status === 'draft') : undefined;
  const draft = focus ?? active.find((n) => n.status === 'draft');
  const published = active.find((n) => n.status === 'published');

  if (!draft && !published) {
    return {
      step: 0,
      message: 'まだ回覧板がありません。まずは今月の回覧板を作りましょう。',
      actionLabel: '回覧板を作る',
      targetId: null,
    };
  }

  if (!draft && published) {
    return {
      step: 5,
      message: `「${published.title}」は公開済みです。次の号の時期になったら「回覧板を作る」から始めましょう。`,
      actionLabel: '次の号を作る',
      targetId: null,
    };
  }

  const d = draft!;
  if (d.article_count === 0) {
    return {
      step: 1,
      message: `「${d.title}」にまだ記事がありません。PDFを追加して記事を作りましょう。`,
      actionLabel: '開いて続きをやる',
      targetId: d.id,
    };
  }

  switch (d.review_status) {
    case 'pending':
      return {
        step: 3,
        message: `「${d.title}」は担当者の確認待ちです。まだリンクを送っていなければ、号を開いて「確認リンクを表示」からコピーして送ってください。`,
        actionLabel: '開いて確認リンクを見る',
        targetId: d.id,
      };
    case 'approved':
      return {
        step: 4,
        message: `「${d.title}」は承認済みです！「公開する」ボタンを押せば住民に公開されます。`,
        actionLabel: '開いて公開する',
        targetId: d.id,
      };
    case 'changes_requested':
      return {
        step: 2,
        message: `「${d.title}」に修正依頼が届いています。内容を直して、もう一度確認を依頼しましょう。`,
        actionLabel: '開いて修正する',
        targetId: d.id,
      };
    default:
      return {
        step: 2,
        message: `「${d.title}」の内容づくり中です。記事・写真・イベントなどをそろえて、「確認を依頼」で担当者に見てもらいましょう。`,
        actionLabel: '開いて続きをやる',
        targetId: d.id,
      };
  }
}

/** 下書きの中身から「内容づくり」チェックリストを組み立てる */
function buildChecklist(
  draft: NewsletterWithCount,
  articles: Article[],
  eventCardCount: number
): ChecklistItem[] {
  const official = articles.filter((a) => a.article_type === 'official');
  const localInfo = articles.filter((a) => a.article_type === 'local-info');
  const officialWithPhoto = official.filter((a) => a.thumbnail_url);

  const pdfEntries: any[] = draft.source_pdf_urls || [];
  const publisherUnset = pdfEntries.filter(
    (e) => typeof e !== 'string' && !e.publisher
  ).length;

  // 地域のお知らせは「一括インポート」だと記事(local-info)を作らず attachment PDF として登録される。
  // そのため attachment PDF の件数で数える（記事化された分もあるので多い方を採用）。
  const localInfoPdfCount = pdfEntries.filter(
    (e) => typeof e !== 'string' && e.type === 'attachment'
  ).length;
  const localInfoCount = Math.max(localInfoPdfCount, localInfo.length);

  return [
    {
      state: official.length > 0 ? 'done' : 'todo',
      label: `自治会のお知らせ（${official.length}件）`,
      hint: '関ヶ谷だより・会報ふれあいなどの回覧板PDFから、詳しい要約つきで抽出した記事',
    },
    {
      state: official.length === 0 ? 'todo' : officialWithPhoto.length > 0 ? 'done' : 'todo',
      indent: true,
      label: `記事に写真を追加（${officialWithPhoto.length}件）`,
      // 全記事に写真を付ける必要はないため分母表記(/◯件)は出さない
      hint: '「画像切り抜き」でPDFから写真を切り出して記事に付けられます（全記事につける必要はありません）',
    },
    {
      state: localInfoCount > 0 ? 'done' : 'todo',
      label: `地域のお知らせ（${localInfoCount}件）`,
      hint: 'チラシ・ポスターなどのPDFを添付登録したもの（学校だより・にしかぜ等）。ない月はスキップでOK',
    },
    {
      state: publisherUnset === 0 ? 'done' : 'warn',
      indent: true,
      label:
        publisherUnset === 0
          ? '発行元の設定（すべて設定済み）'
          : `発行元が未設定のPDFが${publisherUnset}件`,
      hint: 'PDF一覧の「＋発行元を設定」から。PDF読み込み時のAI提案でも設定されます',
    },
    {
      state: 'info',
      indent: true,
      label: 'PDFの並び順を確認',
      hint: '読んでほしい順になっているか。PDF一覧でドラッグ（または上へ/下へ）で調整',
    },
    {
      state: eventCardCount > 0 ? 'done' : 'todo',
      label: `イベント予定の抽出（${eventCardCount}件）`,
      hint: '「イベント」欄の「AIで抽出」を押すと、記事やPDFから日程を拾ってカードにできます',
    },
  ];
}

const CHECK_ICONS = {
  done: <Check size={14} className="text-white" />,
  todo: <Circle size={10} className="text-slate-300" />,
  warn: <AlertTriangle size={12} className="text-white" />,
  info: <Circle size={10} className="text-blue-300" />,
} as const;

const CHECK_BG = {
  done: 'bg-green-500',
  todo: 'bg-slate-100',
  warn: 'bg-amber-500',
  info: 'bg-blue-100',
} as const;

export const MonthlyGuide: React.FC<MonthlyGuideProps> = ({ onCreateNew, onOpenNewsletter, refreshKey, focusNewsletterId, detailed = false }) => {
  const [guide, setGuide] = useState<GuideState | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[] | null>(null);
  // URLハッシュ（#号ID＝今開いている号）の変化に追従するためのカウンタ
  const [hashTick, setHashTick] = useState(0);

  useEffect(() => {
    const onHash = () => setHashTick((t) => t + 1);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const data = await getNewsletters();
        // 明示指定(編集中)が無ければ、URLハッシュの号（今開いている号）を対象にする
        const hashId = window.location.hash.replace('#', '') || null;
        const effectiveFocus = focusNewsletterId || hashId;
        const g = judge(data, effectiveFocus);
        setGuide(g);

        // 編集中(detailed)かつ内容づくり段階のときだけ、詳細チェックリストを作る（一覧では概要のみ）
        if (detailed && (g.step === 1 || g.step === 2) && g.targetId) {
          const draft = data.find((n) => n.id === g.targetId);
          if (draft) {
            const [articles, cards] = await Promise.all([
              getArticlesByNewsletterId(draft.id),
              getEventCards(draft.id).catch(() => []),
            ]);
            setChecklist(buildChecklist(draft, articles, cards.length));
            return;
          }
        }
        setChecklist(null);
      } catch {
        setGuide(null); // 読み込めないときはガイド非表示（一覧側でエラー表示される）
        setChecklist(null);
      }
    })();
  }, [refreshKey, focusNewsletterId, hashTick, detailed]);

  if (!guide) return null;

  const currentIdx = guide.step === 0 ? 0 : Math.min(guide.step - 1, 3);
  const allDone = guide.step === 5;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5">
      {/* ステップ */}
      <div className="flex items-center gap-1 sm:gap-2 mb-3 overflow-x-auto">
        {STEPS.map((label, i) => {
          const done = allDone || i < currentIdx;
          const current = !allDone && i === currentIdx;
          return (
            <React.Fragment key={label}>
              {i > 0 && <div className={`h-0.5 w-3 sm:w-6 shrink-0 ${done || current ? 'bg-primary-400' : 'bg-slate-200'}`} />}
              <div className="flex items-center gap-1.5 shrink-0">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    done
                      ? 'bg-green-500 text-white'
                      : current
                      ? 'bg-primary-600 text-white ring-4 ring-primary-100'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {done ? <Check size={14} /> : i + 1}
                </div>
                <span className={`text-xs sm:text-sm ${current ? 'font-bold text-slate-800' : done ? 'text-slate-600' : 'text-slate-400'}`}>
                  {label}
                </span>
              </div>
            </React.Fragment>
          );
        })}
        {allDone && <PartyPopper size={20} className="text-amber-500 ml-1 shrink-0" />}
      </div>

      {/* 案内とアクション */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="text-sm text-slate-700 flex-1">{guide.message}</p>
        {guide.actionLabel && (
          <button
            onClick={() => (guide.targetId ? onOpenNewsletter(guide.targetId) : onCreateNew())}
            className="shrink-0 flex items-center justify-center gap-1.5 px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition"
          >
            {guide.actionLabel}
            <ArrowRight size={16} />
          </button>
        )}
      </div>

      {/* 内容づくりチェックリスト */}
      {checklist && (
        <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-y-1.5">
          {checklist.map((item) => (
            <div
              key={item.label}
              className={`flex items-start gap-2 ${item.indent ? 'ml-3 pl-4 border-l border-slate-200' : ''}`}
            >
              {item.indent && (
                <span className="text-slate-300 text-xs mt-0.5 -ml-4 mr-0.5 select-none">└</span>
              )}
              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${CHECK_BG[item.state]}`}>
                {CHECK_ICONS[item.state]}
              </div>
              <div className="min-w-0">
                <p className={`text-sm ${item.state === 'warn' ? 'font-bold text-amber-700' : item.state === 'done' ? 'text-slate-700' : 'text-slate-600'}`}>
                  {item.label}
                </p>
                <p className="text-xs text-slate-400">{item.hint}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
