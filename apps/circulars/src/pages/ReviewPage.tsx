/**
 * 担当者向け 公開前確認ページ
 *
 * /review/<token> でアクセスする。ログイン不要。
 * 住民向けと同じ見た目のプレビューを表示し、画面下部のバーから
 * 「承認」または「修正依頼」を送信できる。
 */

import React, { useEffect, useState } from 'react';
import {
  Newsletter,
  getNewsletterByReviewToken,
  submitReview,
  type ReviewVerdict,
} from '@cc-saas/shared';
import { CheckCircle2, MessageSquareWarning, Loader2, AlertCircle, ClipboardCheck } from 'lucide-react';
import CircularsView from '@/components/public/CircularsView';
import { showToast, appConfirm } from '@/components/ui/feedback';

type PageState = 'loading' | 'invalid' | 'ready' | 'submitting' | 'done';

export default function ReviewPage() {
  const token = window.location.pathname.match(/^\/review\/([^/]+)/)?.[1] ?? null;

  const [pageState, setPageState] = useState<PageState>('loading');
  const [newsletter, setNewsletter] = useState<Newsletter | null>(null);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [comment, setComment] = useState('');
  const [reviewerName, setReviewerName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setPageState('invalid');
      return;
    }
    getNewsletterByReviewToken(token)
      .then((data) => {
        if (!data) {
          setPageState('invalid');
        } else {
          setNewsletter(data);
          setPageState('ready');
        }
      })
      .catch(() => setPageState('invalid'));
  }, [token]);

  const handleSubmit = async (verdict: ReviewVerdict) => {
    if (!token) return;
    if (verdict === 'changes_requested' && !comment.trim()) {
      showToast('修正してほしい内容をコメント欄にご記入ください', 'info');
      return;
    }
    if (verdict === 'approved' && !(await appConfirm({
      title: 'この内容で承認しますか？',
      message: '承認すると、担当の方が回覧板を公開できるようになります。',
      confirmLabel: '承認する',
    }))) return;

    setPageState('submitting');
    setError(null);
    try {
      const updated = await submitReview(token, verdict, comment, reviewerName);
      setNewsletter(updated);
      setPageState('done');
    } catch (err: any) {
      setError(err?.message || '送信に失敗しました。時間をおいて再度お試しください。');
      setPageState('ready');
    }
  };

  if (pageState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 size={32} className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (pageState === 'invalid' || !newsletter) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="bg-white rounded-xl shadow p-8 max-w-md text-center">
          <AlertCircle size={40} className="text-red-500 mx-auto mb-4" />
          <h1 className="text-lg font-bold text-slate-800 mb-2">このリンクは無効です</h1>
          <p className="text-sm text-slate-600">
            確認用リンクが古くなっているか、取り下げられた可能性があります。
            お手数ですが、リンクを送った担当の方にご連絡ください。
          </p>
        </div>
      </div>
    );
  }

  // すでに公開済み
  if (newsletter.status === 'published') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="bg-white rounded-xl shadow p-8 max-w-md text-center">
          <CheckCircle2 size={40} className="text-green-500 mx-auto mb-4" />
          <h1 className="text-lg font-bold text-slate-800 mb-2">この回覧板は公開済みです</h1>
          <p className="text-sm text-slate-600 mb-4">「{newsletter.title}」はすでに住民向けに公開されています。</p>
          <a href="/" className="inline-block px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition">
            公開ページを見る
          </a>
        </div>
      </div>
    );
  }

  // 回答完了（今回の送信 or 既に回答済みのリンクを再訪問）
  if (pageState === 'done' || newsletter.review_status !== 'pending') {
    const approved = newsletter.review_status === 'approved';
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="bg-white rounded-xl shadow p-8 max-w-md text-center">
          {approved ? (
            <CheckCircle2 size={40} className="text-green-500 mx-auto mb-4" />
          ) : (
            <MessageSquareWarning size={40} className="text-orange-500 mx-auto mb-4" />
          )}
          <h1 className="text-lg font-bold text-slate-800 mb-2">
            {approved ? '承認しました' : '修正依頼を送りました'}
          </h1>
          <p className="text-sm text-slate-600">
            {approved
              ? `「${newsletter.title}」の確認ありがとうございました。このままお待ちください。`
              : `「${newsletter.title}」への修正依頼を担当の方に伝えました。ご協力ありがとうございました。`}
          </p>
          {newsletter.review_comment && (
            <div className="mt-4 p-3 bg-slate-50 rounded-lg text-sm text-slate-700 text-left whitespace-pre-wrap">
              {newsletter.review_comment}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 確認待ち: プレビュー + 承認バー
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-amber-50 border-b border-amber-200 px-4 py-3 sticky top-0 z-40">
        <div className="max-w-3xl mx-auto flex items-center gap-2 text-amber-800">
          <ClipboardCheck size={20} className="shrink-0" />
          <div className="text-sm">
            <span className="font-bold">公開前の確認をお願いします</span>
            <span className="hidden sm:inline">
              　内容を確認して、ページ下のボタンで回答してください（まだ住民には公開されていません）
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto p-4 pb-52">
        <CircularsView isSimpleMode={false} previewNewsletterId={newsletter.id} />
      </main>

      {/* 回答バー */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] z-40">
        <div className="max-w-3xl mx-auto p-4 space-y-3">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>
          )}

          {showRejectForm && (
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="修正してほしい内容を書いてください（例: 日付が間違っています）"
              rows={3}
              className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          )}

          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <input
              type="text"
              value={reviewerName}
              onChange={(e) => setReviewerName(e.target.value)}
              placeholder="お名前（任意）"
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm sm:w-40 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <div className="flex gap-2 flex-1">
              {showRejectForm ? (
                <>
                  <button
                    onClick={() => setShowRejectForm(false)}
                    disabled={pageState === 'submitting'}
                    className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-lg font-medium hover:bg-slate-200 transition"
                  >
                    戻る
                  </button>
                  <button
                    onClick={() => handleSubmit('changes_requested')}
                    disabled={pageState === 'submitting'}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-500 text-white rounded-lg font-bold hover:bg-orange-600 disabled:opacity-50 transition"
                  >
                    <MessageSquareWarning size={18} />
                    修正依頼を送る
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setShowRejectForm(true)}
                    disabled={pageState === 'submitting'}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-orange-300 text-orange-600 rounded-lg font-medium hover:bg-orange-50 disabled:opacity-50 transition"
                  >
                    <MessageSquareWarning size={18} />
                    修正をお願いする
                  </button>
                  <button
                    onClick={() => handleSubmit('approved')}
                    disabled={pageState === 'submitting'}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 disabled:opacity-50 transition"
                  >
                    {pageState === 'submitting' ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                    この内容で承認する
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
