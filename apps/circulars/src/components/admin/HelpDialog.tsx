/**
 * 「使い方」ダイアログ
 *
 * 引き継いだ人が、説明を受けなくても毎月の回覧板を作って公開できるように、
 * 画面の順に 6 手順と、困ったときの対処を出す。
 * 文面は docs/回覧板の作り方（引き継ぎ用）.md と同じにしておく（直すときは両方）。
 */

import React from 'react';
import { X, BookOpen } from 'lucide-react';

const STEPS: { title: string; body: string }[] = [
  { title: 'ログインする', body: '管理画面を開いてパスワードを入れます。パスワードは前任の管理担当から受け取ってください。' },
  { title: '「今月の流れ」のボタンを押す', body: '回覧板タブの一番上に、今やることと青いボタンが出ています。迷ったらそのボタンを押せば次に進めます。' },
  { title: 'PDFを追加する', body: '「自治会のお知らせ」は「関ヶ谷だより」「会報ふれあい」の回覧板PDF。AIが記事に分けます（1〜3分）。「地域のお知らせ」は学校だよりやチラシ。PDFのまま載ります。' },
  { title: '記事を見て直す', body: '記事の題名や文を直したいときは、記事を開いて「編集」。いらない記事は「削除」。間違えて消しても右上の「ゴミ箱」から戻せます。' },
  { title: '「確認を依頼」を押して、リンクを担当者に送る', body: '回覧板を開くと右上に「確認を依頼」があります。押すとリンクが出るので「LINEで送る」で確認担当の方に送ります。' },
  { title: '「承認済み」が付いたら「公開する」', body: '担当の方が承認すると、回覧板タブに「承認済み」の印が付き、右上のボタンが「公開する」に変わります。押せば住民のページに出ます。' },
];

const TROUBLE: { when: string; then: string }[] = [
  { when: '「AI の読み取りと LINE 配信の準備ができていません」と黄色く出る', then: '右上の「ログアウト」を押して、もう一度ログインします。それでも消えないときは管理担当に連絡してください。' },
  { when: 'PDFを選んでも入らない', then: 'PDFが10MBより大きいと入りません。小さくするか、ページを分けてください。' },
  { when: '間違えて消した', then: '右上の「ゴミ箱」を開き、「元に戻す」を押します。回覧板・記事・予定が戻せます。' },
];

export const HelpDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-[90] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <BookOpen size={20} className="text-primary-600" />
            毎月の回覧板の作り方
          </h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg" aria-label="閉じる">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-6">
          <ol className="space-y-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className="w-7 h-7 rounded-full bg-primary-600 text-white text-sm font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <div>
                  <p className="font-bold text-slate-800">{s.title}</p>
                  <p className="text-sm text-slate-600 mt-0.5">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="font-bold text-amber-800 mb-2">困ったとき</p>
            <ul className="space-y-2">
              {TROUBLE.map((t) => (
                <li key={t.when} className="text-sm">
                  <p className="font-medium text-slate-800">{t.when}</p>
                  <p className="text-slate-600">→ {t.then}</p>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-slate-500">
            印刷用の 1 枚手順書は、リポジトリの docs/回覧板の作り方（引き継ぎ用）.md にあります。
          </p>
        </div>

        <div className="p-4 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-primary-600 text-white rounded-lg font-bold hover:bg-primary-700 transition"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
