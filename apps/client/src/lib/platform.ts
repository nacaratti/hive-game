import { Capacitor } from '@capacitor/core';

/**
 * Where the client runs:
 * - web: served by a host's server (connects to the same origin);
 * - desktop: inside the Electron app (see lib/desktop.ts);
 * - mobile: Android/iOS app (Capacitor). The page is bundled in the app, so the
 *   player must choose which host to connect to.
 */
export type Platform = 'web' | 'desktop' | 'mobile';

/** Development only: `?mobile` makes the browser behave like the app (pick a server, cross-origin connection). */
const forceMobile = import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('mobile');

export const platform: Platform =
  typeof window !== 'undefined' && window.hiveDesktop ? 'desktop' : Capacitor.isNativePlatform() || forceMobile ? 'mobile' : 'web';

export const isMobileApp = platform === 'mobile';

/**
 * Static web build (Vercel): no game server at all. Offers the computer opponent,
 * two players on one device, and browser-to-browser matches by link.
 */
export const webOnly = import.meta.env.VITE_WEB_ONLY === 'true';
