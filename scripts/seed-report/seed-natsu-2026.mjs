/**
 * 関ヶ谷レポート 第1号「みんなで作ったやぐら」を写真・動画込みで投入する
 *
 * 元ネタ: D:\ダウンロード\2026_納涼大会\納涼大会2026_記事プレビュー.html
 * 写真: apps/circulars/public/report-sample/（1200px幅に縮小済み）
 *
 * 使い方（リポジトリ直下で）:
 *   node scripts/seed-report/seed-natsu-2026.mjs
 *
 * - .env.development.local の VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY を使う
 * - Storage: newsletter-images/reports/2026-08-natsu/ に upsert（再実行しても同じURL）
 * - DB: 「関ヶ谷レポート」枠に同タイトルの記事があれば更新、無ければ新規作成（非公開で作成）
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const ASSET_DIR = resolve(ROOT, 'apps/circulars/public/report-sample');
const BUCKET = 'newsletter-images';
const STORAGE_PREFIX = 'reports/2026-08-natsu';
const FRAME_TITLE = '関ヶ谷レポート';
const ARTICLE_TITLE = '納涼大会2026：あのやぐら、じつは脚立でできています';
/** 過去に使ったタイトル。タイトル変更後も同じ記事を更新できるように残す */
const PREVIOUS_TITLES = ['みんなで作った櫓（やぐら）', '納涼大会2026：あの櫓、じつは脚立でできています'];

// ---------- env ----------
const env = Object.fromEntries(
  readFileSync(resolve(ROOT, '.env.development.local'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
console.log('Supabase:', env.VITE_SUPABASE_URL);

// ---------- upload ----------
const FILES = {
  hero: { name: 'IMG_5225.jpg', type: 'image/jpeg' },
  yaguraDay: { name: 'IMG_5214.jpg', type: 'image/jpeg' },
  yaguraNight: { name: 'IMG_5240.jpg', type: 'image/jpeg' },
  taiko: { name: 'IMG_5221.jpg', type: 'image/jpeg' },
  soran: { name: 'IMG_5227.jpg', type: 'image/jpeg' },
  night: { name: 'IMG_5238.jpg', type: 'image/jpeg' },
  video: { name: 'soran_720p.mp4', type: 'video/mp4' },
};

const urls = {};
for (const [key, f] of Object.entries(FILES)) {
  const path = `${STORAGE_PREFIX}/${f.name}`;
  const body = readFileSync(resolve(ASSET_DIR, f.name));
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, body, { contentType: f.type, cacheControl: '31536000', upsert: true });
  if (error) {
    console.error(`❌ upload失敗 ${f.name}:`, error.message);
    process.exit(1);
  }
  urls[key] = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  console.log(`✅ ${f.name} (${(body.length / 1024).toFixed(0)}KB) -> ${urls[key]}`);
}

// ---------- content ----------
const content = `こんにちは、DX委員会です。8月9日（日）、草舞台公園で納涼大会2026が開催されました。今年は天気にも恵まれて、しかも少し涼しいくらいの過ごしやすさ。夕方5時、和太鼓の会の呼太鼓とともに、関ヶ谷の夏の一番大きな夜が始まりました。コロナ禍で4年間の中止を経て2024年に再開してから、これで3回目の夏です。

このレポートでは、当日の様子とあわせて、ちょっとだけ「舞台裏」もお見せします。

## 照明やぐらの柱は、借り物の脚立4本

盆踊りの輪の真ん中で光っていたやぐら。名前は「**照明やぐら**」といいます。業者さんに頼んだものではなく、経費を抑えつつ温もりある手作りの祭りにしようと、実行委員会が自作しているもの。しかも今年は「昨年以上に大きくて明るいやぐらを」という計画でした。

![柱をよく見ると…園芸用の三脚脚立です](${urls.yaguraDay})

![提灯と紙花で化粧をした夜の完成形](${urls.yaguraNight})

その柱になったのが、**園芸用のアルミ三脚脚立（梯子の長さ約3.5m）×4本**。もちろん自治会の備品ではありません。大会を前に「大きな脚立をお貸しいただけませんか？」という緊急のお願いが、掲示板と公式LINEで流れました。すると、ちゃんと貸してくださる方が現れて、無事に4本が集結。おかげさまで、やぐらはしっかりと立ち上がりました。あのやぐらは文字通り、会員さんの持ち寄りでできています。

（この緊急募集を公式LINEで一斉配信できたのは、LINEの仕組みを作ってきたDX委員会として、ちょっと嬉しい瞬間でした）

設営や照明も、今年は例年ほど手をかけられない事情があったのですが、技術担当さんが大奮闘。前日夜には本番さながらの点灯テストまでやってくれて、当日はご覧の通りの灯りになりました。8月6日には実行委員長から「予定通り開催します！」の開催宣言がLINEで届き、翌7日から会場の準備がスタート。当日を迎えるまでに、こんな物語が動いていました。

## 子どもたちのダンスから、盆踊りへ

![夕暮れ、法被姿の和太鼓の会が太鼓とともに登場](${urls.taiko})

ステージで盛り上がったのが、盆踊り前の子どもたちのダンスタイム。パイナポー体操とジャンボリミッキーで会場が一気に温まりました。

釜利谷バトン部のバトン・トワリング、和太鼓演奏と続いて、いよいよ盆踊り。今年の選曲はこちらです。

> ジャンボリミッキー、炭坑節、ドラえもん音頭、東京音頭、ビューティフルサンデー、マツケンサンバ、あしびなー

炭坑節とマツケンサンバが同じやぐらを囲む。これが2026年の関ヶ谷の盆踊りです。1回目の盆踊りに参加した人には参加賞として**ガリガリ君**の配布も。踊ったあとのアイス、最高でした。

そして終盤、釜利谷ソーラン踊ろう会と西金沢学園有志の皆さんによる、**よさこいソーラン**。踊り終わると会場からアンコールの声が上がり、ソーラン節をもう一度。この日いちばんの盛り上がりでした。

![照明やぐらの光を浴びてソーランを踊る子どもたち。この後、アンコールの声が上がった](${urls.soran})

![よさこいソーラン、この日いちばんの盛り上がり（動画・28秒）](${urls.video})

## 模擬店8店舗と、クラフトビール

![提灯の連なりとテントの灯り。夜が深まるほど賑わいは増していく](${urls.night})

模擬店は**8店舗**。「ピヨンセの台所」「Tosho cafe'」「輪投げ屋さん」——各団体の個性が店名からにじみます。ソフトボール倶楽部の焼きそば、ふれあい本舗のコロッケにカレーパン。

そして会場を賑わせたのが、プロの出店者による**クラフトビール**。昨年から出店のルールが整い、プロのお店も参加できるようになりました。本格的な焼き鳥とビールを片手に盆踊りを眺める——そんな楽しみ方も、納涼大会の新しい風景になりつつあります。

ひそかに注目していたのが「**防災食堂**」。ホットドッグや唐揚げに混じって、防災備蓄の**アルファ米**がメニューに並びました。お祭りで防災を身近に感じてもらえたら——という担当者の仕掛けです。

結果は……なんと売り上げゼロ。お祭りの夜、焼きそばの隣にアルファ米があれば、つい焼きそばに手が伸びるのが人情というもの。それでも提案した担当者は「**今後の防災イベントでリベンジを果たす覚悟です**」とのこと。この前向きさこそ、関ヶ谷の防災を支えている力なのかもしれません。次の出番にご期待ください。

## 1等は防犯カメラ

フィナーレはお楽しみ抽選会。1等はなんと**防犯カメラ**（取り付け工事付き）。景品にまで自治会らしさが宿っています。午後8時半頃、閉会宣言とともに納涼大会2026は幕を閉じました。

## 来年に向けて

脚立を貸してくれた人、設営に来てくれた人、模擬店に立ってくれた人。納涼大会は、そんなみんなのちょっとした協力でできています。来年の夏も、この公園にやぐらの灯りがともりますように。

「お祭りを手伝ってみたいな」「来年は出店してみたいな」と思った方は、下記までお気軽にお問い合わせください。

**納涼大会のお手伝い・出店のお問い合わせ**
関ヶ谷自治会館　TEL 045-784-4447
公式LINEのメッセージからでもお気軽にどうぞ。

[当日の写真をもっと見る（公式サイト・納涼大会ページ）](https://www.sekigayajichikai.com/イベント/納涼大会/)`;

// ---------- DB ----------
const { data: frames, error: frameErr } = await supabase
  .from('newsletters')
  .select('id, title, status, organization_id')
  .eq('title', FRAME_TITLE);
if (frameErr) {
  console.error('❌ newsletters取得失敗:', frameErr.message);
  process.exit(1);
}
let frame = frames?.[0];
if (!frame) {
  // 枠が無ければ作成（公開状態。記事側の visibility で見せる/見せないを制御する）
  const { data, error } = await supabase
    .from('newsletters')
    .insert({
      title: FRAME_TITLE,
      issue_date: new Date().toISOString().split('T')[0],
      status: 'published',
      published_at: new Date().toISOString(),
      organization_id: null,
      created_by: null,
      source_pdf_url: null,
      parent_id: null,
    })
    .select('id, title, status, organization_id')
    .single();
  if (error) {
    console.error('❌ 枠の作成失敗:', error.message);
    process.exit(1);
  }
  frame = data;
  console.log('✅ 「関ヶ谷レポート」枠を作成:', frame.id);
}
console.log('枠:', frame.id, frame.status);

const attachments = [
  { type: 'image', url: urls.hero, label: 'IMG_5225.jpg' },
  { type: 'image', url: urls.yaguraDay, label: 'IMG_5214.jpg' },
  { type: 'image', url: urls.yaguraNight, label: 'IMG_5240.jpg' },
  { type: 'image', url: urls.taiko, label: 'IMG_5221.jpg' },
  { type: 'image', url: urls.soran, label: 'IMG_5227.jpg' },
  { type: 'image', url: urls.night, label: 'IMG_5238.jpg' },
];

const fields = {
  title: ARTICLE_TITLE,
  headline: '納涼大会',
  brief: '脚立4本で作った手作りの照明やぐら',
  summary: '会員が持ち寄った脚立4本で照明やぐらを手作り。盆踊りや模擬店で賑わった納涼大会2026のレポート。',
  content,
  event_date: '2026-08-09',
  event_time: '17:00-20:30',
  event_location: '草舞台公園',
  thumbnail_url: urls.hero,
  attachments,
  tags: ['イベントレポート'],
  source: 'DX委員会',
  is_pinned: true,
};

const { data: existing } = await supabase
  .from('articles')
  .select('id, visibility')
  .eq('newsletter_id', frame.id)
  .in('title', [ARTICLE_TITLE, ...PREVIOUS_TITLES])
  .limit(1);

if (existing?.length) {
  const { error } = await supabase
    .from('articles')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', existing[0].id);
  if (error) {
    console.error('❌ 記事更新失敗:', error.message);
    process.exit(1);
  }
  console.log(`✅ 既存記事を更新: ${existing[0].id}（公開状態は変更なし: ${existing[0].visibility}）`);
} else {
  const { data, error } = await supabase
    .from('articles')
    .insert({
      newsletter_id: frame.id,
      organization_id: frame.organization_id,
      category: 'event-report',
      article_type: 'official',
      priority: 'medium',
      control_date: null,
      visibility: 'board-only', // 非公開で作成。管理画面で確認してから公開する
      display_order: 0,
      ...fields,
    })
    .select('id')
    .single();
  if (error) {
    console.error('❌ 記事作成失敗:', error.message);
    process.exit(1);
  }
  console.log(`✅ 記事を新規作成（非公開）: ${data.id}`);
}
console.log('完了。/admin?mode=reports で確認してください。');
