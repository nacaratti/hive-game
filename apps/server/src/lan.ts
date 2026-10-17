import { createSocket, type Socket } from 'node:dgram';
import { networkInterfaces } from 'node:os';
import { randomUUID } from 'node:crypto';

/**
 * LAN discovery: each host broadcasts a small UDP beacon so other copies of the
 * game on the same network can list it without typing an IP address — like the
 * "multiplayer → LAN" screen of classic PC games.
 */

export const LAN_PORT = 41234;
const BEACON_MS = 2000;
const EXPIRE_MS = 7000;

export interface Beacon {
  app: 'hive-pro';
  v: 1;
  id: string;
  name: string;
  port: number;
  rooms: number;
  players: number;
}

export interface LanServer {
  id: string;
  name: string;
  url: string;
  rooms: number;
  players: number;
  seenAt: number;
}

/** Host-only adapters other computers cannot reach (WSL, Hyper-V, VMs, Docker). */
const VIRTUAL_ADAPTER = /vEthernet|WSL|Hyper-V|VirtualBox|VMware|Docker|vboxnet|br-|veth/i;
/** Virtual LANs players use on purpose (the old "Hamachi" trick). Listed after real adapters. */
const VPN_ADAPTER = /Radmin|Tailscale|ZeroTier|Hamachi|WireGuard/i;

/** IPv4 addresses friends can use to reach this computer, best first. */
export const lanAddresses = (): string[] =>
  Object.entries(networkInterfaces())
    .flatMap(([name, list]) => (list ?? []).map((i) => ({ name, ...i })))
    // 169.254.x.x is a self-assigned address (no DHCP, e.g. Bluetooth PAN): unreachable for others.
    .filter((i) => i.family === 'IPv4' && !i.internal && !VIRTUAL_ADAPTER.test(i.name) && !i.address.startsWith('169.254.'))
    .sort((a, b) => Number(VPN_ADAPTER.test(a.name)) - Number(VPN_ADAPTER.test(b.name)))
    .map((i) => i.address);

/** Directed broadcast addresses of every IPv4 interface (plus the limited broadcast). */
const broadcastAddresses = (): string[] => {
  const out = new Set<string>(['255.255.255.255']);
  for (const i of Object.values(networkInterfaces()).flat()) {
    if (!i || i.family !== 'IPv4' || i.internal) continue;
    const ip = i.address.split('.').map(Number);
    const mask = i.netmask.split('.').map(Number);
    out.add(ip.map((b, k) => (b & mask[k]) | (~mask[k] & 255)).join('.'));
  }
  return [...out];
};

export interface Announcer {
  readonly id: string;
  stop: () => void;
}

/** Broadcasts this server's beacon until stopped. */
export function announce(info: () => Omit<Beacon, 'app' | 'v' | 'id'>): Announcer {
  const id = randomUUID();
  const sock = createSocket({ type: 'udp4', reuseAddr: true });
  let timer: NodeJS.Timeout | null = null;
  sock.on('error', () => {
    /* network may be unavailable; discovery is best effort */
  });
  sock.bind(() => {
    sock.setBroadcast(true);
    const send = () => {
      const msg = Buffer.from(JSON.stringify({ app: 'hive-pro', v: 1, id, ...info() } satisfies Beacon));
      for (const addr of broadcastAddresses()) sock.send(msg, LAN_PORT, addr, () => undefined);
    };
    send();
    timer = setInterval(send, BEACON_MS);
  });
  return {
    id,
    stop: () => {
      if (timer) clearInterval(timer);
      try {
        sock.close();
      } catch {
        /* already closed */
      }
    },
  };
}

export interface Discovery {
  list: () => LanServer[];
  stop: () => void;
}

/** Listens for beacons from other hosts on the network. */
export function discover(opts: { ignoreId?: () => string | undefined; onChange?: (servers: LanServer[]) => void } = {}): Discovery {
  const servers = new Map<string, LanServer>();
  const sock: Socket = createSocket({ type: 'udp4', reuseAddr: true });
  const list = () => [...servers.values()].sort((a, b) => a.name.localeCompare(b.name));
  sock.on('error', () => undefined);
  sock.on('message', (buf, rinfo) => {
    try {
      const b = JSON.parse(buf.toString('utf8')) as Beacon;
      if (b.app !== 'hive-pro' || b.v !== 1 || b.id === opts.ignoreId?.()) return;
      const isNew = !servers.has(b.id);
      servers.set(b.id, {
        id: b.id,
        name: String(b.name).slice(0, 40),
        url: `http://${rinfo.address}:${Number(b.port)}`,
        rooms: Number(b.rooms) || 0,
        players: Number(b.players) || 0,
        seenAt: Date.now(),
      });
      if (isNew) opts.onChange?.(list());
    } catch {
      /* not ours */
    }
  });
  sock.bind(LAN_PORT);
  const sweep = setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const [id, s] of servers) if (now - s.seenAt > EXPIRE_MS) (servers.delete(id), (changed = true));
    if (changed) opts.onChange?.(list());
  }, 1000);
  return {
    list,
    stop: () => {
      clearInterval(sweep);
      try {
        sock.close();
      } catch {
        /* already closed */
      }
    },
  };
}
