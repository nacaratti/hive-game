import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { Server } from 'socket.io';
import { Hub, type HiveIO } from './hub';
import { GameStore } from './store';

export { Hub } from './hub';
export * from './lan';
export { Room } from './room';
export type { FinishedGame } from './room';

export interface ServerOptions {
  /** Default 0.0.0.0 so other machines on the network can connect. */
  host?: string;
  port?: number;
  /** Built web client to serve (so friends can join with just a browser). */
  clientDir?: string;
  /** Where finished games are archived. */
  dataDir?: string;
  serverName?: string;
  version?: string;
  abandonMs?: number;
  /** Path of the bot worker script (defaults to the source file next to this one). */
  botWorker?: string;
  botMinDelayMs?: number;
}

const here = (() => {
  try {
    return import.meta.dirname;
  } catch {
    return undefined;
  }
})();

export interface RunningServer {
  port: number;
  hub: Hub;
  close: () => Promise<void>;
}

export const DEFAULT_PORT = 4242;

export async function startServer(opts: ServerOptions = {}): Promise<RunningServer> {
  const app = Fastify({ logger: false });
  const store = new GameStore(opts.dataDir ?? resolve(process.cwd(), 'data'));

  const io: HiveIO = new Server(app.server, {
    // The web client is served from this same origin; tunnels/LAN IPs are other origins.
    cors: { origin: true },
    maxHttpBufferSize: 64 * 1024,
    pingInterval: 10_000,
    pingTimeout: 8_000,
  });

  const hub = new Hub(io, {
    serverName: opts.serverName ?? 'Hive Pro',
    version: opts.version ?? '0.1.0',
    abandonMs: opts.abandonMs,
    botWorker: opts.botWorker ?? (here ? resolve(here, 'bot-worker.dev.mjs') : undefined),
    botMinDelayMs: opts.botMinDelayMs,
    onGameFinished: (g) => {
      store.save(g).catch((e) => console.error('Falha ao salvar partida', e));
    },
  });

  // Public: the mobile app (another origin) probes it before connecting.
  app.get('/api/info', async (_req, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    return hub.info();
  });
  app.get('/api/games', async () => store.recent(50));

  const clientDir = opts.clientDir && existsSync(opts.clientDir) ? opts.clientDir : null;
  if (clientDir) {
    await app.register(fastifyStatic, { root: clientDir, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/') && !req.url.startsWith('/socket.io/')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'Not found' });
    });
  } else {
    app.get('/', async () => ({ ...hub.info(), hint: 'Web client not built; run the client dev server.' }));
  }

  const port = opts.port ?? DEFAULT_PORT;
  await app.listen({ host: opts.host ?? '0.0.0.0', port });
  const address = app.server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;

  return {
    port: actualPort,
    hub,
    close: async () => {
      hub.close();
      io.close();
      await app.close();
    },
  };
}
