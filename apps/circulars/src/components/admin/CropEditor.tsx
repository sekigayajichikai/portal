/**
 * 正方形の切り出し編集（拡大縮小＋ドラッグで位置決め）
 *
 * チラシPDFの1ページ目や記事の写真から、一押しカードに載せる正方形を決める。
 * - プレビューをドラッグすると位置が動く（マウス・タッチ両対応）
 * - スライダー（またはホイール）で拡大縮小
 * - 「上」「中央」「下」で位置をすぐ揃えられる
 */

import React, { useEffect, useRef } from 'react';
import { type HeroCrop, MIN_SCALE, MAX_SCALE, cropRect } from './heroCrop';

interface CropEditorProps {
  /** 元画像（PDF を描いた canvas か、写真を描いた canvas） */
  source: HTMLCanvasElement;
  value: HeroCrop;
  onChange: (crop: HeroCrop) => void;
  /** プレビューの一辺（px） */
  size?: number;
}

export const CropEditor: React.FC<CropEditorProps> = ({ source, value, onChange, size = 220 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; crop: HeroCrop } | null>(null);
  const portrait = source.height >= source.width;

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);
    const { sx, sy, side } = cropRect(source.width, source.height, value);
    ctx.drawImage(source, sx, sy, side, side, 0, 0, size, size);
  }, [source, value, size]);

  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, crop: value };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current) return;
    const { side } = cropRect(source.width, source.height, value);
    // プレビュー上の移動量（px）→ 元画像上の移動量 → 動かせる範囲に対する割合
    const perPx = side / size;
    const rangeX = source.width - side;
    const rangeY = source.height - side;
    const dx = (e.clientX - drag.current.x) * perPx;
    const dy = (e.clientY - drag.current.y) * perPx;
    onChange({
      ...value,
      x: rangeX > 0 ? clamp01(drag.current.crop.x - dx / rangeX) : 0,
      y: rangeY > 0 ? clamp01(drag.current.crop.y - dy / rangeY) : 0,
    });
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, value.scale * (e.deltaY < 0 ? 1.08 : 1 / 1.08)));
    onChange({ ...value, scale: Number(next.toFixed(3)) });
  };

  const setPos = (p: number) => onChange(portrait ? { ...value, y: p } : { ...value, x: p });

  return (
    <div className="flex gap-3 items-start">
      <canvas
        ref={canvasRef}
        className="rounded border border-slate-300 shrink-0 cursor-grab active:cursor-grabbing touch-none"
        style={{ width: size, height: size }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        title="ドラッグで位置、ホイールで拡大縮小"
      />
      <div className="flex-1 min-w-0 text-xs space-y-1.5">
        <label className="block">
          <span className="text-slate-500">拡大 ×{value.scale.toFixed(1)}</span>
          <input
            type="range"
            min={MIN_SCALE * 100}
            max={MAX_SCALE * 100}
            value={Math.round(value.scale * 100)}
            onChange={(e) => onChange({ ...value, scale: Number(e.target.value) / 100 })}
            className="w-full"
          />
        </label>
        <div className="flex flex-wrap gap-1">
          {(portrait ? [['上', 0], ['中央', 0.5], ['下', 1]] : [['左', 0], ['中央', 0.5], ['右', 1]]).map(([label, p]) => (
            <button key={String(label)} type="button" onClick={() => setPos(Number(p))} className="px-2 py-0.5 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-100">
              {label}
            </button>
          ))}
          <button type="button" onClick={() => onChange({ x: 0, y: 0, scale: 1 })} className="px-2 py-0.5 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-100">
            リセット
          </button>
        </div>
        <p className="text-slate-400">プレビューをドラッグで位置、スライダーかホイールで拡大縮小。</p>
      </div>
    </div>
  );
};
