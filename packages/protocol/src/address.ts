export const DEFAULT_SERVER_PORT = 4242;

export interface ServerAddress {
  /** e.g. "http://192.168.0.12:4242" or "https://abc.trycloudflare.com" */
  origin: string;
  /** Room to join right away (from an invitation link), if any. */
  room: string | null;
}

/**
 * Understands what people paste or scan: "192.168.0.12", "192.168.0.12:4242",
 * full links with "?sala=", and invitation pages with "?servidor=…&sala=…".
 */
export function parseServerAddress(text: string, defaultPort = DEFAULT_SERVER_PORT): ServerAddress | null {
  let raw = text.trim();
  if (!raw || raw.length > 500) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    if (!/^https?:\/\//i.test(raw)) return null;
  } else {
    raw = `http://${raw}`;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const nested = url.searchParams.get('servidor');
  if (nested) {
    const inner = parseServerAddress(nested, defaultPort);
    return inner ? { origin: inner.origin, room: url.searchParams.get('sala') ?? inner.room } : null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.protocol === 'http:' && !url.port) url.port = String(defaultPort);
  return { origin: url.origin, room: url.searchParams.get('sala') };
}
