/**
 * 住民に渡すリンク（LINE 配信・共有・確認依頼）の行き先になる公開サイトのURL
 *
 * 決め方: VITE_PUBLIC_SITE_URL があればそれ → 開いている画面が本番などならそのオリジン →
 * ローカル（localhost・LAN の IP）で開いているときは本番サイト。
 *
 * 以前は「開いている画面のオリジン」をそのまま使っていたため、ローカルから週次配信を送ると
 * http://localhost:5175/... のリンクが全員に届いた（2026-10-05）。ローカルのアドレスは外に出さない。
 */

/** 本番の公開サイト（回覧板） */
export const PRODUCTION_SITE_URL = 'https://sekigayajichikai.vercel.app';

/** ローカル開発のアドレスか（localhost / 127.x / 192.168.x / [::1] / *.localhost） */
export const isLocalOrigin = (url: string) => /^https?:\/\/(localhost|127\.|192\.168\.|10\.|\[::1\]|[^/]+\.localhost)/.test(url);

export const publicSiteUrl = (): string => {
  const fromEnv = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.trim();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const base = fromEnv || (origin && !isLocalOrigin(origin) ? origin : PRODUCTION_SITE_URL);
  return base.replace(/\/+$/, '');
};
