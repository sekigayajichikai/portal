/**
 * カード画像の切り出し編集（枠の形＋拡大縮小＋ドラッグで位置決め）
 *
 * チラシPDFの1ページ目や記事の写真から、一押しカードに載せる枠を決める。
 * - 枠の形: 正方形／横長4:3／横長16:9（横長の写真は既定で4:3）
 * - プレビューをドラッグすると位置が動く（マウス・タッチ両対応）
 * - スライダー（またはホイール）で拡大縮小
 * - 「上」「中央」「下」（横長なら左・中央・右）で位置をすぐ揃えられる
 */

import React, { useEffect, useRef } from 'react';
import { type HeroCrop, ASPECTS, MIN_SCALE, MAX_SCALE, cropRect, resolveCrop, aspectRatioOf } from './heroCrop';

interface CropEditorProps {
  /** 元画像（PDF を描いた canvas か、写真を描いた canvas） */
  source: HTMLCanvasElement;
  value: HeroCrop;
  onChange: (crop: HeroCrop) => void;
  /** プレビューの横幅（px） */
  size?: number;
}

export const CropEditor: React.FC<CropEditorProps> = ({ source, value, onChange, size = 220 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; crop: HeroCrop } | null>(null);
  const crop = resolveCrop(value, source.width, source.height);
  const ratio = aspectRatioOf(crop.aspect);
  const pw = size;
  const ph = Math.round(size / ratio);
  const { sw, sh } = cropRect(source.width, source.height, crop);
  // 枠を動かせる方向（元画像に対して枠が小さい方向だけ）
  const canMoveX = source.width - sw > 1;
  const canMoveY = source.height - sh > 1;

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = pw;
    c.height = ph;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, pw, ph);
    const r = cropRect(source.width, source.height, crop);
    ctx.drawImage(source, r.sx, r.sy, r.sw, r.sh, 0, 0, pw, ph);
  }, [source, crop.x, crop.y, crop.scale, crop.aspect, pw, ph]);

  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, crop };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current) return;
    // プレビュー上の移動量（px）→ 元画像上の移動量 → 動かせる範囲に対する割合
    const perPx = sw / pw;
    const rangeX = source.width - sw;
    const rangeY = source.height - sh;
    const dx = (e.clientX - drag.current.x) * perPx;
    const dy = (e.clientY - drag.current.y) * perPx;
    onChange({
      ...crop,
      x: rangeX > 0 ? clamp01(drag.current.crop.x - dx / rangeX) : 0,
      y: rangeY > 0 ? clamp01(drag.current.crop.y - dy / rangeY) : 0,
    });
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, crop.scale * (e.deltaY < 0 ? 1.08 : 1 / 1.08)));
    onChange({ ...crop, scale: Number(next.toFixed(3)) });
  };

  const setPos = (p: number) => onChange(canMoveY && !canMoveX ? { ...crop, y: p } : canMoveX && !canMoveY ? { ...crop, x: p } : { ...crop, x: p, y: p });
  const posLabels: Array<[string, number]> = canMoveY && !canMoveX ? [['上', 0], ['中央', 0.5], ['下', 1]] : [['左', 0], ['中央', 0.5], ['右', 1]];

  return (
    <div className="flex gap-3 items-start">
      <canvas
        ref={canvasRef}
        className="rounded border border-slate-300 shrink-0 cursor-grab active:cursor-grabbing touch-none"
        style={{ width: pw, height: ph }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        title="ドラッグで位置、ホイールで拡大縮小"
      />
      <div className="flex-1 min-w-0 text-xs space-y-1.5">
        {/* 枠の形 */}
        <div className="flex flex-wrap gap-1">
          {ASPECTS.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => onChange({ ...crop, aspect: a.key, x: crop.x, y: crop.y })}
              className={`px-2 py-0.5 rounded border ${crop.aspect === a.key ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'}`}
              title={`カードの画像枠を${a.label}にする`}
            >
              {a.label}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="text-slate-500">拡大 ×{crop.scale.toFixed(1)}</span>
          <input
            type="range"
            min={MIN_SCALE * 100}
            max={MAX_SCALE * 100}
            value={Math.round(crop.scale * 100)}
            onChange={(e) => onChange({ ...crop, scale: Number(e.target.value) / 100 })}
            className="w-full"
          />
        </label>
        <div className="flex flex-wrap gap-1">
          {posLabels.map(([label, p]) => (
            <button key={label} type="button" onClick={() => setPos(p)} className="px-2 py-0.5 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-100">
              {label}
            </button>
          ))}
          <button type="button" onClick={() => onChange({ x: 0, y: 0, scale: 1 })} className="px-2 py-0.5 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-100">
            リセット
          </button>
        </div>
        <p className="text-slate-400">横長の写真は 4:3、縦長のチラシは正方形が既定。プレビューをドラッグで位置、スライダーかホイールで拡大縮小。</p>
      </div>
    </div>
  );
};
