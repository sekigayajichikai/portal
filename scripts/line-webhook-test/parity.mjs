// Edge Function line-webhook のバス（supabase/functions/line-webhook/bus.ts）が、
// 名簿GAS の BusTimetable.js と同じメッセージを作るかを確かめる。
//
// 使い方: TZ=Asia/Tokyo node scripts/line-webhook-test/parity.mjs
//   名簿GAS のコードは scripts/gas/（clasp clone。コミットしない）にある前提。
//   GAS のコードを Node の中で動かし、シート・キャッシュ・カレンダーは偽物を渡す。
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as bus from '../../supabase/functions/line-webhook/bus.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const gasSrc = fs.readFileSync(path.join(here, '../gas/BusTimetable.js'), 'utf8');

if (new Date(2026, 0, 1).getTimezoneOffset() !== -540) {
  console.error('TZ=Asia/Tokyo で動かしてください（GAS は日本時間で動くため）');
  process.exit(1);
}

// ---- 試験データ（本物の形をまねる）----
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6〜23時
const STOPS = ['野村住宅センター', '関ヶ谷', '谷津坂', '夏山坂上', '金沢文庫駅西口']; // 夏山坂上は停留所選びに出さない（BUS_HIDDEN_STOPS）
function cellsFor(seed) {
  return HOURS.map((h) => (h % 3 === seed % 3 ? '' : [5 + seed, 25 + seed, 45 + seed].filter((m) => m < 60).join(',')));
}
const sheet = [['方向', '曜日区分', '停留所名', ...HOURS]];
let seed = 0;
for (const dir of ['往路', '復路']) for (const dt of ['平日', '土休日']) for (const s of STOPS) sheet.push([dir, dt, s, ...cellsFor(seed++)]);

const holidays = new Set([20261012, 20261103, 20261123]); // スポーツの日・文化の日・勤労感謝の日
const special = [[new Date(2026, 7, 12), new Date(2026, 7, 14), '土休日', '夏休み']];
const settingsRows = [['UserID', 'ルート名', '方向', '停留所名', '作成日時'],
  ['U1', '行き', '往路', '関ヶ谷', ''], ['U1', '帰り', '復路', '谷津坂', ''], ['U1', '会社', '往路', '谷津坂', '']];

// ---- GAS を Node で動かす ----
let fakeNow = Date.now();
const RealDate = Date;
class FakeDate extends RealDate {
  constructor(...a) { if (a.length === 0) super(fakeNow); else super(...a); }
  static now() { return fakeNow; }
}
const sheetOf = (rows) => ({ getDataRange: () => ({ getValues: () => rows.map((r) => r.slice()) }) });
const store = new Map();
const ctx = {
  Date: FakeDate, JSON, Math, String, Number, parseInt, isNaN, Object, Array, console: { log() {} },
  CacheService: { getScriptCache: () => ({
    get: (k) => (store.has(k) ? store.get(k) : null),
    put: (k, v) => store.set(k, v),
    remove: (k) => store.delete(k),
    getAll: (ks) => Object.fromEntries(ks.filter((k) => store.has(k)).map((k) => [k, store.get(k)])),
  }) },
  SpreadsheetApp: { openById: () => ({ getSheetByName: (n) =>
    n === 'バス時刻表' ? sheetOf(sheet) : n === '特別ダイヤ' ? sheetOf([['開始日', '終了日', 'ダイヤ区分', 'メモ'], ...special]) : n === 'バス設定' ? sheetOf(settingsRows) : null }) },
  // 内閣府の祝日一覧（CSV）の偽物
  UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '国民の祝日・休日月日,国民の祝日・休日名称\r\n' +
    [...holidays].map((n) => `${Math.floor(n / 10000)}/${Math.floor(n / 100) % 100}/${n % 100},祝日`).join('\r\n') }) },
  // 代用の Google カレンダー（内閣府の一覧が読めたときは使われない。使われたら祝日でない行事で判定がずれる）
  CalendarApp: { getCalendarById: () => ({ getEventsForDay: (d) => {
    const n = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    return holidays.has(n) ? [{ getTitle: () => '祝日' }] : [{ getTitle: () => '誕生日' }];
  } }) },
};
vm.createContext(ctx);
vm.runInContext(gasSrc, ctx);

// ---- 同じ材料を bus.ts 用にも作る ----
const rows = sheet.slice(1).map((r) => ({ direction: r[0], dayType: r[1], stopName: r[2], times: vm.runInContext(`getBusTimetable(${JSON.stringify(r[0])}, ${JSON.stringify(r[1])}, ${JSON.stringify(r[2])})`, ctx) }));
const specialDays = special.map(([s, e, dt]) => ({ start: s.getFullYear() * 10000 + (s.getMonth() + 1) * 100 + s.getDate(), end: e.getFullYear() * 10000 + (e.getMonth() + 1) * 100 + e.getDate(), dayType: dt }));
const settings = settingsRows.slice(1).map((r) => ({ patternName: r[1], direction: r[2], stopName: r[3] }));

let fail = 0;
let pass = 0;
function same(name, a, b) {
  const ja = JSON.stringify(a);
  const jb = JSON.stringify(b);
  if (ja === jb) { pass++; return; }
  fail++;
  let i = 0;
  while (ja[i] === jb[i]) i++;
  console.log(`NG ${name}\n  GAS : …${ja.slice(Math.max(0, i - 60), i + 80)}\n  Edge: …${jb.slice(Math.max(0, i - 60), i + 80)}`);
}
const gas = (expr) => JSON.parse(JSON.stringify(vm.runInContext(expr, ctx)));

// 方向選び・停留所選び・設定一覧
same('方向選び', gas('buildDirectionSelectFlex()'), bus.buildDirectionSelectFlex());
for (const dir of ['往路', '復路']) same(`停留所選び ${dir}`, gas(`buildStopSelectFlex("${dir}")`), bus.buildStopSelectFlex(dir, bus.getStopNames(rows)));
same('設定一覧', gas('buildSettingsListFlex("U1")'), bus.buildSettingsListFlex(settings));
same('設定一覧（なし）', gas('buildSettingsListFlex("U9")'), bus.buildSettingsListFlex([]));

// 時刻表: 日時をいろいろ変えて（祝日前日・祝日・土日・特別ダイヤ・深夜・早朝・バス終了後）
const moments = [
  '2026-10-11T09:00', '2026-10-11T23:59', '2026-10-12T00:00', '2026-10-12T06:00', '2026-10-13T12:34',
  '2026-10-16T22:10', '2026-10-17T05:00', '2026-11-02T18:00', '2026-08-11T07:44', '2026-08-14T23:30',
  '2026-12-31T23:50', '2027-01-01T08:00',
];
for (const m of moments) {
  fakeNow = new RealDate(m + ':00+09:00').getTime();
  store.clear();
  const now = new RealDate(fakeNow);
  const today = bus.getDayType(now, specialDays, holidays);
  const tomorrow = bus.getDayType(new RealDate(fakeNow + 86400000), specialDays, holidays);
  same(`ダイヤ判定 ${m}`, gas('getDayType(new Date())'), today);
  // 別のダイヤを見たときの「次は ◯月◯日（◯）」
  const other = today === '平日' ? '土休日' : '平日';
  const nextDate = bus.nextDateOfDayType(now, other, specialDays, holidays);
  same(`次の${other} ${m}`,
    gas(`buildTimetableFlex("往路", "関ヶ谷", "${other}", [], false, true, null, nextDateOfDayType_("${other}"))`),
    bus.buildTimetableFlex('往路', '関ヶ谷', other, [], false, true, null, now, tomorrow, nextDate));
  for (const dir of ['往路', '復路']) {
    for (const stop of ['関ヶ谷', '谷津坂']) {
      const times = bus.getBusTimetable(rows, dir, today, stop);
      same(`時刻 ${m} ${dir} ${stop}`, gas(`getBusTimetable("${dir}", getDayType(new Date()), "${stop}")`), times);
      const others = bus.getOtherRoutes(settings, dir, stop);
      for (const [isSaved, isSwitched] of [[false, false], [true, false], [true, true], [false, true]]) {
        const o = isSaved ? others : null;
        same(`時刻表 ${m} ${dir} ${stop} saved=${isSaved} switched=${isSwitched}`,
          gas(`buildTimetableFlex("${dir}", "${stop}", "${today}", getBusTimetable("${dir}", "${today}", "${stop}"), ${isSaved}, ${isSwitched}, ${isSaved ? JSON.stringify(others) : 'null'})`),
          bus.buildTimetableFlex(dir, stop, today, times, isSaved, isSwitched, o, now, tomorrow));
      }
    }
  }
}

// 保存の名前づけ（GAS は handleBusPostback の中なので、規則だけ確かめる）
same('名前 行き（空）', '行き', bus.nextPatternName([], '往路'));
same('名前 行き2', '行き2', bus.nextPatternName([{ patternName: '行き' }], '往路'));
same('名前 行き3', '行き3', bus.nextPatternName([{ patternName: '行き' }, { patternName: '行き2' }], '往路'));
same('名前 帰り', '帰り', bus.nextPatternName([{ patternName: '行き' }], '復路'));

console.log(fail === 0 ? `全部一致（${pass}件）` : `不一致 ${fail}件／一致 ${pass}件`);
process.exit(fail === 0 ? 0 : 1);
