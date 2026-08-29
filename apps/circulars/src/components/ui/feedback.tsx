/**
 * アプリ内フィードバックUI（トースト通知・確認ダイアログ）
 *
 * ブラウザ標準の alert() / confirm() の代替。
 * ブラウザ標準ダイアログは「〜.vercel.app の内容」という見出しが付いて
 * 利用者を不安にさせるため、アプリ内の通知に統一する。
 *
 * 使い方:
 * - <FeedbackHost /> を App 直下に1つだけマウントする
 * - showToast('保存しました')            … 緑の通知（4秒で消える）
 * - showError('保存できませんでした…')   … 赤の通知（8秒で消える・手動で閉じられる）
 * - await appConfirm({ title: '公開しますか？', ... }) … 確認ダイアログ（true/false）
 */

import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X, Loader2 } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

export interface ConfirmOptions {
  /** ダイアログの見出し（例: この回覧板を公開しますか？） */
  title: string;
  /** 補足説明（実行すると何が起きるか） */
  message?: string;
  /** 実行ボタンのラベル（例: 公開する）。既定は「OK」 */
  confirmLabel?: string;
  /** キャンセルボタンのラベル。既定は「キャンセル」 */
  cancelLabel?: string;
  /** 取り返しのつかない操作（削除など）は true で赤いボタンにする */
  danger?: boolean;
}

export interface PromptOptions {
  /** ダイアログの見出し（例: 発行元を入力） */
  title: string;
  /** 補足説明 */
  message?: string;
  /** 入力欄のプレースホルダー */
  placeholder?: string;
  /** 初期値 */
  defaultValue?: string;
  /** 決定ボタンのラベル。既定は「OK」 */
  confirmLabel?: string;
  /** 複数行入力にする場合 true */
  multiline?: boolean;
  /** 選択肢（あればタップで選べるリストを表示し、自由入力欄も併設） */
  choices?: string[];
}

let toastSeq = 0;
let pushToastImpl: ((toast: ToastItem) => void) | null = null;
let openConfirmImpl: ((options: ConfirmOptions, resolve: (ok: boolean) => void) => void) | null = null;
let openPromptImpl: ((options: PromptOptions, resolve: (value: string | null) => void) => void) | null = null;

/** 通知を表示する（type省略時は緑の成功通知） */
export function showToast(message: string, type: ToastType = 'success'): void {
  if (pushToastImpl) {
    pushToastImpl({ id: ++toastSeq, type, message });
  } else {
    console.warn('FeedbackHostがマウントされていません:', message);
  }
}

/** エラー通知を表示する（赤・長め表示） */
export function showError(message: string): void {
  showToast(message, 'error');
}

/**
 * アプリ内確認ダイアログを表示し、ユーザーの選択を返す
 *
 * @returns 実行ボタンが押されたら true、キャンセルなら false
 */
export function appConfirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (openConfirmImpl) {
      openConfirmImpl(options, resolve);
    } else {
      // FeedbackHost未マウント時の保険
      resolve(window.confirm(options.title));
    }
  });
}

/**
 * アプリ内入力ダイアログを表示する（ブラウザ標準 prompt() の代替）
 *
 * @returns 入力された文字列。キャンセル時は null
 */
export function appPrompt(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    if (openPromptImpl) {
      openPromptImpl(options, resolve);
    } else {
      // FeedbackHost未マウント時の保険
      resolve(window.prompt(options.title, options.defaultValue ?? ''));
    }
  });
}

/**
 * 作業中インジケーター
 *
 * 時間のかかる処理（AI抽出・アップロード等）の間、
 * 「いま何をしているか」と経過時間を表示して利用者を安心させる。
 * 経過時間が動き続けることが「ちゃんと動いている」ことの合図になる。
 */
export const ProcessingIndicator: React.FC<{
  /** いま何をしているか（例: AIが記事を読み取っています…） */
  label: string;
  /** 補足（例: 内容によって1〜3分かかります） */
  sublabel?: string;
}> = ({ label, sublabel }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const mm = Math.floor(elapsed / 60);
  const ss = String(elapsed % 60).padStart(2, '0');

  return (
    <div className="bg-primary-50 border border-primary-200 rounded-xl p-4 flex items-center gap-3">
      <Loader2 size={22} className="animate-spin text-primary-600 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-primary-800">{label}</p>
        {sublabel && <p className="text-xs text-primary-700 mt-0.5">{sublabel}</p>}
      </div>
      <span className="text-xs tabular-nums text-primary-600 shrink-0">
        {mm}:{ss}
      </span>
    </div>
  );
};

const TOAST_STYLES: Record<ToastType, { box: string; icon: React.ReactNode }> = {
  success: {
    box: 'bg-green-600 text-white',
    icon: <CheckCircle2 size={20} className="shrink-0" />,
  },
  error: {
    box: 'bg-red-600 text-white',
    icon: <AlertCircle size={20} className="shrink-0" />,
  },
  info: {
    box: 'bg-slate-700 text-white',
    icon: <Info size={20} className="shrink-0" />,
  },
};

/**
 * トーストと確認ダイアログの描画ホスト（App直下に1つだけ置く）
 */
export const FeedbackHost: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<{
    options: ConfirmOptions;
    resolve: (ok: boolean) => void;
  } | null>(null);
  const [promptState, setPromptState] = useState<{
    options: PromptOptions;
    resolve: (value: string | null) => void;
  } | null>(null);
  const [promptValue, setPromptValue] = useState('');

  useEffect(() => {
    pushToastImpl = (toast) => {
      setToasts((prev) => [...prev, toast]);
      const ttl = toast.type === 'error' ? 8000 : 4000;
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, ttl);
    };
    openConfirmImpl = (options, resolve) => setConfirmState({ options, resolve });
    openPromptImpl = (options, resolve) => {
      setPromptValue(options.defaultValue ?? '');
      setPromptState({ options, resolve });
    };
    return () => {
      pushToastImpl = null;
      openConfirmImpl = null;
      openPromptImpl = null;
    };
  }, []);

  const closeConfirm = (ok: boolean) => {
    confirmState?.resolve(ok);
    setConfirmState(null);
  };

  const closePrompt = (value: string | null) => {
    promptState?.resolve(value);
    setPromptState(null);
  };

  return (
    <>
      {/* トースト通知（画面上部の中央） */}
      <div className="fixed top-4 inset-x-0 z-[100] flex flex-col items-center gap-2 px-4 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`${TOAST_STYLES[toast.type].box} pointer-events-auto flex items-start gap-2 rounded-xl px-4 py-3 shadow-lg max-w-md w-full sm:w-auto`}
          >
            {TOAST_STYLES[toast.type].icon}
            <span className="text-sm font-medium whitespace-pre-line flex-1">{toast.message}</span>
            <button
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="shrink-0 opacity-70 hover:opacity-100"
              aria-label="閉じる"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>

      {/* 入力ダイアログ */}
      {promptState && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-slate-800">{promptState.options.title}</h3>
            {promptState.options.message && (
              <p className="mt-2 text-sm text-slate-600 whitespace-pre-line">
                {promptState.options.message}
              </p>
            )}

            {/* 選択肢（タップで即決定） */}
            {promptState.options.choices && promptState.options.choices.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {promptState.options.choices.map((choice) => (
                  <button
                    key={choice}
                    onClick={() => closePrompt(choice)}
                    className={`px-3 py-2 rounded-lg border text-sm font-medium transition ${
                      choice === promptValue
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {choice}
                  </button>
                ))}
              </div>
            )}

            {promptState.options.multiline ? (
              <textarea
                autoFocus
                value={promptValue}
                onChange={(e) => setPromptValue(e.target.value)}
                placeholder={promptState.options.placeholder}
                rows={3}
                className="mt-4 w-full border border-slate-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            ) : (
              <input
                autoFocus
                type="text"
                value={promptValue}
                onChange={(e) => setPromptValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') closePrompt(promptValue);
                }}
                placeholder={promptState.options.placeholder || (promptState.options.choices?.length ? '上から選ぶか、ここに入力' : undefined)}
                className="mt-4 w-full border border-slate-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            )}

            <div className="mt-5 flex gap-3">
              <button
                onClick={() => closePrompt(null)}
                className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200 transition"
              >
                キャンセル
              </button>
              <button
                onClick={() => closePrompt(promptValue)}
                className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-primary-600 hover:bg-primary-700 transition"
              >
                {promptState.options.confirmLabel || 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 確認ダイアログ */}
      {confirmState && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-slate-800">{confirmState.options.title}</h3>
            {confirmState.options.message && (
              <p className="mt-2 text-sm text-slate-600 whitespace-pre-line">
                {confirmState.options.message}
              </p>
            )}
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => closeConfirm(false)}
                className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200 transition"
              >
                {confirmState.options.cancelLabel || 'キャンセル'}
              </button>
              <button
                onClick={() => closeConfirm(true)}
                className={`flex-1 px-4 py-3 rounded-xl font-bold text-white transition ${
                  confirmState.options.danger
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-primary-600 hover:bg-primary-700'
                }`}
              >
                {confirmState.options.confirmLabel || 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
