/**
 * PDFメタデータ入力ダイアログ
 * 
 * AIが提案したタイトル/号数をユーザーが確認・編集できます。
 * PDFから記事を抽出する前に、広報誌の基本情報を入力します。
 */

import React, { useState, useEffect } from 'react';
import { X, Sparkles, FileText } from 'lucide-react';

interface PDFMetadataDialogProps {
  isOpen: boolean;
  fileName: string;
  suggestedTitle: string;
  suggestedIssueNumber: string;
  onConfirm: (title: string, issueNumber: string) => void;
  onCancel: () => void;
}

export const PDFMetadataDialog: React.FC<PDFMetadataDialogProps> = ({
  isOpen,
  fileName,
  suggestedTitle,
  suggestedIssueNumber,
  onConfirm,
  onCancel,
}) => {
  console.log('🔍 PDFMetadataDialog: 受け取ったprops:', {
    isOpen,
    fileName,
    suggestedTitle,
    suggestedIssueNumber,
  });

  const [title, setTitle] = useState(suggestedTitle);
  const [issueNumber, setIssueNumber] = useState(suggestedIssueNumber);

  // 提案が変わったら反映
  useEffect(() => {
    console.log('🔍 PDFMetadataDialog: useEffect実行。新しい提案値:', {
      suggestedTitle,
      suggestedIssueNumber,
    });
    setTitle(suggestedTitle);
    setIssueNumber(suggestedIssueNumber);
    console.log('🔍 PDFMetadataDialog: state更新後:', { title: suggestedTitle, issueNumber: suggestedIssueNumber });
  }, [suggestedTitle, suggestedIssueNumber]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (!title) {
      alert('タイトルを入力してください');
      return;
    }
    onConfirm(title, issueNumber);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
            <FileText size={20} className="text-primary-600" />
            PDF情報を入力
          </h3>
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-600"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mb-4 p-3 bg-slate-50 rounded-lg">
          <p className="text-sm text-slate-600">ファイル名</p>
          <p className="text-sm font-medium text-slate-800">{fileName}</p>
        </div>

        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
              <Sparkles size={16} className="text-purple-600" />
              タイトル（AI提案）
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="例: 関ヶ谷だより"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
              <Sparkles size={16} className="text-purple-600" />
              号数（AI提案）
            </label>
            <input
              type="text"
              value={issueNumber}
              onChange={(e) => setIssueNumber(e.target.value)}
              className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="例: 第123号、2025年1月号"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium"
          >
            キャンセル
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium"
          >
            確定して記事を抽出
          </button>
        </div>
      </div>
    </div>
  );
};
