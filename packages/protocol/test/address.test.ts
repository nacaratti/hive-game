import { describe, expect, it } from 'vitest';
import { parseServerAddress } from '../src';

describe('parseServerAddress', () => {
  it('adds the default port to bare LAN addresses', () => {
    expect(parseServerAddress('192.168.0.12')).toEqual({ origin: 'http://192.168.0.12:4242', room: null });
    expect(parseServerAddress(' 192.168.0.12:5000 ')).toEqual({ origin: 'http://192.168.0.12:5000', room: null });
  });

  it('keeps https tunnel links and the invited room', () => {
    expect(parseServerAddress('https://abc-def.trycloudflare.com/?sala=1a2b')).toEqual({ origin: 'https://abc-def.trycloudflare.com', room: '1a2b' });
  });

  it('reads invitation pages that point to a server', () => {
    const link = 'https://site.example/entrar?servidor=' + encodeURIComponent('http://10.0.0.5:4242') + '&sala=xyz';
    expect(parseServerAddress(link)).toEqual({ origin: 'http://10.0.0.5:4242', room: 'xyz' });
  });

  it('rejects junk', () => {
    expect(parseServerAddress('')).toBeNull();
    expect(parseServerAddress('http://')).toBeNull();
    expect(parseServerAddress('ftp://x')).toBeNull();
  });
});
