/** Types shared by the Electron main process, the preload and the web client. */

export type TunnelState =
  | { status: 'off' | 'starting'; error?: undefined }
  | { status: 'missing'; error?: string }
  | { status: 'downloading'; progress: number }
  | { status: 'on'; url: string }
  | { status: 'error'; error: string };

export interface HostInfo {
  port: number;
  /** http://<lan-ip>:<port> for each network interface. */
  lanUrls: string[];
  tunnel: TunnelState;
}

export interface LanServerInfo {
  id: string;
  name: string;
  url: string;
  rooms: number;
  players: number;
}

export interface HiveDesktopBridge {
  /** True when the window shows this computer's own server. */
  isHome: boolean;
  getInfo: () => Promise<HostInfo>;
  onInfo: (cb: (info: HostInfo) => void) => () => void;
  startTunnel: () => Promise<void>;
  stopTunnel: () => Promise<void>;
  downloadTunnel: () => Promise<void>;
  listLan: () => Promise<LanServerInfo[]>;
  onLan: (cb: (servers: LanServerInfo[]) => void) => () => void;
  /** Connects the window to another host ("192.168.0.5:4242" or a full link). */
  openServer: (address: string) => Promise<{ ok: boolean; error?: string }>;
  goHome: () => Promise<void>;
  copy: (text: string) => Promise<void>;
}
