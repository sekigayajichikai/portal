/**
 * リッチメニューの定義（エディタ）→ 画像（canvas 2500×1686）と LINE のタップ領域（areas）を作る
 *
 * テンプレート:
 *   grid3x2 … 3列×2行の6タイル（いまの公式LINEのメニューと同じ）
 *   promo   … 大きな1枠（左2列ぶん）＋小さな2枠（登録促進メニュー用）
 * タブ … 上部15%に2つのタブ。押すと別のメニュー（エイリアス）に切り替わる（richmenuswitch）
 *
 * 仕様: docs/リッチメニュー.md
 */

export const RM_W = 2500;
export const RM_H = 1686;

export type TileAction = { type: 'uri'; uri: string } | { type: 'message'; text: string } | { type: 'none' };

export interface Tile {
  icon: string; // 絵文字1つ（線画に差し替える場合は画像アップロードを使う）
  label: string; // 2行までは改行で
  sub?: string; // promo の大枠だけ: 説明文
  button?: string; // promo の大枠だけ: ボタン風の文言
  action: TileAction;
}

export interface TabsDef {
  /** このメニューが何番目のタブか（0 or 1） */
  position: 0 | 1;
  labels: [string, string];
  /** 各タブが切り替える先のエイリアスID（自分のタブは自分のエイリアス） */
  aliases: [string, string];
}

/** メニューの役割（管理画面のタブ。役割ごとに保存メニューは1つ） */
export type MenuRole = 'normal' | 'promo' | 'bosai';
export const ROLES: Array<{ key: MenuRole; label: string; hint: string }> = [
  { key: 'normal', label: '通常メニュー', hint: '登録済みの人に出す。いまの6タイル' },
  { key: 'promo', label: '登録促進', hint: '未登録の人（全員の既定）に出す' },
  { key: 'bosai', label: '防災訓練タブ', hint: '対象者にだけ、通常メニューとタブで切り替え' },
];

export interface RichMenuDef {
  /** 役割（definition JSON の中に持つ。無い旧データは名前から推定） */
  role?: MenuRole;
  name: string;
  chatBarText: string;
  template: 'grid3x2' | 'promo';
  colors: { bg: string; tile: string; tileBorder: string; text: string; tabOn: string; tabOff: string; tabOnText: string; tabOffText: string; accent: string };
  tabs: TabsDef | null;
  tiles: Tile[];
}

export interface Area {
  bounds: { x: number; y: number; width: number; height: number };
  action: Record<string, unknown>;
}

/** 既定の配色（いまの公式LINEメニューの青緑） */
export const DEFAULT_COLORS: RichMenuDef['colors'] = {
  bg: '#1f8f8f',
  tile: '#d3e7e6',
  tileBorder: '#f3fafa',
  text: '#1c2b2b',
  tabOn: '#d3e7e6',
  tabOff: '#176a6a',
  tabOnText: '#1c2b2b',
  tabOffText: '#e6f2f2',
  accent: '#1f8f8f',
};
/** 防災訓練向けの配色（橙） */
export const BOSAI_COLORS: RichMenuDef['colors'] = {
  bg: '#d9541e',
  tile: '#fff1e6',
  tileBorder: '#ffd3b3',
  text: '#4a2400',
  tabOn: '#ffe1c2',
  tabOff: '#b3431a',
  tabOnText: '#7a3d00',
  tabOffText: '#ffe8d8',
  accent: '#d9541e',
};
/** 登録促進向けの配色（深い青緑＋黄） */
export const PROMO_COLORS: RichMenuDef['colors'] = {
  ...DEFAULT_COLORS,
  bg: '#2a6f6f',
  accent: '#2a6f6f',
};

export const TEMPLATES: Array<{ key: RichMenuDef['template']; label: string; tiles: number }> = [
  { key: 'grid3x2', label: '6タイル（3列×2行）', tiles: 6 },
  { key: 'promo', label: '登録促進（大1＋小2）', tiles: 3 },
];

/** サンプル定義 */
export const SAMPLE_DEFS: Record<string, RichMenuDef> = {
  normal: {
    role: 'normal',
    name: '通常メニュー',
    chatBarText: 'メニューを開く',
    template: 'grid3x2',
    colors: DEFAULT_COLORS,
    tabs: null,
    tiles: [
      { icon: '📻', label: '街角ラジオ', action: { type: 'uri', uri: 'https://sekigayajichikai.vercel.app/' } },
      { icon: '📖', label: '回覧板', action: { type: 'uri', uri: 'https://sekigayajichikai.vercel.app/' } },
      { icon: '🏫', label: '自治会\nカレンダー', action: { type: 'uri', uri: 'https://sekigaya-calendar.vercel.app/' } },
      { icon: '🚌', label: 'バス時刻表', action: { type: 'uri', uri: 'https://sekigayajichikai.vercel.app/' } },
      { icon: '🗑️', label: 'ゴミ出し', action: { type: 'uri', uri: 'https://sekigayajichikai.vercel.app/' } },
      { icon: '📣', label: 'お知らせ', action: { type: 'uri', uri: 'https://sekigayajichikai.vercel.app/' } },
    ],
  },
  promo: {
    role: 'promo',
    name: '登録促進メニュー',
    chatBarText: '会員登録はこちら',
    template: 'promo',
    colors: PROMO_COLORS,
    tabs: null,
    tiles: [
      {
        icon: '📝',
        label: 'まだ登録がお済みでない方へ',
        sub: '会員登録（1分）をすると\n回覧板・予定・防災情報が届きます',
        button: '会員登録フォームへ ›',
        action: { type: 'uri', uri: 'https://example.com/liff-form' },
      },
      { icon: '📖', label: '回覧板を\n見てみる', action: { type: 'uri', uri: 'https://sekigayajichikai.vercel.app/' } },
      { icon: '❓', label: '登録について\n質問する', action: { type: 'message', text: '登録について質問があります' } },
    ],
  },
  bosai: {
    role: 'bosai',
    name: '防災訓練タブ',
    chatBarText: 'メニューを開く',
    template: 'grid3x2',
    colors: BOSAI_COLORS,
    tabs: { position: 1, labels: ['🏠 通常メニュー', '🚨 防災訓練'], aliases: ['menu-normal', 'menu-bosai'] },
    tiles: [
      { icon: '📅', label: '訓練の案内\n日時・集合場所', action: { type: 'uri', uri: 'https://sekigayajichikai.vercel.app/' } },
      { icon: '🗺️', label: '避難場所\nマップ', action: { type: 'uri', uri: 'https://sekigayajichikai.vercel.app/' } },
      { icon: '✅', label: '参加を\n申し込む', action: { type: 'uri', uri: 'https://sekigayajichikai.vercel.app/' } },
      { icon: '🎒', label: '持ち物\nリスト', action: { type: 'uri', uri: 'https://sekigayajichikai.vercel.app/' } },
      { icon: '📢', label: '安否確認\n（訓練）', action: { type: 'message', text: '安否確認（訓練）: 無事です' } },
      { icon: '☎️', label: '問い合わせ', action: { type: 'message', text: '防災訓練について問い合わせ' } },
    ],
  },
};

/** タブ帯の高さ（px） */
const TAB_H = Math.round(RM_H * 0.15);
const PAD = Math.round(RM_W * 0.022);

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** タイルの矩形（テンプレートとタブの有無から） */
export function tileRects(def: RichMenuDef): Rect[] {
  const top = def.tabs ? TAB_H : 0;
  const areaH = RM_H - top;
  const cols = 3;
  const rows = 2;
  const cw = (RM_W - PAD * (cols + 1)) / cols;
  const rh = (areaH - PAD * (rows + 1)) / rows;
  const cell = (c: number, r: number): Rect => ({ x: PAD + c * (cw + PAD), y: top + PAD + r * (rh + PAD), w: cw, h: rh });
  if (def.template === 'promo') {
    const big = cell(0, 0);
    return [{ x: big.x, y: big.y, w: cw * 2 + PAD, h: rh * 2 + PAD }, cell(2, 0), cell(2, 1)];
  }
  return [cell(0, 0), cell(1, 0), cell(2, 0), cell(0, 1), cell(1, 1), cell(2, 1)];
}

/** LINE に渡すタップ領域 */
export function buildAreas(def: RichMenuDef): Area[] {
  const areas: Area[] = [];
  if (def.tabs) {
    const half = RM_W / 2;
    def.tabs.aliases.forEach((alias, i) => {
      areas.push({
        bounds: { x: i * half, y: 0, width: half, height: TAB_H },
        action: { type: 'richmenuswitch', richMenuAliasId: alias, data: `tab=${alias}` },
      });
    });
  }
  tileRects(def).forEach((r, i) => {
    const t = def.tiles[i];
    if (!t || t.action.type === 'none') return;
    const action =
      t.action.type === 'uri'
        ? { type: 'uri', label: t.label.replace(/\n/g, '').slice(0, 20), uri: t.action.uri }
        : { type: 'message', label: t.label.replace(/\n/g, '').slice(0, 20), text: t.action.text };
    areas.push({ bounds: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.w), height: Math.round(r.h) }, action });
  });
  return areas;
}

/** LINE の「リッチメニューを作る」に渡す JSON */
export function buildRichMenuObject(def: RichMenuDef) {
  return {
    size: { width: RM_W, height: RM_H },
    selected: true,
    name: def.name.slice(0, 300),
    chatBarText: (def.chatBarText || 'メニュー').slice(0, 14),
    areas: buildAreas(def),
  };
}

const FONT = '"Noto Sans JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function lines(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, lineH: number, align: CanvasTextAlign = 'center') {
  ctx.textAlign = align;
  text.split('\n').forEach((l, i) => ctx.fillText(l, x, y + i * lineH));
}

/** 定義から 2500×1686 の画像を描く */
export function renderRichMenu(def: RichMenuDef): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = RM_W;
  c.height = RM_H;
  const ctx = c.getContext('2d')!;
  const col = def.colors;
  ctx.fillStyle = col.bg;
  ctx.fillRect(0, 0, RM_W, RM_H);
  ctx.textBaseline = 'middle';

  // タブ帯
  if (def.tabs) {
    const half = RM_W / 2;
    def.tabs.labels.forEach((label, i) => {
      const on = i === def.tabs!.position;
      ctx.fillStyle = on ? col.tabOn : col.tabOff;
      if (on) {
        roundRect(ctx, i * half, 0, half, TAB_H + 40, 40);
        ctx.fill();
      } else {
        ctx.fillRect(i * half, 0, half, TAB_H);
      }
      ctx.fillStyle = on ? col.tabOnText : col.tabOffText;
      ctx.font = `bold 76px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(label, i * half + half / 2, TAB_H / 2);
    });
  }

  // タイル
  tileRects(def).forEach((r, i) => {
    const t = def.tiles[i];
    if (!t) return;
    const isBig = def.template === 'promo' && i === 0;
    ctx.fillStyle = isBig ? '#fff7dc' : col.tile;
    roundRect(ctx, r.x, r.y, r.w, r.h, 28);
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = isBig ? '#f7d774' : col.tileBorder;
    ctx.stroke();
    // 右下の三角（押せる印）
    if (!isBig) {
      ctx.fillStyle = col.accent;
      ctx.beginPath();
      ctx.moveTo(r.x + r.w, r.y + r.h - 110);
      ctx.lineTo(r.x + r.w, r.y + r.h);
      ctx.lineTo(r.x + r.w - 110, r.y + r.h);
      ctx.closePath();
      ctx.fill();
    }
    const cx = r.x + r.w / 2;
    if (isBig) {
      ctx.fillStyle = col.text;
      ctx.font = `260px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(t.icon, cx, r.y + r.h * 0.28);
      ctx.font = `bold 96px ${FONT}`;
      lines(ctx, t.label, cx, r.y + r.h * 0.5, 110);
      if (t.sub) {
        ctx.fillStyle = '#6b5a1e';
        ctx.font = `60px ${FONT}`;
        lines(ctx, t.sub, cx, r.y + r.h * 0.64, 80);
      }
      if (t.button) {
        ctx.fillStyle = '#e0a800';
        const bw = 900;
        const bh = 140;
        roundRect(ctx, cx - bw / 2, r.y + r.h * 0.8, bw, bh, 70);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `bold 66px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(t.button, cx, r.y + r.h * 0.8 + bh / 2);
      }
      return;
    }
    const nLines = t.label.split('\n').length;
    ctx.fillStyle = col.text;
    ctx.font = `200px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(t.icon, cx, r.y + r.h * (nLines > 1 ? 0.36 : 0.4));
    ctx.font = `bold 78px ${FONT}`;
    lines(ctx, t.label, cx, r.y + r.h * (nLines > 1 ? 0.68 : 0.74), 92);
  });
  return c;
}

/** 1MB 以内の Blob にする（PNG → 収まらなければ JPEG） */
export async function canvasToUploadBlob(c: HTMLCanvasElement): Promise<Blob> {
  const png = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
  if (png && png.size <= 1024 * 1024) return png;
  for (const q of [0.92, 0.85, 0.75]) {
    const jpg = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', q));
    if (jpg && jpg.size <= 1024 * 1024) return jpg;
  }
  throw new Error('画像を1MB以内にできませんでした');
}

export const blobToBase64 = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] ?? '');
    fr.onerror = reject;
    fr.readAsDataURL(b);
  });
