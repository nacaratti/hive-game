import { contextBridge, ipcRenderer } from 'electron';
import type { HiveDesktopBridge, HostInfo, LanServerInfo } from '@hive/protocol';

const homeArg = process.argv.find((a) => a.startsWith('--hive-home='));
const home = homeArg ? homeArg.slice('--hive-home='.length) : '';

const subscribe = <T>(channel: string, cb: (value: T) => void) => {
  const listener = (_e: unknown, value: T) => cb(value);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
};

const bridge: HiveDesktopBridge = {
  isHome: location.origin === home,
  getInfo: () => ipcRenderer.invoke('host:info'),
  onInfo: (cb) => subscribe<HostInfo>('host:changed', cb),
  startTunnel: () => ipcRenderer.invoke('tunnel:start'),
  stopTunnel: () => ipcRenderer.invoke('tunnel:stop'),
  downloadTunnel: () => ipcRenderer.invoke('tunnel:download'),
  listLan: () => ipcRenderer.invoke('lan:list'),
  onLan: (cb) => subscribe<LanServerInfo[]>('lan:changed', cb),
  openServer: (address) => ipcRenderer.invoke('server:open', address),
  goHome: () => ipcRenderer.invoke('server:home'),
  copy: (text) => ipcRenderer.invoke('clipboard:write', text),
};

contextBridge.exposeInMainWorld('hiveDesktop', bridge);
