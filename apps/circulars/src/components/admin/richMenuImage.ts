/**
 * リッチメニューの定義（エディタ）→ 画像（canvas 2500×1686）と LINE のタップ領域（areas）を作る
 *
 * テンプレート:
 *   grid3x2 … 3列×2行の6タイル（いまの公式LINEのメニューと同じ）
 *   promo   … 大きな1枠（左2列ぶん）＋小さな2枠（登録促進メニュー用）
 * タブ … 上部15%に2つのタブ。押すと別のメニュー（エイリアス）に切り替わる（richmenuswitch）
 *   ペアは2組（TAB_PAIRS）: 通常／防災訓練（地区長・班長向け）、利用登録／通常メニュー（登録前）（未登録の人向け）
 *
 * 仕様: docs/リッチメニュー.md
 */

import { ICON_PREFIX, LINE_ICONS } from './richMenuIcons';

export const RM_W = 2500;
export const RM_H = 1686;

export type TileAction = { type: 'uri'; uri: string } | { type: 'message'; text: string } | { type: 'none' };

export interface Tile {
  icon: string; // 線画アイコン（'icon:radio' のように richMenuIcons.ts の key）か、絵文字1つ
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
export type MenuRole = 'normal' | 'promo' | 'normal_pre' | 'bosai';
export const ROLES: Array<{ key: MenuRole; label: string; hint: string }> = [
  { key: 'normal', label: '通常メニュー', hint: '登録済みの人に出す。いまの6タイル' },
  { key: 'promo', label: '登録促進', hint: '未登録の人にだけ紐づけて出す（名簿GASが毎晩同期）。1枚目。上のタブで「通常メニュー（登録前）」に切り替えられる' },
  { key: 'normal_pre', label: '通常メニュー（登録前）', hint: '登録促進の2枚目。未登録の人がタブで切り替えて見る。中身は通常メニューと同じにする' },
  { key: 'bosai', label: '防災訓練タブ', hint: '地区長・班長にだけ、通常メニューとタブで切り替え' },
];

/**
 * タブのペア（2つのメニューがお互いに切り替わる）。
 * ラベルとエイリアスはペアの両方で同じにし、「何枚目か（position）」だけ変える。
 * エイリアス名は名簿スプレッドシートの GAS（Jichikai_Line の gas/RichMenuSync.js の RICHMENU_ALIASES）と合わせること。
 */
export const TAB_PAIRS: Record<'bosai' | 'touroku', { labels: [string, string]; aliases: [string, string] }> = {
  /** 通常メニュー ⇄ 防災訓練（地区長・班長に紐づける） */
  bosai: { labels: ['通常メニュー', '防災訓練'], aliases: ['menu-normal', 'menu-bosai'] },
  /** 利用登録 ⇄ 通常メニュー（登録前）（未登録の人に紐づける） */
  touroku: { labels: ['利用登録', '通常メニュー'], aliases: ['menu-touroku', 'menu-normal-pre'] },
};

/** ペアから TabsDef を作る（配列は毎回コピーして、定義どうしで共有しない） */
function tabsOf(pair: { labels: [string, string]; aliases: [string, string] }, position: 0 | 1): TabsDef {
  return { position, labels: [pair.labels[0], pair.labels[1]], aliases: [pair.aliases[0], pair.aliases[1]] };
}

/** 役割ごとの、「上にタブを付ける」をオンにしたときの既定（どのペアの何枚目か） */
export function defaultTabsFor(role: MenuRole): TabsDef {
  switch (role) {
    case 'promo':
      return tabsOf(TAB_PAIRS.touroku, 0);
    case 'normal_pre':
      return tabsOf(TAB_PAIRS.touroku, 1);
    case 'bosai':
      return tabsOf(TAB_PAIRS.bosai, 1);
    default:
      return tabsOf(TAB_PAIRS.bosai, 0);
  }
}

/**
 * 役割ごとの決まったエイリアス（タブ付きでないメニュー用）。
 * 登録し直すと richMenuId が変わるので、外部（名簿スプレッドシートのGAS）はこの名前で今のメニューを引く。
 * GAS: GET /v2/bot/richmenu/alias/menu-touroku → richMenuId
 */
export const ROLE_ALIASES: Partial<Record<MenuRole, string>> = {
  promo: 'menu-touroku',
};

export interface RichMenuDef {
  /** 役割（definition JSON の中に持つ。無い旧データは名前から推定） */
  role?: MenuRole;
  name: string;
  chatBarText: string;
  template: 'grid3x2' | 'promo';
  colors: { bg: string; tile: string; tileBorder: string; text: string; tabOn: string; tabOff: string; tabOnText: string; tabOffText: string; accent: string };
  tabs: TabsDef | null;
  tiles: Tile[];
  /** 最後に LINE に登録したときの内容（menuSignature）。今の内容と違えば LINE は古いまま */
  registeredSig?: string;
}

/** LINE に出る内容の署名（役割と registeredSig は含めない）。登録済みの内容と比べるのに使う */
export function menuSignature(d: RichMenuDef): string {
  const { role: _role, registeredSig: _sig, ...rest } = d;
  return JSON.stringify(rest);
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

/** 通常メニューの6タイル（「通常メニュー」と「通常メニュー（登録前）」で同じ中身にする） */
function normalTiles(): Tile[] {
  return [
    { icon: 'icon:radio', label: '街角ラジオ', action: { type: 'uri', uri: 'https://sekigayajichikai.vercel.app/' } },
    { icon: 'icon:book-open', label: '回覧板', action: { type: 'uri', uri: 'https://sekigayajichikai.vercel.app/' } },
    { icon: 'icon:calendar-days', label: '自治会\nカレンダー', action: { type: 'uri', uri: 'https://sekigaya-calendar.vercel.app/' } },
    { icon: 'icon:bus', label: 'バス時刻表', action: { type: 'uri', uri: 'https://sekigayajichikai.vercel.app/' } },
    { icon: 'icon:trash-2', label: 'ゴミ出し', action: { type: 'uri', uri: 'https://sekigayajichikai.vercel.app/' } },
    { icon: 'icon:megaphone', label: 'お知らせ', action: { type: 'uri', uri: 'https://sekigayajichikai.vercel.app/' } },
  ];
}

/** サンプル定義 */
export const SAMPLE_DEFS: Record<string, RichMenuDef> = {
  normal: {
    role: 'normal',
    name: '通常メニュー',
    chatBarText: 'メニューを開く',
    template: 'grid3x2',
    colors: DEFAULT_COLORS,
    tabs: null,
    tiles: normalTiles(),
  },
  normal_pre: {
    role: 'normal_pre',
    name: '通常メニュー（登録前）',
    chatBarText: 'メニューを開く',
    template: 'grid3x2',
    colors: DEFAULT_COLORS,
    tabs: tabsOf(TAB_PAIRS.touroku, 1),
    tiles: normalTiles(),
  },
  promo: {
    role: 'promo',
    name: '登録促進メニュー',
    chatBarText: '利用登録はこちら',
    template: 'promo',
    colors: PROMO_COLORS,
    tabs: tabsOf(TAB_PAIRS.touroku, 0),
    tiles: [
      {
        icon: 'icon:file-pen-line',
        label: 'まだ登録がお済みでない方へ',
        sub: '利用登録（1分）をすると\n回覧板・予定・防災情報が届きます',
        button: '利用登録フォームへ ›',
        action: { type: 'uri', uri: 'https://liff.line.me/2009265243-QfQURcn1' },
      },
      { icon: 'icon:book-open', label: '回覧板を\n見てみる', action: { type: 'uri', uri: 'https://sekigayajichikai.vercel.app/' } },
      // 送る文「お問い合わせ」で、名簿GAS（Inquiry.js）が種類のボタンを返す
      { icon: 'icon:circle-question-mark', label: 'お問い合わせ', action: { type: 'message', text: 'お問い合わせ' } },
    ],
  },
  bosai: {
    role: 'bosai',
    name: '防災訓練タブ',
    chatBarText: 'メニューを開く',
    template: 'grid3x2',
    colors: BOSAI_COLORS,
    tabs: tabsOf(TAB_PAIRS.bosai, 1),
    tiles: [
      { icon: 'icon:calendar-days', label: '訓練の案内\n日時・集合場所', action: { type: 'uri', uri: 'https://sekigayajichikai.vercel.app/' } },
      { icon: 'icon:map', label: '避難場所\nマップ', action: { type: 'uri', uri: 'https://sekigayajichikai.vercel.app/' } },
      { icon: 'icon:square-check', label: '参加を\n申し込む', action: { type: 'uri', uri: 'https://sekigayajichikai.vercel.app/' } },
      { icon: 'icon:backpack', label: '持ち物\nリスト', action: { type: 'uri', uri: 'https://sekigayajichikai.vercel.app/' } },
      { icon: 'icon:siren', label: '安否確認\n（訓練）', action: { type: 'message', text: '安否確認（訓練）: 無事です' } },
      { icon: 'icon:phone', label: '問い合わせ', action: { type: 'message', text: '防災訓練について問い合わせ' } },
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

/** 行の先頭に来てほしくない記号（簡単な禁則） */
const NO_HEAD = '）」』、。・,.!?！？';

/**
 * 文字を幅に収まるように折り返す（\n はそのまま改行）。日本語なので1文字ずつ詰める。
 * ctx.font を設定してから呼ぶこと。
 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  text.split('\n').forEach((para) => {
    let cur = '';
    for (const ch of para) {
      if (cur && !NO_HEAD.includes(ch) && ctx.measureText(cur + ch).width > maxW) {
        out.push(cur);
        cur = ch;
      } else {
        cur += ch;
      }
    }
    out.push(cur);
  });
  return out;
}

/** 1行で幅に収まる文字サイズにする（min まで 4px ずつ小さくする）。決めた font を ctx に設定して返す */
function fitFont(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, min: number, weight = 'bold '): number {
  let s = size;
  ctx.font = `${weight}${s}px ${FONT}`;
  while (s > min && ctx.measureText(text).width > maxW) {
    s -= 4;
    ctx.font = `${weight}${s}px ${FONT}`;
  }
  return s;
}

/** 複数行を y（1行目の中心）から下へ描く */
function lines(ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number, lineH: number, align: CanvasTextAlign = 'center') {
  ctx.textAlign = align;
  rows.forEach((l, i) => ctx.fillText(l, x, y + i * lineH));
}

/**
 * アイコンを (cx, cy) を中心に size px の大きさで描く。
 * 'icon:〜' なら richMenuIcons.ts の線画（24×24 の座標を拡大して線で描く）、それ以外は絵文字として文字で描く。
 */
function drawIcon(ctx: CanvasRenderingContext2D, icon: string, cx: number, cy: number, size: number, color: string) {
  const node = icon.startsWith(ICON_PREFIX) ? LINE_ICONS.find((i) => i.key === icon.slice(ICON_PREFIX.length))?.node : undefined;
  if (!node) {
    ctx.fillStyle = color;
    ctx.font = `${size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(icon, cx, cy);
    return;
  }
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  node.forEach(([tag, a]) => {
    ctx.beginPath();
    switch (tag) {
      case 'path':
        ctx.stroke(new Path2D(String(a.d)));
        return;
      case 'circle':
        ctx.arc(Number(a.cx), Number(a.cy), Number(a.r), 0, Math.PI * 2);
        break;
      case 'rect': {
        const rx = Number(a.rx ?? 0);
        if (rx) roundRect(ctx, Number(a.x), Number(a.y), Number(a.width), Number(a.height), rx);
        else ctx.rect(Number(a.x), Number(a.y), Number(a.width), Number(a.height));
        break;
      }
      case 'line':
        ctx.moveTo(Number(a.x1), Number(a.y1));
        ctx.lineTo(Number(a.x2), Number(a.y2));
        break;
      case 'polyline':
      case 'polygon': {
        const p = String(a.points).trim().split(/[\s,]+/).map(Number);
        for (let i = 0; i + 1 < p.length; i += 2) {
          if (i === 0) ctx.moveTo(p[0], p[1]);
          else ctx.lineTo(p[i], p[i + 1]);
        }
        if (tag === 'polygon') ctx.closePath();
        break;
      }
      default:
        return;
    }
    ctx.stroke();
  });
  ctx.restore();
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
      fitFont(ctx, label, half - 120, 96, 56);
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
    const cx = r.x + r.w / 2;
    const innerW = r.w - 120; // 左右の余白を除いた、文字を置ける幅
    if (isBig) {
      // 上から順に、アイコン → 見出し → 説明 → ボタン。見出し・説明は幅で折り返す
      drawIcon(ctx, t.icon, cx, r.y + r.h * 0.22, 270, col.text);
      ctx.fillStyle = col.text;
      ctx.font = `bold 108px ${FONT}`;
      const labelRows = wrapText(ctx, t.label, innerW);
      const labelY = r.y + r.h * 0.42;
      lines(ctx, labelRows, cx, labelY, 124);
      let y = labelY + labelRows.length * 124;
      if (t.sub) {
        ctx.fillStyle = '#6b5a1e';
        ctx.font = `72px ${FONT}`;
        const subRows = wrapText(ctx, t.sub, innerW);
        lines(ctx, subRows, cx, y + 10, 90);
        y += 10 + subRows.length * 90;
      }
      if (t.button) {
        const bw = Math.min(1100, innerW);
        const bh = 170;
        // 説明が長いときはボタンを下にずらす（タイルの下端から 60px は空ける）
        const by = Math.min(Math.max(r.y + r.h * 0.77, y + 20), r.y + r.h - bh - 60);
        ctx.fillStyle = '#e0a800';
        roundRect(ctx, cx - bw / 2, by, bw, bh, 85);
        ctx.fill();
        ctx.fillStyle = '#fff';
        fitFont(ctx, t.button, bw - 100, 84, 56);
        ctx.textAlign = 'center';
        ctx.fillText(t.button, cx, by + bh / 2);
      }
      return;
    }
    // 小タイル: 文言は幅で折り返し、3行以上なら少し小さくする
    ctx.font = `bold 100px ${FONT}`;
    let rows = wrapText(ctx, t.label, innerW);
    let fontPx = 100;
    let lineH = 116;
    if (rows.length > 2) {
      fontPx = 80;
      lineH = 94;
      ctx.font = `bold ${fontPx}px ${FONT}`;
      rows = wrapText(ctx, t.label, innerW);
    }
    const nLines = rows.length;
    const iconSize = nLines > 2 ? 200 : 230;
    const iconY = r.y + r.h * (nLines > 2 ? 0.26 : nLines > 1 ? 0.33 : 0.38);
    drawIcon(ctx, t.icon, cx, iconY, iconSize, col.text);
    ctx.fillStyle = col.text;
    ctx.font = `bold ${fontPx}px ${FONT}`;
    // 文言は1行なら 0.72、2行なら 0.62 の高さから。3行は 0.5 から上から詰める
    const firstY = r.y + r.h * (nLines > 2 ? 0.5 : nLines > 1 ? 0.62 : 0.72);
    lines(ctx, rows, cx, firstY, lineH);
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
