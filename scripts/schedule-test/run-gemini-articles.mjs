/**
 * 記事テキストからのスケジュール抽出テスト（本番の「AIで抽出」の記事読み取りと同じプロンプト・同じリクエスト形式）
 *
 * 使い方（リポジトリ直下で）:
 *   node scripts/schedule-test/run-gemini-articles.mjs "<号の題名>" [キーワード] [model] [出力ラベル]
 *   例: node scripts/schedule-test/run-gemini-articles.mjs "2026年10月号" 合同会議
 *
 * - 号の記事を Supabase から読み（読み取りのみ）、本番コード（eventExtractionPrompt.ts）の buildArticleEventPrompt で抽出する
 * - 基準日は号の issue_date、本日は実行日（本番と同じ）。主催団体・会場マスタも本番と同じく渡す
 * - キーワードを指定すると、そのキーワードを含む記事の一節と、抽出結果に入ったかを表示する
 * - 結果は results/<ラベル>.json に保存
 * - .env.development.local の VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / VITE_GEMINI_API_KEY を使う（無料枠）
 */

import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPromptModule } from './build-prompt.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const [nlTitle, keyword = '', model = 'gemini-3.6-flash', label = `articles-${Date.now()}`] = process.argv.slice(2);
if (!nlTitle) {
  console.error('使い方: node scripts/schedule-test/run-gemini-articles.mjs "<号の題名>" [キーワード] [model] [label]');
  process.exit(1);
}
const TODAY = new Date().toISOString().slice(0, 10);

const env = Object.fromEntries(
  readFileSync(resolve(ROOT, '.env.development.local'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const ai = new GoogleGenAI({ apiKey: env.VITE_GEMINI_API_KEY });

// ---------- 号と記事 ----------
const { data: nls, error: nlErr } = await sb.from('newsletters').select('id,title,status,issue_date').eq('title', nlTitle);
if (nlErr) throw nlErr;
const nl = nls?.find((n) => n.status === 'published') ?? nls?.[0];
if (!nl) {
  console.error(`号「${nlTitle}」が見つかりません`);
  process.exit(1);
}
const { data: articles, error: aErr } = await sb.from('articles').select('*').eq('newsletter_id', nl.id).order('display_order', { ascending: true, nullsFirst: false });
if (aErr) throw aErr;
console.log(`号: ${nl.title}（${nl.status}・発行日 ${nl.issue_date}）記事 ${articles.length}件 / 本日 ${TODAY} / ${model}`);

if (keyword) {
  for (const [i, a] of articles.entries()) {
    const text = `${a.title}\n${a.content ?? ''}`;
    let at = text.indexOf(keyword);
    while (at >= 0) {
      const cut = (a.content ?? '').length > 2000 && at > 2000 + a.title.length ? '（※本文2000字より後ろ＝プロンプトでは切り捨て）' : '';
      console.log(`  記事${i}「${a.title}」: …${text.slice(Math.max(0, at - 40), at + 60).replace(/\s+/g, ' ')}…${cut}`);
      at = text.indexOf(keyword, at + keyword.length);
    }
  }
}

// ---------- 抽出（本番と同じ） ----------
// 本番（getOrganizerNames）と同じく、団体マスタ booking_organizations の主催の候補
const orgNames = ((await sb.from('booking_organizations').select('name').eq('use_as_organizer', true).not('is_active', 'is', false)).data ?? []).map((o) => o.name);
const venueNames = ((await sb.from('venues').select('name')).data ?? []).map((v) => v.name);
const mod = await loadPromptModule();
const prompt = mod.buildArticleEventPrompt({ articles, referenceDate: nl.issue_date, cutoffDate: TODAY, organizerNames: orgNames, venueNames });

let res;
for (let attempt = 1; ; attempt++) {
  try {
    res = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { responseMimeType: 'application/json', temperature: 0 },
    });
    break;
  } catch (e) {
    const msg = String(e?.message ?? e);
    // 1日の上限（PerDay）は待っても戻らない。再試行も回数に数えられるので、すぐやめる
    if (attempt >= 4 || /PerDay/i.test(msg) || !/429|503|RESOURCE_EXHAUSTED|UNAVAILABLE|high demand|quota/i.test(msg)) throw e;
    const m = msg.match(/retry in ([\d.]+)s/i) ?? msg.match(/"retryDelay":"(\d+)s"/);
    const wait = m ? Math.ceil(Number(m[1]) * 1000) + 1000 : 15000 * attempt;
    console.log(`   ↻ ${Math.round(wait / 1000)}秒待って再試行`);
    await new Promise((r) => setTimeout(r, wait));
  }
}
const events = mod.parseEventCandidatesFromResponse(res.text ?? '', articles.length);
console.log(`\n抽出 ${events.length}件:`);
for (const e of events) {
  const hit = keyword && e.title.includes(keyword) ? '  ◀' : '';
  console.log(`  ${e.event_date} ${e.event_time ?? ''} ${e.title}${e.digest_exclude ? ' 🚫' : ''}（記事${e.article_index ?? '-'}）${hit}`);
}
if (keyword) console.log(`\n「${keyword}」を含む予定: ${events.filter((e) => e.title.includes(keyword)).length}件`);

const outPath = resolve(__dirname, 'results', `${label}.json`);
writeFileSync(outPath, JSON.stringify({ newsletter: nl, model, today: TODAY, usage: res.usageMetadata ?? null, events }, null, 2), 'utf8');
console.log(`保存: ${outPath}`);
