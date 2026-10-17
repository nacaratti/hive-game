import { app, BrowserWindow, clipboard, ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
import { join } from 'node:path';
import { PROTOCOL_VERSION, parseServerAddress } from '@hive/protocol';
import { DEFAULT_PORT, announce, discover, lanAddresses, startServer, type Announcer, type Discovery, type RunningServer } from '@hive/server';
import type { HostInfo, LanServerInfo } from '@hive/protocol';
import { Tunnel } from './tunnel';

const isDev = !app.isPackaged;
const resources = isDev ? join(__dirname, '..') : process.resourcesPath;
const clientDir = isDev ? join(__dirname, '../../client/dist') : join(resources, 'client');

let win: BrowserWindow | null = null;
let server: RunningServer | null = null;
let beacon: Announcer | null = null;
let lan: Discovery | null = null;
let tunnel: Tunnel | null = null;

const homeUrl = () => `http://localhost:${server!.port}`;

const hostInfo = (): HostInfo => ({
  port: server!.port,
  lanUrls: lanAddresses().map((ip) => `http://${ip}:${server!.port}`),
  tunnel: tunnel!.state,
});

const lanList = (): LanServerInfo[] => (lan?.list() ?? []).map(({ id, name, url, rooms, players }) => ({ id, name, url, rooms, players }));

async function boot(): Promise<void> {
  const serverName = `Servidor de ${process.env.USERNAME ?? process.env.USER ?? 'Favo'}`;
  const opts = {
    clientDir,
    dataDir: join(app.getPath('userData'), 'data'),
    serverName,
    version: app.getVersion(),
    botWorker: join(__dirname, 'bot-worker.cjs'),
  };
  try {
    server = await startServer({ ...opts, port: DEFAULT_PORT });
  } catch {
    // Port busy (another copy running): take any free port.
    server = await startServer({ ...opts, port: 0 });
  }
  beacon = announce(() => {
    const info = server!.hub.info();
    return { name: serverName, port: server!.port, rooms: info.rooms, players: info.players };
  });
  lan = discover({ ignoreId: () => beacon?.id, onChange: (list) => win?.webContents.send('lan:changed', list) });
  tunnel = new Tunnel({ bundled: join(resources, 'bin'), user: join(app.getPath('userData'), 'bin') }, () =>
    win?.webContents.send('host:changed', hostInfo()),
  );
  // Refresh LAN rows (room counts) periodically for an open lobby.
  setInterval(() => win?.webContents.send('lan:changed', lanList()), 3000);
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#2a211b',
    title: 'Favo',
    autoHideMenuBar: true,
    icon: join(resources, 'build', 'icon.png'),
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: [`--hive-home=${homeUrl()}`],
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!/^https?:\/\//.test(url)) e.preventDefault();
  });
  win.on('closed', () => (win = null));
  win.loadURL(homeUrl());
}

/** Only the home page (our own server) may control hosting features. */
const fromHome = (e: IpcMainInvokeEvent) => !!server && (e.senderFrame?.url ?? '').startsWith(homeUrl());

ipcMain.handle('host:info', () => hostInfo());
ipcMain.handle('lan:list', () => lanList());
ipcMain.handle('tunnel:start', (e) => {
  if (fromHome(e)) tunnel!.start(server!.port);
});
ipcMain.handle('tunnel:stop', (e) => {
  if (fromHome(e)) tunnel!.stop();
});
ipcMain.handle('tunnel:download', async (e) => {
  if (fromHome(e)) await tunnel!.download();
});
ipcMain.handle('clipboard:write', (_e, text: unknown) => {
  if (typeof text === 'string' && text.length < 2000) clipboard.writeText(text);
});
ipcMain.handle('server:home', () => win?.loadURL(homeUrl()));
ipcMain.handle('server:open', async (_e, address: unknown) => {
  const target = typeof address === 'string' ? parseServerAddress(address, DEFAULT_PORT) : null;
  if (!target) return { ok: false, error: 'Endereço inválido.' };
  try {
    const res = await fetch(`${target.origin}/api/info`, { signal: AbortSignal.timeout(5000) });
    const info = (await res.json()) as { protocol?: number };
    if (info.protocol !== PROTOCOL_VERSION) return { ok: false, error: 'Esse servidor usa outra versão do jogo.' };
  } catch {
    return { ok: false, error: 'Nenhum servidor do Favo respondeu nesse endereço.' };
  }
  await win?.loadURL(target.origin + (target.room ? `/?sala=${encodeURIComponent(target.room)}` : ''));
  return { ok: true };
});

app.whenReady().then(async () => {
  await boot();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());

app.on('before-quit', () => {
  tunnel?.stop();
  beacon?.stop();
  lan?.stop();
  server?.close();
});
