/**
 * PDF の切り抜き（ArticleCropPage / ImageCropPage）で、切り抜き枠の形（縦横比）を選ぶボタン列（2026-10-27）。
 * 「自由」なら今まで通り好きな形。形を選ぶと枠がその比率に固定され、ページの中央にその形の枠を出し直す。
 */
/* global HTMLImageElement */
import React from 'react';
import { centerCrop, makeAspectCrop, type Crop } from 'react-image-crop';

export const CROP_ASPECTS: Array<{ label: string; value: number | undefined }> = [
  { label: '自由', value: undefined },
  { label: '正方形', value: 1 },
  { label: '横長 4:3', value: 4 / 3 },
  { label: '横長 16:9', value: 16 / 9 },
  { label: '縦長 3:4', value: 3 / 4 },
];

/** 表示中の画像の中央に、その比率の枠（幅 70%）を作る。画像がまだ無ければ undefined（＝枠なし） */
export function centeredAspectCrop(img: HTMLImageElement | null, aspect: number | undefined): Crop | undefined {
  if (!img || !aspect || !img.width || !img.height) return undefined;
  return centerCrop(makeAspectCrop({ unit: '%', width: 70 }, aspect, img.width, img.height), img.width, img.height);
}

export const CropAspectButtons: React.FC<{ value: number | undefined; onChange: (aspect: number | undefined) => void }> = ({ value, onChange }) => (
  <div className="flex items-center gap-1 flex-wrap" title="切り抜き枠の形。選ぶと枠がその比率に固定されます">
    <span className="text-sm text-slate-600 mr-1">枠の形</span>
    {CROP_ASPECTS.map((a) => {
      const on = a.value === value;
      return (
        <button
          key={a.label}
          type="button"
          onClick={() => onChange(a.value)}
          className={`px-2.5 py-1 rounded-md text-sm font-medium border transition ${
            on ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
          }`}
        >
          {a.label}
        </button>
      );
    })}
  </div>
);
