/**
 * カード画像の切り出し編集（枠の形＋拡大縮小＋ドラッグで位置決め）
 *
 * チラシPDFの1ページ目や記事の写真から、一押しカードに載せる枠を決める。
 * - 枠の形: 「縦長A4」か「自由」の2つ（2026-11-08 に絞った。既定は縦長A4。ボタンは 縦長A4 → 自由 の順）
 *   拡大スライダー・上/中央/下・リセット も同日に外した（「縦長A4」を押せばページ全面＝リセット。微調整はドラッグとホイール）
 *   以前の 正方形／横長4:3／横長16:9／横長 A4 は、保存済みのカードにその値があるときだけボタンに出す
 *   - プレビューをドラッグすると位置が動く（マウス・タッチ両対応）
 *   - ホイールで拡大縮小
 * - 「自由」（2026-10-27）: 紙面全体を出し、その上で枠を好きな大きさ・形になぞる。
 *   記事の形はまちまちなので、決まった形だと上下や左右が切れるときに使う。カードの画像もその形になる
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactCrop, { type Crop, type PercentCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import {
  type HeroCrop,
  ASPECTS,
  ASPECT_CHOICES,
  A4_PORTRAIT,
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
  const crop = resolveCrop(value);
  const ratio = aspectRatioOf(crop.aspect);
  /**
   * 「自由」モードか。保存された形が自由な形なら自動で自由モード、決まった形なら決まった形モード。
   * ボタンで切り替えたときは、形が変わるまでその選択を保つ
   */
  // 未指定のときの既定（写真なら自由）も見るので、保存値ではなく resolve した形で判定する
  const [freeMode, setFreeMode] = useState(isFreeAspect(crop.aspect));
  useEffect(() => {
    if (isFreeAspect(crop.aspect)) setFreeMode(true);
    else if (isPresetAspect(crop.aspect)) setFreeMode(false);
  }, [crop.aspect]);

  // 自由モードでは結果のプレビューを小さく横に出す
  const pw = freeMode ? 120 : size;
  const ph = Math.round(pw / ratio);
  const { sw, sh } = cropRect(source.width, source.height, crop);

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

  /** 決まった形に切り替える。縦長A4 はページ全面（等倍・位置0）に戻す＝実質のリセット。旧い形は拡大だけ上限に収める */
  const choosePreset = (key: (typeof ASPECTS)[number]['key']) => {
    setFreeMode(false);
    onChange(key === A4_PORTRAIT ? { x: 0, y: 0, scale: 1, aspect: key } : { ...crop, aspect: key, scale: Math.min(MAX_SCALE, crop.scale) });
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
      {/* 決まった形は縦長 A4 だけ。以前の形（正方形など）は、この予定に保存されているときだけ出す（押すとその形のまま） */}
      {ASPECTS.filter((a) => ASPECT_CHOICES.includes(a) || (!freeMode && crop.aspect === a.key)).map((a) => (
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
      <button
        type="button"
        onClick={chooseFree}
        className={`px-2 py-0.5 rounded border font-bold ${freeMode ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-amber-800 border-amber-400 hover:bg-amber-50'}`}
        title="紙面全体を出して、その上で枠を好きな大きさ・形になぞる。カードの画像もその形になる"
      >
        自由
      </button>
    </div>
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
        {/* 枠の形（拡大スライダーと 上/中央/下/リセット は 2026-11-08 に外した。縦長A4 を押せばページ全面に戻る） */}
        {aspectButtons}
        <p className="text-slate-400">縦長A4（チラシ1ページ全面）が既定。紙面の一部や記事の形に合わせたいときは「自由」。</p>
      </div>
    </div>
  );
};
