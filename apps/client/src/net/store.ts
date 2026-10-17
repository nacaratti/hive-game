import { io, type Socket } from 'socket.io-client';
import { create } from 'zustand';
import { isMobileApp } from '../lib/platform';
import {
  PROTOCOL_VERSION,
  type Ack,
  type ServerAddress,
  type ChatMessage,
  type ClientToServerEvents,
  type RoomState,
  type RoomSummary,
  type ServerInfo,
  type ServerToClientEvents,
} from '@hive/protocol';

type HiveSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export type ConnStatus = 'offline' | 'connecting' | 'online' | 'reconnecting';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

interface NetState {
  status: ConnStatus;
  name: string;
  playerId: string | null;
  server: ServerInfo | null;
  rooms: RoomSummary[];
  room: RoomState | null;
  /** Local time when `room` arrived (for clock interpolation). */
  roomAt: number;
  toasts: Toast[];
  /** Host chosen in the mobile app; null means "the server that served this page". */
  serverUrl: string | null;
  recentServers: RecentServer[];
  /** Room from an invitation link, joined once the lobby loads. */
  inviteRoom: string | null;
  connect: (name: string, target?: ServerAddress) => Promise<boolean>;
  clearInvite: () => void;
  disconnect: () => void;
  toast: (text: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
}

export interface RecentServer {
  origin: string;
  name: string;
  at: number;
}

const TOKEN_KEY = 'hive.token';
const SERVER_KEY = 'hive.server';
const RECENT_KEY = 'hive.recent';
const NAME_KEY = 'hive.name';
/** Set while the user is signed in, so a page refresh reconnects automatically. */
const ACTIVE_KEY = 'hive.active';

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string | null): void => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
};

export const hasActiveSession = () => read(ACTIVE_KEY) === '1' && !!read(NAME_KEY);

/** Sessions are per server: a token from one host means nothing to another. */
const tokenKey = (origin: string | null) => (origin ? `${TOKEN_KEY}@${origin}` : TOKEN_KEY);

const readRecent = (): RecentServer[] => {
  try {
    return JSON.parse(read(RECENT_KEY) ?? '[]') as RecentServer[];
  } catch {
    return [];
  }
};

/** Checks that a Favo server answers at `origin` and speaks our protocol. */
async function probe(origin: string): Promise<{ ok: true; info: ServerInfo } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${origin}/api/info`, { signal: AbortSignal.timeout(6000) });
    const info = (await res.json()) as ServerInfo;
    if (info.protocol !== PROTOCOL_VERSION) {
      return { ok: false, error: info.protocol > PROTOCOL_VERSION ? 'Esse servidor usa uma versão mais nova do jogo. Atualize o app.' : 'Esse servidor usa uma versão mais antiga do jogo. Peça para quem hospeda atualizar.' };
    }
    return { ok: true, info };
  } catch {
    return { ok: false, error: 'Nenhum servidor respondeu nesse endereço. Confira se o computador está ligado, com o jogo aberto, na mesma rede.' };
  }
}

let socket: HiveSocket | null = null;
let toastSeq = 0;

export const useNet = create<NetState>((set, get) => ({
  status: 'offline',
  name: read(NAME_KEY) ?? '',
  playerId: null,
  server: null,
  rooms: [],
  room: null,
  roomAt: 0,
  toasts: [],
  serverUrl: isMobileApp ? read(SERVER_KEY) : null,
  recentServers: readRecent(),
  inviteRoom: null,
  clearInvite: () => set({ inviteRoom: null }),

  connect: async (name, target) => {
    write(NAME_KEY, name);
    set({ name, status: 'connecting' });
    if (target) {
      const check = await probe(target.origin);
      if (!check.ok) {
        get().toast(check.error, 'error');
        set({ status: 'offline' });
        return false;
      }
      const recent = [{ origin: target.origin, name: check.info.name, at: Date.now() }, ...get().recentServers.filter((r) => r.origin !== target.origin)].slice(0, 6);
      write(SERVER_KEY, target.origin);
      write(RECENT_KEY, JSON.stringify(recent));
      set({ serverUrl: target.origin, recentServers: recent, inviteRoom: target.room });
    }
    const origin = get().serverUrl;
    return new Promise<boolean>((resolve) => {
      socket?.disconnect();
      const opts = { transports: ['websocket', 'polling'], reconnectionDelayMax: 4000 };
      const s: HiveSocket = origin ? io(origin, opts) : io(opts);
      socket = s;
      let first = true;

      s.on('connect', () => {
        s.emit('session:hello', { protocol: PROTOCOL_VERSION, name: get().name, token: read(tokenKey(origin)) ?? undefined }, (res) => {
          if (!res.ok) {
            get().toast(res.error, 'error');
            set({ status: 'offline' });
            s.disconnect();
            if (first) resolve(false);
            first = false;
            return;
          }
          write(tokenKey(origin), res.token);
          write(ACTIVE_KEY, '1');
          set({ status: 'online', playerId: res.playerId, server: res.server, ...(res.roomId ? {} : { room: null }) });
          s.emit('room:list', (rooms) => set({ rooms }));
          if (first) resolve(true);
          first = false;
        });
      });
      s.on('disconnect', (reason) => {
        if (reason === 'io client disconnect') return;
        set({ status: 'reconnecting' });
      });
      s.on('connect_error', () => {
        if (first) {
          set({ status: 'reconnecting' });
        }
      });
      s.on('lobby:rooms', (rooms) => set({ rooms }));
      s.on('room:state', (room) => set({ room, roomAt: Date.now() }));
      s.on('room:closed', (reason) => {
        set({ room: null });
        get().toast(reason);
      });
      s.on('chat:message', (msg: ChatMessage) => {
        const room = get().room;
        if (room && !room.chat.some((m) => m.id === msg.id)) set({ room: { ...room, chat: [...room.chat, msg].slice(-60) } });
      });
    });
  },

  disconnect: () => {
    write(ACTIVE_KEY, null);
    socket?.disconnect();
    socket = null;
    set({ status: 'offline', room: null, rooms: [], playerId: null });
  },

  toast: (text, tone = 'info') => {
    const id = ++toastSeq;
    set({ toasts: [...get().toasts, { id, text, tone }] });
    setTimeout(() => get().dismissToast(id), tone === 'error' ? 5000 : 3500);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

/** Reconnects right away after the app returns from the background. */
export function resumeConnection(): void {
  if (socket && !socket.connected) socket.connect();
}

type EventsWithAck = {
  [K in keyof ClientToServerEvents]: Parameters<ClientToServerEvents[K]> extends [...infer A, (res: infer R) => void]
    ? { args: A; res: R }
    : never;
};

/** Emits an event and resolves with the server's ack. Errors become toasts. */
export async function send<K extends keyof EventsWithAck>(event: K, ...args: EventsWithAck[K]['args']): Promise<EventsWithAck[K]['res']> {
  const s = socket;
  if (!s || !s.connected) {
    useNet.getState().toast('Sem conexão com o servidor.', 'error');
    return { ok: false, error: 'offline' } as EventsWithAck[K]['res'];
  }
  const res = await new Promise<EventsWithAck[K]['res']>((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (s.emit as any)(event, ...args, resolve);
  });
  const ack = res as Ack | RoomSummary[];
  if (!Array.isArray(ack) && ack && ack.ok === false) useNet.getState().toast(ack.error, 'error');
  return res;
}
