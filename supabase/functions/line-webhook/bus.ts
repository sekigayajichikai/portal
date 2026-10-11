/**
 * バス時刻表の中身（データを受け取ってメッセージを組み立てるだけ。DB・LINE には触らない）
 *
 * 名簿GAS の BusTimetable.js をそのまま移したもの。見た目・文言・ボタンの data は GAS と同じにしてある
 * （GAS で保存した設定や、送信済みのボタンが押されてもそのまま動くように）。
 * GAS と同じ出力になることは scripts/line-webhook-test/parity.mjs で確かめる。
 */

export type Direction = '往路' | '復路';
export type DayType = '平日' | '土休日';

export interface BusSetting {
  patternName: string;
  direction: string;
  stopName: string;
}

export interface TimetableRow {
  direction: string;
  dayType: string;
  stopName: string;
  times: string[];
}

export interface SpecialDay {
  start: number; // yyyymmdd
  end: number;
  dayType: DayType;
}

export const BUS_MAX_PATTERNS = 3;

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 日本時間の年月日・時分・曜日（Edge Function は UTC で動くので、9時間ずらして読む） */
export function jst(date: Date) {
  const d = new Date(date.getTime() + JST_OFFSET_MS);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return {
    y, m, d: day,
    hours: d.getUTCHours(),
    minutes: d.getUTCMinutes(),
    dow: d.getUTCDay(),
    num: y * 10000 + m * 100 + day,
  };
}

/** yyyymmdd → 'yyyy-mm-dd' */
export function numToIso(num: number): string {
  const s = String(num);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/** 'yyyy-mm-dd' → yyyymmdd */
export function isoToNum(iso: string): number {
  return Number(iso.slice(0, 10).replace(/-/g, ''));
}

/**
 * 平日／土休日の判定。優先順位: 特別ダイヤ > 土日 > 祝日 > 平日（GAS の getDayType と同じ）
 */
export function getDayType(date: Date, specialDays: SpecialDay[], holidays: Set<number>): DayType {
  const t = jst(date);
  for (const s of specialDays) {
    if (t.num >= s.start && t.num <= s.end) return s.dayType;
  }
  if (t.dow === 0 || t.dow === 6) return '土休日';
  if (holidays.has(t.num)) return '土休日';
  return '平日';
}

/**
 * そのダイヤで次に走る日（明日から60日先まで探す。なければ null）
 */
export function nextDateOfDayType(from: Date, dayType: string, specialDays: SpecialDay[], holidays: Set<number>): Date | null {
  for (let i = 1; i <= 60; i++) {
    const d = new Date(from.getTime() + i * 24 * 60 * 60 * 1000);
    if (getDayType(d, specialDays, holidays) === dayType) return d;
  }
  return null;
}

/** 停留所名の一覧（往路の行の順・重複なし） */
export function getStopNames(rows: TimetableRow[]): string[] {
  const stops: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.direction === '往路' && r.stopName && !seen.has(r.stopName)) {
      stops.push(r.stopName);
      seen.add(r.stopName);
    }
  }
  return stops;
}

export function getBusTimetable(rows: TimetableRow[], direction: string, dayType: string, stopName: string): string[] {
  const row = rows.find((r) => r.direction === direction && r.dayType === dayType && r.stopName === stopName);
  return row ? row.times.slice() : [];
}

export function getOtherRoutes(settings: BusSetting[], direction: string, stopName: string): BusSetting[] {
  return settings.filter((s) => !(s.direction === direction && s.stopName === stopName));
}

// ============================================================
// Flex Message
// ============================================================

export function buildDirectionSelectFlex() {
  return {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: 'どこ行きのバスですか？', weight: 'bold', size: 'lg', color: '#1a1a1a' },
      ],
      backgroundColor: '#f5f5f5',
      paddingAll: '16px',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: [
        {
          type: 'button',
          action: { type: 'postback', label: '金沢文庫駅 行き', data: 'bus_dir=往路', displayText: '金沢文庫駅 行き' },
          style: 'primary',
          color: '#2196F3',
        },
        {
          type: 'button',
          action: { type: 'postback', label: '野村住宅センター 行き', data: 'bus_dir=復路', displayText: '野村住宅センター 行き' },
          style: 'primary',
          color: '#4CAF50',
        },
      ],
      paddingAll: '16px',
    },
  };
}

/**
 * 準備中のバス停（時刻表のデータはあるが、停留所選びにはまだ出さない）。出すときはここから消す（名簿GAS の BUS_HIDDEN_STOPS も）
 * 夏山坂上: 隣の自治会向けに 2026-10-12 にデータだけ用意。公開はまだ
 */
export const BUS_HIDDEN_STOPS = ['夏山坂上'];

export function buildStopSelectFlex(direction: string, allStops: string[]) {
  const stops = allStops.filter((s) => !BUS_HIDDEN_STOPS.includes(s));
  // 往路: 金沢文庫駅西口を除外（終点のため時刻なし）
  // 復路: 関ヶ谷を除外（最終便1本のみ）、野村住宅センターを除外（終点）
  const filtered = stops.filter((s) => {
    if (direction === '往路' && s === '金沢文庫駅西口') return false;
    if (direction === '復路' && s === '関ヶ谷') return false;
    if (direction === '復路' && s === '野村住宅センター') return false;
    return true;
  });
  // 復路は逆順
  const displayStops = direction === '復路' ? filtered.slice().reverse() : filtered.slice();

  const buttons = displayStops.map((stop) => ({
    type: 'button',
    action: {
      type: 'postback',
      label: stop.length > 20 ? stop.substring(0, 20) : stop,
      data: 'bus_stop=' + direction + ',' + stop,
      displayText: stop + 'の時刻表',
    },
    style: 'secondary',
    height: 'sm',
    margin: 'sm',
  }));

  const dirLabel = direction === '往路' ? '金沢文庫駅 行き' : '野村住宅センター 行き';
  return {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: '乗るバス停は？', weight: 'bold', size: 'lg', color: '#1a1a1a' },
        { type: 'text', text: dirLabel, size: 'sm', color: '#666666', margin: 'sm' },
      ],
      backgroundColor: '#f5f5f5',
      paddingAll: '16px',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'none',
      contents: buttons,
      paddingAll: '12px',
    },
  };
}

/** 待ち時間（分）を「52分」「1時間15分」「6時間」の形にする */
export function formatWait(min: number): string {
  if (min < 60) return min + '分';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h + '時間' + (m > 0 ? m + '分' : '');
}

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

/**
 * 時刻表 Flex Message（カルーセル: 次のバス／午前／午後）
 * @param now 今の時刻（次のバスと日付の表示に使う）
 * @param tomorrowDayType 明日のダイヤ（今日と違えば注意を出す）
 * @param nextDate 今日以外のダイヤを見ているとき、そのダイヤで次に走る日（「次は ◯月◯日（◯）」と出す）
 */
export function buildTimetableFlex(
  direction: string,
  stopName: string,
  dayType: string,
  times: string[],
  isSaved: boolean,
  isSwitched: boolean,
  otherRoutes: BusSetting[] | null,
  now: Date,
  tomorrowDayType: string,
  nextDate: Date | null = null,
) {
  const t = jst(now);
  const nowMinutes = t.hours * 60 + t.minutes;
  const dirLabel = direction === '往路' ? '→ 金沢文庫駅 行き' : '→ 野村住宅センター 行き';

  // 時間帯ごとにグルーピング
  const hourMap: Record<number, { min: string; totalMin: number }[]> = {};
  for (const time of times) {
    const parts = time.split(':');
    const hour = parseInt(parts[0], 10);
    const min = parts[1];
    if (!hourMap[hour]) hourMap[hour] = [];
    hourMap[hour].push({ min, totalMin: hour * 60 + parseInt(min, 10) });
  }

  // 直近3本
  const upcoming: { time: string; diff: number }[] = [];
  for (const time of times) {
    const p = time.split(':');
    const total = parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
    if (total >= nowMinutes && upcoming.length < 3) {
      upcoming.push({ time, diff: total - nowMinutes });
    }
  }

  // 0時〜4時台は、夜中に「明日の朝」を調べている人が取り違えないよう「今朝」とつける
  const dateStr = (t.hours < 5 ? '今朝 ' : '') + t.m + '月' + t.d + '日' + '（' + DAY_NAMES[t.dow] + '）';

  // 明日のダイヤが異なるか
  const tm = jst(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  let dayTypeNotice = '';
  if (dayType !== tomorrowDayType) {
    const tomorrowDateStr = tm.m + '月' + tm.d + '日（' + DAY_NAMES[tm.dow] + '）';
    dayTypeNotice = '明日 ' + tomorrowDateStr + ' は' + tomorrowDayType + 'ダイヤです';
  }

  const headerColor = direction === '往路' ? '#2196F3' : '#4CAF50';

  // === 1枚目: 次のバス（切り替え時は非表示）===
  const nextBusContents: unknown[] = [];
  if (isSwitched) {
    nextBusContents.push({
      type: 'text', text: dayType + 'ダイヤの時刻表です', size: 'md', weight: 'bold', color: '#666666', margin: 'sm',
    });
    if (nextDate) {
      const nd = jst(nextDate);
      nextBusContents.push({
        type: 'text', text: '次は ' + nd.m + '月' + nd.d + '日（' + DAY_NAMES[nd.dow] + '）', size: 'sm', color: '#999999', margin: 'sm',
      });
    }
  } else if (upcoming.length > 0) {
    nextBusContents.push({
      // 0時〜4時台で、まだ今日のバスが1本も出ていなければ「始発」
      type: 'text', text: t.hours < 5 && upcoming[0].time === times[0] ? '始発' : '次のバス', size: 'lg', weight: 'bold', color: '#FF6B00', margin: 'sm',
    });
    for (const u of upcoming) {
      const diffText = u.diff === 0 ? 'まもなく' : 'あと ' + formatWait(u.diff);
      nextBusContents.push({
        type: 'box', layout: 'horizontal', margin: 'sm',
        contents: [
          { type: 'text', text: u.time, size: 'xxl', weight: 'bold', color: '#FF6B00', flex: 3 },
          { type: 'text', text: diffText, size: 'md', color: '#999999', flex: 4, align: 'end', gravity: 'center' },
        ],
      });
    }
  } else {
    nextBusContents.push({
      type: 'text', text: '本日のバスは終了しました', size: 'md', color: '#999999', margin: 'lg',
    });
  }

  if (dayTypeNotice && !isSwitched) {
    nextBusContents.push({ type: 'separator', margin: 'lg' });
    nextBusContents.push({
      type: 'text', text: dayTypeNotice, size: 'sm', color: '#E65100', weight: 'bold', margin: 'md', wrap: true,
    });
  }

  const footerItems: unknown[] = [];
  // 保存済みの他ルートへのワンタップ切替（最頻ユースケース: 行き⇔帰り）
  if (otherRoutes && otherRoutes.length > 0) {
    for (const route of otherRoutes) {
      footerItems.push({
        type: 'button',
        action: { type: 'postback', label: '「' + route.patternName + '」を見る', data: 'bus_show=' + route.patternName, displayText: route.patternName + 'の時刻表' },
        style: 'primary',
        color: route.direction === '往路' ? '#2196F3' : '#4CAF50',
        height: 'sm',
      });
    }
  }
  const otherDayType = dayType === '平日' ? '土休日' : '平日';
  const switchSavedFlag = isSaved ? ',saved' : '';
  footerItems.push({
    type: 'button',
    action: { type: 'postback', label: otherDayType + 'ダイヤを見る', data: 'bus_switch=' + direction + ',' + stopName + ',' + otherDayType + switchSavedFlag },
    style: 'secondary', height: 'sm',
  });
  if (!isSaved) {
    footerItems.push({
      type: 'button',
      action: { type: 'postback', label: 'この行き方を保存', data: 'bus_save_ask=' + direction + ',' + stopName, displayText: 'この行き方を保存' },
      style: 'primary', color: '#FF9800', height: 'sm',
    });
  }
  footerItems.push({
    type: 'button',
    action: { type: 'postback', label: '別のバス停を探す', data: 'bus_new', displayText: '別のバス停を探す' },
    style: 'secondary', height: 'sm',
  });
  if (isSaved) {
    footerItems.push({
      type: 'button',
      action: { type: 'postback', label: 'マイバス管理', data: 'bus_settings', displayText: 'マイバス管理' },
      style: 'link', color: '#888888', height: 'sm',
    });
  }

  const bubble1 = {
    type: 'bubble', size: 'mega',
    header: {
      type: 'box', layout: 'vertical',
      contents: [
        { type: 'text', text: stopName, weight: 'bold', size: 'xl', color: '#ffffff' },
        { type: 'text', text: dirLabel, size: 'lg', color: '#ffffffcc', margin: 'sm' },
        { type: 'text', text: '【' + dayType + 'ダイヤ】' + (isSwitched ? '' : dateStr), size: 'md', weight: 'bold', color: '#ffffff', margin: 'sm' },
      ],
      backgroundColor: headerColor, paddingAll: '12px',
    },
    body: {
      type: 'box', layout: 'vertical',
      contents: nextBusContents, paddingAll: '12px',
    },
    footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: footerItems, paddingAll: '8px' },
  };

  const hours = Object.keys(hourMap).sort((a, b) => parseInt(a) - parseInt(b));

  const buildTimeRows = (hourList: string[]) => {
    const tRows: unknown[] = [];
    for (const hour of hourList) {
      const entries = hourMap[Number(hour)];
      const minStr = entries.map((e) => e.min).join('  ');
      tRows.push({
        type: 'box', layout: 'horizontal',
        contents: [
          { type: 'text', text: String(hour) + '時', size: 'md', color: '#1a1a1a', weight: 'bold', flex: 2 },
          { type: 'text', text: minStr, size: 'md', color: '#555555', flex: 8, wrap: true },
        ],
        margin: 'sm', paddingAll: '2px',
      });
    }
    if (tRows.length === 0) {
      tRows.push({ type: 'text', text: '該当なし', size: 'sm', color: '#999999', align: 'center', margin: 'md' });
    }
    return tRows;
  };

  const amHours = hours.filter((h) => parseInt(h) < 12);
  const pmHours = hours.filter((h) => parseInt(h) >= 12);

  const bubbles: unknown[] = [bubble1];
  const halfBubble = (title: string, hourList: string[]) => ({
    type: 'bubble', size: 'mega',
    header: {
      type: 'box', layout: 'vertical',
      contents: [
        { type: 'text', text: title, weight: 'bold', size: 'lg', color: '#ffffff' },
        { type: 'text', text: stopName + '  ' + dirLabel, size: 'sm', color: '#ffffffcc', margin: 'xs' },
      ],
      backgroundColor: headerColor, paddingAll: '12px',
    },
    body: {
      type: 'box', layout: 'vertical',
      contents: buildTimeRows(hourList), paddingAll: '8px',
    },
  });
  if (amHours.length > 0) bubbles.push(halfBubble('午前の時刻表', amHours));
  if (pmHours.length > 0) bubbles.push(halfBubble('午後の時刻表', pmHours));

  return { type: 'carousel', contents: bubbles };
}

export function buildSettingsListFlex(settings: BusSetting[]) {
  const contents: unknown[] = [];
  settings.forEach((s, i) => {
    const dirLabel = s.direction === '往路' ? '→ 金沢文庫駅 行き' : '→ 野村住宅センター 行き';
    if (i > 0) contents.push({ type: 'separator', margin: 'lg' });
    let nameText = s.patternName;
    if (i === 0) nameText += '（最初に表示）';
    contents.push({
      type: 'box',
      layout: 'vertical',
      margin: 'md',
      contents: [
        { type: 'text', text: nameText, weight: 'bold', size: 'xl', color: '#1a1a1a', wrap: true },
        { type: 'text', text: s.stopName + ' ' + dirLabel, size: 'sm', color: '#666666', margin: 'xs' },
        {
          type: 'button',
          action: { type: 'postback', label: 'この時刻表を見る', data: 'bus_show=' + s.patternName, displayText: s.patternName + 'の時刻表' },
          style: 'primary',
          color: '#2196F3',
          height: 'sm',
          margin: 'md',
        },
        {
          type: 'box',
          layout: 'horizontal',
          spacing: 'md',
          margin: 'xs',
          contents: [
            {
              type: 'button',
              action: { type: 'postback', label: '名前変更', data: 'bus_rename_ask=' + s.patternName, displayText: s.patternName + 'の名前を変更' },
              style: 'secondary',
              height: 'sm',
              flex: 1,
            },
            {
              type: 'button',
              action: { type: 'postback', label: '削除', data: 'bus_del_confirm=' + s.patternName, displayText: s.patternName + 'を削除' },
              style: 'secondary',
              color: '#DDCCCC',
              height: 'sm',
              flex: 1,
            },
          ],
        },
      ],
    });
  });

  if (settings.length === 0) {
    contents.push({
      type: 'text',
      text: '保存済みの設定はありません',
      size: 'sm',
      color: '#999999',
      align: 'center',
      margin: 'lg',
    });
  }

  return {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: '⚙ マイバス設定', weight: 'bold', size: 'lg', color: '#1a1a1a' },
      ],
      backgroundColor: '#f5f5f5',
      paddingAll: '12px',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents,
      paddingAll: '12px',
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        {
          type: 'button',
          action: { type: 'postback', label: '別のバス停を探す', data: 'bus_new', displayText: '別のバス停を探す' },
          style: 'secondary',
          height: 'md',
        },
      ],
      paddingAll: '12px',
    },
  };
}

/** 保存したあとのカード（名前をつけるか聞く） */
export function buildSavedFlex(patternName: string, saveDir: string, saveStop: string, isFirst: boolean, defaultName: string) {
  const dirText = saveDir === '往路' ? '→ 金沢文庫駅 行き' : '→ 野村住宅センター 行き';
  const bodyContents: unknown[] = [
    { type: 'text', text: '「' + patternName + '」として保存しました！', weight: 'bold', size: 'md', color: '#1a1a1a', wrap: true },
    { type: 'text', text: saveStop + ' ' + dirText, size: 'sm', color: '#666666', margin: 'sm' },
  ];
  if (isFirst) {
    bodyContents.push({ type: 'text', text: '次回からメニューの「バス時刻表」ボタンで\nこの時刻表がすぐ表示されます。', size: 'sm', color: '#999999', margin: 'md', wrap: true });
  } else {
    bodyContents.push({ type: 'text', text: '※ デフォルト表示は「' + defaultName + '」です。\n切り替えはマイバス管理から行えます。', size: 'sm', color: '#E65100', margin: 'md', wrap: true });
  }
  bodyContents.push({ type: 'text', text: '名前をつけますか？', weight: 'bold', size: 'md', color: '#1a1a1a', margin: 'lg' });
  bodyContents.push({
    type: 'box', layout: 'horizontal', spacing: 'md', margin: 'md',
    contents: [
      {
        type: 'button',
        action: { type: 'postback', label: 'つける', data: 'bus_rename_ask=' + patternName, displayText: '名前をつける' },
        style: 'secondary', height: 'sm', flex: 1,
      },
      {
        type: 'button',
        action: { type: 'postback', label: 'このまま', data: 'bus_keep=' + patternName, displayText: 'このまま' },
        style: 'secondary', height: 'sm', flex: 1,
      },
    ],
  });
  if (!isFirst) {
    bodyContents.push({
      type: 'button',
      action: { type: 'postback', label: 'マイバス管理', data: 'bus_settings', displayText: 'マイバス管理' },
      style: 'link', color: '#888888', height: 'sm', margin: 'sm',
    });
  }
  return {
    type: 'bubble',
    body: { type: 'box', layout: 'vertical', contents: bodyContents, paddingAll: '16px' },
  };
}

/** 削除の確認カード */
export function buildDeleteConfirmFlex(patternName: string) {
  return {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: '「' + patternName + '」を\n削除しますか？', size: 'md', weight: 'bold', color: '#1a1a1a', wrap: true },
        {
          type: 'box',
          layout: 'horizontal',
          spacing: 'md',
          margin: 'lg',
          contents: [
            {
              type: 'button',
              action: { type: 'postback', label: '削除する', data: 'bus_del=' + patternName, displayText: patternName + 'を削除する' },
              style: 'primary',
              color: '#FF4444',
              height: 'sm',
              flex: 1,
            },
            {
              type: 'button',
              action: { type: 'postback', label: 'キャンセル', data: 'bus_cancel', displayText: 'キャンセル' },
              style: 'secondary',
              height: 'sm',
              flex: 1,
            },
          ],
        },
      ],
      paddingAll: '16px',
    },
  };
}

/** 新しく保存するときの名前（行き・帰り。使われていれば 行き2, 行き3 …） */
export function nextPatternName(settings: BusSetting[], direction: string): string {
  const existing = new Set(settings.map((s) => s.patternName));
  const base = direction === '往路' ? '行き' : '帰り';
  if (!existing.has(base)) return base;
  let num = 2;
  while (existing.has(base + num)) num++;
  return base + num;
}

/** 「バス」関係のテキストか（名前変更の入力待ちは別に調べる） */
export const BUS_TEXTS = ['バス', 'バス設定', 'マイバス設定', 'マイバス', 'バス検索'];
