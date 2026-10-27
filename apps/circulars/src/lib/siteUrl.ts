/**
 * 住民に渡すリンク（LINE 配信・共有・確認依頼）の行き先になる公開サイトのURL
 *
 * 決め方: VITE_PUBLIC_SITE_URL があればそれ → 開いている画面が本番などならそのオリジン →
 * ローカル（localhost・LAN の IP）や Vercel の保護付きアドレス（portal-xxxx-hanainc.vercel.app）で
 * 開いているときは本番サイト。
 *
 * 以前は「開いている画面のオリジン」をそのまま使っていたため、ローカルから週次配信を送ると
 * http://localhost:5175/... のリンクが全員に届いた（2026-10-05）。ローカルのアドレスは外に出さない。
 */

/** 本番の公開サイト（回覧板） */
export const PRODUCTION_SITE_URL = 'https://sekigayajichikai.vercel.app';

/** ローカル開発のアドレスか（localhost / 127.x / 192.168.x / [::1] / *.localhost） */
export const isLocalOrigin = (url: string) => /^https?:\/\/(localhost|127\.|192\.168\.|10\.|\[::1\]|[^/]+\.localhost)/.test(url);

/**
 * Vercel が配る「デプロイごと・ブランチごとのアドレス」か（portal-xxxxx-hanainc.vercel.app、portal-git-xxx-hanainc.vercel.app）。
 * これらは Vercel の保護がかかっていて、開くと Vercel へのログインを求められる。住民や確認者には渡せない（2026-10-27）。
 * 本番の sekigayajichikai.vercel.app だけが誰でも開ける。
 */
export const isVercelInternalOrigin = (url: string) =>
  /\.vercel\.app$/i.test(url.replace(/\/+$/, '')) && url.replace(/\/+$/, '').toLowerCase() !== PRODUCTION_SITE_URL;

/** 外の人に渡せないアドレスか（ローカル、または Vercel の保護付きアドレス） */
export const isPrivateOrigin = (url: string) => isLocalOrigin(url) || isVercelInternalOrigin(url);

export const publicSiteUrl = (): string => {
  const fromEnv = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.trim();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const base = fromEnv || (origin && !isPrivateOrigin(origin) ? origin : PRODUCTION_SITE_URL);
  return base.replace(/\/+$/, '');
};
