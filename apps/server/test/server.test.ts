import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { PROTOCOL_VERSION, type ClientToServerEvents, type RoomState, type ServerToClientEvents } from '@hive/protocol';
import { startServer, type RunningServer } from '../src';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let server: RunningServer;
let url: string;
const dataDir = mkdtempSync(join(tmpdir(), 'hive-test-'));

beforeAll(async () => {
  server = await startServer({ port: 0, host: '127.0.0.1', dataDir, abandonMs: 300, botMinDelayMs: 0 });
  url = `http://127.0.0.1:${server.port}`;
});
afterAll(async () => {
  await server.close();
});

const client = (): Client => connect(url, { transports: ['websocket'], forceNew: true });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = <T = any>(c: Client, event: string, ...args: unknown[]): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new Promise((res) => (c.emit as any)(event, ...args, res));

const nextState = (c: Client, pred: (s: RoomState) => boolean = () => true): Promise<RoomState> =>
  new Promise((res) => {
    const h = (s: RoomState) => {
      if (pred(s)) {
        c.off('room:state', h);
        res(s);
      }
    };
    c.on('room:state', h);
  });

const settings = {
  name: 'Mesa 1',
  expansions: { mosquito: true, ladybug: true, pillbug: true },
  timeControl: null,
  randomColors: false,
};

describe('server', () => {
  it('runs a full authoritative game between two clients', async () => {
    const a = client();
    const b = client();
    const ha = await call(a, 'session:hello', { protocol: PROTOCOL_VERSION, name: 'Ana' });
    const hb = await call(b, 'session:hello', { protocol: PROTOCOL_VERSION, name: 'Bruno' });
    expect(ha.ok && hb.ok).toBe(true);

    const created = await call(a, 'room:create', settings);
    expect(created.ok).toBe(true);
    const rooms = await call(b, 'room:list');
    expect(rooms).toHaveLength(1);

    const joined = nextState(a, (s) => s.seats.black?.name === 'Bruno');
    expect((await call(b, 'room:join', { roomId: created.roomId })).ok).toBe(true);
    await joined;

    expect((await call(b, 'room:start')).ok).toBe(false); // only host
    const started = nextState(b, (s) => s.status === 'playing');
    expect((await call(a, 'room:start')).ok).toBe(true);
    expect((await started).game?.gameString).toBe('Base+MLP;NotStarted;White[1]');

    // Black cannot move on white's turn; illegal and stale moves are rejected.
    expect(await call(b, 'game:move', { move: 'bS1', ply: 0 })).toMatchObject({ ok: false });
    expect(await call(a, 'game:move', { move: 'wQ', ply: 0 })).toMatchObject({ ok: false }); // tournament opening
    expect(await call(a, 'game:move', { move: 'wS1', ply: 3 })).toMatchObject({ ok: false });
    expect((await call(a, 'game:move', { move: 'wS1', ply: 0 })).ok).toBe(true);
    expect((await call(b, 'game:move', { move: 'bS1 wS1-', ply: 1 })).ok).toBe(true);

    // Reconnect: the new socket with the same token resumes the room.
    b.disconnect();
    const b2 = client();
    const resumed = nextState(b2);
    const hb2 = await call(b2, 'session:hello', { protocol: PROTOCOL_VERSION, name: 'Bruno', token: hb.token });
    expect(hb2.roomId).toBe(created.roomId);
    expect((await resumed).game?.gameString).toContain('bS1 wS1-');

    const finished = nextState(a, (s) => s.status === 'finished');
    expect((await call(b2, 'game:resign')).ok).toBe(true);
    const end = await finished;
    expect(end.game?.result).toBe('WhiteWins');
    expect(end.game?.endReason).toBe('resign');

    await new Promise((r) => setTimeout(r, 100));
    const archive = readFileSync(join(dataDir, 'games.jsonl'), 'utf8').trim().split('\n');
    expect(JSON.parse(archive[0]).gameString).toContain('wS1;bS1 wS1-');

    // Rematch swaps colors.
    await call(a, 'game:rematch');
    const re = nextState(a, (s) => s.status === 'playing');
    await call(b2, 'game:rematch');
    expect((await re).seats.white?.name).toBe('Bruno');

    a.disconnect();
    b2.disconnect();
  });

  it('protects rooms with a password and forfeits abandoned games', async () => {
    const a = client();
    const b = client();
    await call(a, 'session:hello', { protocol: PROTOCOL_VERSION, name: 'Ana' });
    await call(b, 'session:hello', { protocol: PROTOCOL_VERSION, name: 'Bruno' });
    const { roomId } = await call(a, 'room:create', { ...settings, password: 'abelha' });
    expect(await call(b, 'room:join', { roomId, password: 'x' })).toMatchObject({ ok: false });
    expect((await call(b, 'room:join', { roomId, password: 'abelha' })).ok).toBe(true);
    await call(a, 'room:start');
    const finished = nextState(a, (s) => s.status === 'finished');
    b.disconnect();
    const end = await finished;
    expect(end.game?.endReason).toBe('abandon');
    expect(end.game?.result).toBe('WhiteWins');
    a.disconnect();
  });

  it('plays against a computer opponent seated by the host', async () => {
    const a = client();
    await call(a, 'session:hello', { protocol: PROTOCOL_VERSION, name: 'Ana' });
    await call(a, 'room:create', { ...settings, randomColors: false });
    expect(await call(a, 'room:bot', { seat: 'black', level: 'facil' })).toMatchObject({ ok: true });
    expect(await call(a, 'room:bot', { seat: 'black', level: 'facil' })).toMatchObject({ ok: false }); // seat taken
    await call(a, 'room:start');
    const replied = nextState(a, (s) => (s.game?.gameString.split(';').length ?? 0) >= 5);
    expect((await call(a, 'game:move', { move: 'wS1', ply: 0 })).ok).toBe(true);
    const state = await replied;
    expect(state.seats.black?.isBot).toBe(true);
    expect(state.game?.gameString.split(';')[4]).toMatch(/^b/);
    a.disconnect();
  });

  it('a newcomer after a finished game gets a fresh waiting table, not the old result', async () => {
    const host = client();
    await call(host, 'session:hello', { protocol: PROTOCOL_VERSION, name: 'Host' });
    const { roomId } = await call(host, 'room:create', settings);
    await call(host, 'room:bot', { seat: 'black', level: 'facil' });
    await call(host, 'room:start');
    const finished = nextState(host, (s) => s.status === 'finished');
    await call(host, 'game:resign');
    const end = await finished;
    await call(host, 'room:kick', end.seats.black!.id);

    const guest = client();
    await call(guest, 'session:hello', { protocol: PROTOCOL_VERSION, name: 'Celular' });
    const rooms = await call(guest, 'room:list');
    expect(rooms.find((r: { id: string }) => r.id === roomId)).toMatchObject({ players: 1 });
    const seen = nextState(guest);
    expect((await call(guest, 'room:join', { roomId })).ok).toBe(true);
    const state = await seen;
    expect(state.status).toBe('waiting');
    expect(state.game).toBeNull();
    expect(state.seats.black?.name).toBe('Celular');
    expect((await call(host, 'room:start')).ok).toBe(true);
    host.disconnect();
    guest.disconnect();
  });

  it('rejects malformed payloads', async () => {
    const a = client();
    expect(await call(a, 'session:hello', { protocol: PROTOCOL_VERSION, name: '' })).toMatchObject({ ok: false });
    expect(await call(a, 'session:hello', { protocol: 999, name: 'X' })).toMatchObject({ ok: false });
    expect(await call(a, 'room:create', settings)).toMatchObject({ ok: false }); // no session
    a.disconnect();
  });
});
