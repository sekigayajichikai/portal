/**
 * カード画像の切り出し編集（枠の形＋拡大縮小＋ドラッグで位置決め）
 *
 * チラシPDFの1ページ目や記事の写真から、一押しカードに載せる枠を決める。
 * - 枠の形: 正方形／横長4:3／横長16:9／縦長・横長 A4（横長の写真は既定で4:3）
 *   - プレビューをドラッグすると位置が動く（マウス・タッチ両対応）
 *   - スライダー（またはホイール）で拡大縮小
 *   - 「上」「中央」「下」（横長なら左・中央・右）で位置をすぐ揃えられる
 * - 「自由」（2026-10-27）: 紙面全体を出し、その上で枠を好きな大きさ・形になぞる。
 *   記事の形はまちまちなので、決まった形だと上下や左右が切れるときに使う。カードの画像もその形になる
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactCrop, { type Crop, type PercentCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import {
  type HeroCrop,
  ASPECTS,
  MIN_SCALE,
  MAX_SCALE,
  MAX_SCALE_FREE,
  cropRect,
  cropFromRect,
  resolveCrop,
  aspectRatioOf,
  isFreeAspect,
  isPresetAspect,
  maxScaleFor,
  canvasToJpegBase64,
} from './heroCrop';

interface CropEditorProps {
  /** 元画像（PDF を描いた canvas か、写真を描いた canvas） */
  source: HTMLCanvasElement;
  value: HeroCrop;
  onChange: (crop: HeroCrop) => void;
  /** プレビューの横幅（px） */
  size?: number;
}

/** 「自由」で紙面全体を出すときの横幅（px）。なぞりやすいようプレビューより大きめ */
const FREE_VIEW_WIDTH = 320;

export const CropEditor: React.FC<CropEditorProps> = ({ source, value, onChange, size = 220 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; crop: HeroCrop } | null>(null);
  const crop = resolveCrop(value, source.width, source.height);
  const ratio = aspectRatioOf(crop.aspect);
  /**
   * 「自由」モードか。保存された形が自由な形なら自動で自由モード、決まった形なら決まった形モード。
   * ボタンで切り替えたときは、形が変わるまでその選択を保つ
   */
  const [freeMode, setFreeMode] = useState(isFreeAspect(value.aspect));
  useEffect(() => {
    if (isFreeAspect(value.aspect)) setFreeMode(true);
    else if (isPresetAspect(value.aspect)) setFreeMode(false);
  }, [value.aspect]);

  // 自由モードでは結果のプレビューを小さく横に出す
  const pw = freeMode ? 120 : size;
  const ph = Math.round(pw / ratio);
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

  /** 自由モードで紙面全体を <img> に出すためのデータURL（元画像ごとに1回だけ作る。長辺 1000px の JPEG） */
  const pageDataUrl = useMemo(() => (freeMode ? `data:image/jpeg;base64,${canvasToJpegBase64(source, 1000, 0.85)}` : ''), [source, freeMode]);

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
    const next = Math.min(maxScaleFor(crop.aspect), Math.max(MIN_SCALE, crop.scale * (e.deltaY < 0 ? 1.08 : 1 / 1.08)));
    onChange({ ...crop, scale: Number(next.toFixed(3)) });
  };

  const setPos = (p: number) => onChange(canMoveY && !canMoveX ? { ...crop, y: p } : canMoveX && !canMoveY ? { ...crop, x: p } : { ...crop, x: p, y: p });
  const posLabels: Array<[string, number]> = canMoveY && !canMoveX ? [['上', 0], ['中央', 0.5], ['下', 1]] : [['左', 0], ['中央', 0.5], ['右', 1]];

  /** 決まった形に切り替える（自由モードからのときは、拡大が決まった形の上限を超えていれば上限に） */
  const choosePreset = (key: (typeof ASPECTS)[number]['key']) => {
    setFreeMode(false);
    onChange({ ...crop, aspect: key, scale: Math.min(MAX_SCALE, crop.scale) });
  };
  /** 「自由」に切り替える。今の枠をそのまま自由な形の枠にする（見た目は変わらず、そこから好きになぞれる） */
  const chooseFree = () => {
    setFreeMode(true);
    onChange(cropFromRect(source.width, source.height, cropRect(source.width, source.height, crop)));
  };

  /** 今の切り抜きを、紙面全体に対する割合（%）の枠にする（react-image-crop に渡す） */
  const percentCrop: PercentCrop = (() => {
    const r = cropRect(source.width, source.height, crop);
    return {
      unit: '%',
      x: (r.sx / source.width) * 100,
      y: (r.sy / source.height) * 100,
      width: (r.sw / source.width) * 100,
      height: (r.sh / source.height) * 100,
    };
  })();
  /**
   * 「枠を描き直す」: 今の枠を消して、次になぞった所に新しい枠を作る。
   * 枠の中をつまむと「移動」になるので、枠が紙面の大半を覆っているときは描き直せない。そのための逃げ道
   */
  const [redraw, setRedraw] = useState<{ draft: PercentCrop | null } | null>(null);
  /** なぞった枠（%）→ 切り抜き。小さすぎる枠（拡大の上限を超える）は上限で止まる */
  const onFreeChange = (_px: Crop, pct: PercentCrop) => {
    if (redraw) setRedraw({ draft: pct });
    if (!pct.width || !pct.height || pct.width < 1 || pct.height < 1) return;
    onChange(
      cropFromRect(source.width, source.height, {
        sx: (pct.x / 100) * source.width,
        sy: (pct.y / 100) * source.height,
        sw: (pct.width / 100) * source.width,
        sh: (pct.height / 100) * source.height,
      })
    );
  };
  // 紙面の表示幅に対する、枠の最小の大きさ（px）。拡大の上限（MAX_SCALE_FREE）より小さい枠は作れないため
  const freeViewHeight = Math.round((FREE_VIEW_WIDTH * source.height) / source.width);
  const freeMin = Math.ceil(Math.min(FREE_VIEW_WIDTH, freeViewHeight) / MAX_SCALE_FREE);

  const aspectButtons = (
    <div className="flex flex-wrap gap-1">
      <button
        type="button"
        onClick={chooseFree}
        className={`px-2 py-0.5 rounded border font-bold ${freeMode ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-amber-800 border-amber-400 hover:bg-amber-50'}`}
        title="紙面全体を出して、その上で枠を好きな大きさ・形になぞる。カードの画像もその形になる"
      >
        自由
      </button>
      {ASPECTS.map((a) => (
        <button
          key={a.key}
          type="button"
          onClick={() => choosePreset(a.key)}
          className={`px-2 py-0.5 rounded border ${!freeMode && crop.aspect === a.key ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'}`}
          title={`カードの画像枠を${a.label}にする`}
        >
          {a.label}
        </button>
      ))}
    </div>
  );

  const resetButton = (
    <button
      type="button"
      onClick={() => {
        setFreeMode(false);
        onChange({ x: 0, y: 0, scale: 1 });
      }}
      className="px-2 py-0.5 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
    >
      リセット
    </button>
  );

  if (freeMode) {
    return (
      <div className="flex flex-wrap gap-3 items-start">
        {/* 紙面全体。この上で枠をなぞる（角や辺をつまんで大きさ、中をつまんで位置） */}
        <div className="shrink-0 rounded border border-slate-300 bg-slate-100 overflow-hidden" style={{ width: FREE_VIEW_WIDTH }}>
          <ReactCrop
            crop={redraw ? (redraw.draft ?? undefined) : percentCrop}
            onChange={onFreeChange}
            onComplete={() => setRedraw(null)}
            minWidth={freeMin}
            minHeight={freeMin}
            keepSelection={!redraw}
            ruleOfThirds={false}
          >
            <img src={pageDataUrl} alt="紙面" style={{ width: FREE_VIEW_WIDTH, height: 'auto', display: 'block' }} draggable={false} />
          </ReactCrop>
        </div>
        <div className="flex-1 min-w-[140px] text-xs space-y-1.5">
          {aspectButtons}
          <p className="text-slate-700 font-bold">
            {redraw ? '紙面の上で、載せたい所をなぞってください。' : '枠の角をつまむと大きさ、中をつまむと位置が変わります。'}
          </p>
          <button
            type="button"
            onClick={() => setRedraw({ draft: null })}
            disabled={!!redraw}
            className="px-2 py-0.5 rounded border border-amber-400 bg-white text-amber-800 font-bold hover:bg-amber-50 disabled:opacity-50"
            title="今の枠を消して、なぞった所に新しい枠を作る"
          >
            枠を描き直す
          </button>
          <div>
            <p className="text-slate-600 mb-0.5">カードに載る画像（{crop.aspect.replace(':', '：')}）</p>
            <canvas ref={canvasRef} className="rounded border border-slate-300" style={{ width: pw, height: ph }} />
          </div>
          <div className="flex flex-wrap gap-1">{resetButton}</div>
          <p className="text-slate-500">細長すぎる枠（縦横 3 倍まで）と、小さすぎる枠（紙面の幅の 1/{MAX_SCALE_FREE} まで）は、そこで止まります。</p>
        </div>
      </div>
    );
  }

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
        {aspectButtons}
        <label className="block">
          <span className="text-slate-500">拡大 ×{crop.scale.toFixed(1)}</span>
          <input
            type="range"
            min={MIN_SCALE * 100}
            max={MAX_SCALE * 100}
            value={Math.round(Math.min(MAX_SCALE, crop.scale) * 100)}
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
          {resetButton}
        </div>
        <p className="text-slate-400">横長の写真は 4:3、縦長のチラシは正方形が既定。プレビューをドラッグで位置、スライダーかホイールで拡大縮小。記事の形に合わせたいときは「自由」。</p>
      </div>
    </div>
  );
};
