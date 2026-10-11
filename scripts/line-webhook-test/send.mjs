// Edge Function line-webhook に試験用の署名つきイベントを送る（LINE には返信しない。返すはずのメッセージと検証結果が返る）
// 使い方: WEBHOOK_TEST_SECRET=... node scripts/line-webhook-test/send.mjs <text|postback:data> [...] [--forward] [--raw]
//   --forward … GAS への受け渡しも試す   --raw … 結果の JSON をそのまま出す
import crypto from 'node:crypto';
const URL_ = 'https://iplcopuwwzbtwoakqifh.supabase.co/functions/v1/line-webhook';
const USER = process.env.TEST_USER_ID || 'U53d00bbe4e7850a4724abe2f85edac4d';
const secret = process.env.WEBHOOK_TEST_SECRET;
const args = process.argv.slice(2);
const forward = args.includes('--forward');
const raw = args.includes('--raw');
const src = { type: 'user', userId: USER };
for (const a of args.filter((x) => !x.startsWith('--'))) {
  const ev = a.startsWith('postback:')
    ? { type: 'postback', replyToken: 'test', source: src, timestamp: Date.now(), mode: 'active', webhookEventId: 'test', deliveryContext: { isRedelivery: false }, postback: { data: a.slice(9) } }
    : { type: 'message', replyToken: 'test', source: src, timestamp: Date.now(), mode: 'active', webhookEventId: 'test', deliveryContext: { isRedelivery: false }, message: { type: 'text', id: '1', text: a } };
  const body = JSON.stringify({ destination: 'test', events: [ev] });
  const sig = secret ? crypto.createHmac('sha256', secret).update(body).digest('base64') : 'bad';
  const t = Date.now();
  const res = await fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-line-signature': sig, ...(forward ? { 'x-test-forward': '1' } : {}) }, body });
  const ms = Date.now() - t;
  const out = await res.text();
  if (raw) { console.log(out); continue; }
  let j; try { j = JSON.parse(out); } catch { j = out; }
  const tm = j.timings?.[0];
  const v = (j.validated ?? []).map((x) => x.status).join(',');
  const alt = (j.sent ?? []).flatMap((s) => s.messages.map((m) => m.altText ?? m.text?.slice(0, 30))).join(' | ');
  console.log(`${a.padEnd(36)} HTTP ${res.status} 全体 ${ms}ms 処理 ${tm?.ms ?? '-'}ms 自前=${tm?.handled ?? '-'} 検証=${v || '-'} 返事=${alt || '-'}${tm?.error ? ' エラー=' + tm.error.slice(0, 120) : ''}${j.forward ? ' GAS=' + j.forward.status + '/' + j.forward.ms + 'ms' : ''}${res.status !== 200 ? ' ' + out : ''}`);
}
