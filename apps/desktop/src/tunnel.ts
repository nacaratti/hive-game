import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { TunnelState } from '@hive/protocol';

/** Official release asset from Cloudflare's GitHub. */
const DOWNLOAD_URL = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';
const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

/**
 * Exposes the local server on the internet through a Cloudflare Quick Tunnel:
 * free, no account, no router configuration, works behind CGNAT.
 */
export class Tunnel {
  state: TunnelState = { status: 'off' };
  private proc: ChildProcess | null = null;

  constructor(
    private readonly dirs: { bundled: string; user: string },
    private readonly onChange: (state: TunnelState) => void,
  ) {
    if (!this.binary()) this.set({ status: 'missing' });
  }

  private binary(): string | null {
    const exe = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
    for (const dir of [this.dirs.bundled, this.dirs.user]) {
      const p = join(dir, exe);
      if (existsSync(p)) return p;
    }
    return null;
  }

  private set(state: TunnelState) {
    this.state = state;
    this.onChange(state);
  }

  /** Downloads cloudflared into the user data folder (only on the user's request). */
  async download(): Promise<void> {
    if (this.binary()) return this.set({ status: 'off' });
    this.set({ status: 'downloading', progress: 0 });
    try {
      await mkdir(this.dirs.user, { recursive: true });
      const res = await fetch(DOWNLOAD_URL, { redirect: 'follow' });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const total = Number(res.headers.get('content-length')) || 0;
      let received = 0;
      const tmp = join(this.dirs.user, 'cloudflared.download');
      const body = Readable.fromWeb(res.body as never);
      body.on('data', (chunk: Buffer) => {
        received += chunk.length;
        if (total) this.state = { status: 'downloading', progress: received / total };
      });
      const ticker = setInterval(() => this.onChange(this.state), 300);
      try {
        await pipeline(body, createWriteStream(tmp));
      } finally {
        clearInterval(ticker);
      }
      await rename(tmp, join(this.dirs.user, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared'));
      this.set({ status: 'off' });
    } catch (e) {
      await rm(join(this.dirs.user, 'cloudflared.download'), { force: true });
      this.set({ status: 'missing', error: `Não foi possível baixar o cloudflared (${(e as Error).message}).` });
    }
  }

  start(port: number): void {
    if (this.proc) return;
    const bin = this.binary();
    if (!bin) return this.set({ status: 'missing' });
    this.set({ status: 'starting' });
    const proc = spawn(bin, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`], { windowsHide: true });
    this.proc = proc;
    let found = false;
    const scan = (data: Buffer) => {
      const m = URL_RE.exec(data.toString());
      if (m && !found) {
        found = true;
        this.set({ status: 'on', url: m[0] });
      }
    };
    proc.stdout?.on('data', scan);
    proc.stderr?.on('data', scan);
    const timeout = setTimeout(() => {
      if (!found) {
        this.stop();
        this.set({ status: 'error', error: 'O túnel não respondeu. Verifique sua conexão com a internet.' });
      }
    }, 30_000);
    proc.on('exit', (code) => {
      clearTimeout(timeout);
      if (this.proc !== proc) return;
      this.proc = null;
      if (this.state.status !== 'off') this.set({ status: 'error', error: `O túnel foi encerrado (código ${code ?? '?'}).` });
    });
    proc.on('error', (e) => {
      clearTimeout(timeout);
      this.proc = null;
      this.set({ status: 'error', error: e.message });
    });
  }

  stop(): void {
    const proc = this.proc;
    this.proc = null;
    if (proc && !proc.killed) proc.kill();
    this.set({ status: this.binary() ? 'off' : 'missing' });
  }
}
