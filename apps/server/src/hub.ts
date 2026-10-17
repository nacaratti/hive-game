import { randomBytes, randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import {
  AddBotRequest,
  ChatRequest,
  HelloRequest,
  JoinRequest,
  MoveRequest,
  PROTOCOL_VERSION,
  RoomSettings,
  Seat,
  type Ack,
  type ClientToServerEvents,
  type ServerInfo,
  type ServerToClientEvents,
} from '@hive/protocol';
import type { ZodType } from 'zod';
import { BotRunner } from './bots';
import type { Player } from './players';
import { Room, RoomError, type FinishedGame } from './room';

type HiveSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, { playerId?: string }>;
export type HiveIO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, { playerId?: string }>;

export interface HubOptions {
  serverName: string;
  version: string;
  /** How long a seated player may be disconnected before forfeiting. */
  abandonMs?: number;
  /** How long an idle disconnected player is kept before being removed. */
  forgetMs?: number;
  onGameFinished?: (game: FinishedGame) => void;
  /** Compiled bot worker script; without it bots think on the main thread. */
  botWorker?: string;
  /** Minimum time a bot "thinks" so its moves feel natural. */
  botMinDelayMs?: number;
}

const BOT_NAMES: Record<NonNullable<Player['botLevel']>, string> = {
  facil: 'Computador (fácil)',
  medio: 'Computador (médio)',
  dificil: 'Computador (difícil)',
};

const MAX_EVENTS_PER_SECOND = 25;
const MAX_ROOMS = 200;
const roomChannel = (id: string) => `room:${id}`;

/** All multiplayer state for one hosted server. */
export class Hub {
  readonly players = new Map<string, Player>();
  readonly rooms = new Map<string, Room>();
  private readonly byToken = new Map<string, Player>();
  private lobbyTimer: NodeJS.Timeout | null = null;
  private readonly bots: BotRunner;
  private readonly thinking = new Set<string>();

  constructor(
    private readonly io: HiveIO,
    private readonly opts: HubOptions,
  ) {
    this.bots = new BotRunner(opts.botWorker);
    io.on('connection', (socket) => this.attach(socket));
  }

  info(): ServerInfo {
    return {
      name: this.opts.serverName,
      version: this.opts.version,
      protocol: PROTOCOL_VERSION,
      rooms: this.rooms.size,
      players: [...this.players.values()].filter((p) => p.connected && !p.isBot).length,
    };
  }

  close(): void {
    for (const room of this.rooms.values()) room.dispose();
    for (const p of this.players.values()) if (p.goneTimer) clearTimeout(p.goneTimer);
    if (this.lobbyTimer) clearTimeout(this.lobbyTimer);
    this.bots.close();
  }

  /** Registers a server-side player (used for bots). */
  addVirtualPlayer(name: string, botLevel: NonNullable<Player['botLevel']>): Player {
    const player: Player = { id: randomUUID(), token: '', name, socketId: null, roomId: null, connected: true, isBot: true, botLevel };
    this.players.set(player.id, player);
    return player;
  }

  /** Lets seated bots react: play on their turn and decline draw offers. */
  private driveBots(room: Room): void {
    const game = room.game;
    if (room.status !== 'playing' || !game || game.isOver) return;
    if (room.drawOfferBy) {
      const offeredTo = this.players.get(room.seats[room.drawOfferBy === 'white' ? 'black' : 'white'] ?? '');
      if (offeredTo?.isBot) setTimeout(() => this.safely(() => room.draw(offeredTo.id, 'decline')), 400);
    }
    const bot = this.players.get(room.seats[game.turnColor === 0 ? 'white' : 'black'] ?? '');
    if (!bot?.isBot || !bot.botLevel || this.thinking.has(room.id)) return;
    this.thinking.add(room.id);
    const ply = game.ply;
    const started = Date.now();
    this.bots
      .think(game.toGameString(), bot.botLevel)
      .then(async (move) => {
        const wait = (this.opts.botMinDelayMs ?? 600) - (Date.now() - started);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        this.thinking.delete(room.id);
        if (this.rooms.get(room.id) !== room || room.status !== 'playing' || room.game !== game || game.ply !== ply) return this.driveBots(room);
        this.safely(() => room.move(bot.id, move, ply));
      })
      .catch((e) => {
        this.thinking.delete(room.id);
        console.error('Bot falhou', e);
      });
  }

  private safely(fn: () => void): void {
    try {
      fn();
    } catch (e) {
      if (!(e instanceof RoomError)) console.error(e);
    }
  }

  // ------------------------------------------------------------ connection

  private attach(socket: HiveSocket): void {
    let windowStart = Date.now();
    let count = 0;
    socket.use((_packet, next) => {
      const now = Date.now();
      if (now - windowStart > 1000) {
        windowStart = now;
        count = 0;
      }
      if (++count > MAX_EVENTS_PER_SECOND) return next(new Error('rate limit'));
      next();
    });

    socket.on('session:hello', (raw, ack) => this.handle(ack, HelloRequest, raw, (req) => this.hello(socket, req)));

    socket.on('room:list', (ack) => {
      if (typeof ack === 'function') ack([...this.rooms.values()].map((r) => r.summary()));
    });

    socket.on('room:create', (raw, ack) =>
      this.handle(ack, RoomSettings, raw, (settings) => {
        const player = this.requirePlayer(socket);
        if (this.rooms.size >= MAX_ROOMS) throw new RoomError('Limite de salas atingido.');
        this.leaveRoom(player);
        const id = randomBytes(4).toString('hex');
        const room = new Room(
          id,
          player.id,
          settings,
          this.players,
          (r) => this.broadcastRoom(r),
          (g) => this.opts.onGameFinished?.(g),
        );
        this.rooms.set(id, room);
        this.enterRoom(player, room);
        return { roomId: id };
      }),
    );

    socket.on('room:join', (raw, ack) =>
      this.handle(ack, JoinRequest, raw, (req) => {
        const player = this.requirePlayer(socket);
        const room = this.rooms.get(req.roomId);
        if (!room) throw new RoomError('Sala não encontrada.');
        if (player.roomId === room.id) return {};
        if (!room.checkPassword(req.password)) throw new RoomError('Senha incorreta.');
        this.leaveRoom(player);
        this.enterRoom(player, room);
        return {};
      }),
    );

    socket.on('room:leave', (ack) =>
      this.handle(ack, null, undefined, () => {
        this.leaveRoom(this.requirePlayer(socket));
        return {};
      }),
    );

    socket.on('room:seat', (raw, ack) =>
      this.handle(ack, Seat, raw, (seat) => {
        const { player, room } = this.requireRoom(socket);
        room.setSeat(player.id, seat);
        return {};
      }),
    );

    socket.on('room:settings', (raw, ack) =>
      this.handle(ack, RoomSettings, raw, (settings) => {
        const { player, room } = this.requireRoom(socket);
        room.updateSettings(player.id, settings);
        this.scheduleLobby();
        return {};
      }),
    );

    socket.on('room:start', (ack) =>
      this.handle(ack, null, undefined, () => {
        const { player, room } = this.requireRoom(socket);
        room.start(player.id);
        return {};
      }),
    );

    socket.on('room:kick', (raw, ack) =>
      this.handle(ack, null, raw, (target) => {
        const { player, room } = this.requireRoom(socket);
        if (typeof target !== 'string') throw new RoomError('Pedido inválido.');
        const victim = this.players.get(target);
        room.kick(player.id, target);
        if (victim?.isBot) this.players.delete(victim.id);
        else if (victim) {
          victim.roomId = null;
          if (victim.socketId) this.io.sockets.sockets.get(victim.socketId)?.leave(roomChannel(room.id));
          if (victim.socketId) this.io.to(victim.socketId).emit('room:closed', 'Você foi removido da sala.');
        }
        return {};
      }),
    );

    socket.on('room:bot', (raw, ack) =>
      this.handle(ack, AddBotRequest, raw, (req) => {
        const { player, room } = this.requireRoom(socket);
        if (room.hostId !== player.id) throw new RoomError('Apenas o anfitrião pode fazer isso.');
        const bot = this.addVirtualPlayer(BOT_NAMES[req.level], req.level);
        bot.roomId = room.id;
        try {
          room.addBot(player.id, bot.id, req.seat);
        } catch (e) {
          this.players.delete(bot.id);
          throw e;
        }
        this.scheduleLobby();
        return {};
      }),
    );

    socket.on('game:move', (raw, ack) =>
      this.handle(ack, MoveRequest, raw, (req) => {
        const { player, room } = this.requireRoom(socket);
        room.move(player.id, req.move, req.ply);
        return {};
      }),
    );

    socket.on('game:resign', (ack) =>
      this.handle(ack, null, undefined, () => {
        const { player, room } = this.requireRoom(socket);
        room.resign(player.id);
        return {};
      }),
    );

    socket.on('game:draw', (raw, ack) =>
      this.handle(ack, null, raw, (action) => {
        if (action !== 'offer' && action !== 'accept' && action !== 'decline') throw new RoomError('Pedido inválido.');
        const { player, room } = this.requireRoom(socket);
        room.draw(player.id, action);
        return {};
      }),
    );

    socket.on('game:rematch', (ack) =>
      this.handle(ack, null, undefined, () => {
        const { player, room } = this.requireRoom(socket);
        room.rematch(player.id);
        return {};
      }),
    );

    socket.on('chat:send', (raw, ack) =>
      this.handle(ack, ChatRequest, raw, (req) => {
        const { player, room } = this.requireRoom(socket);
        const msg = room.say(player.id, req.text);
        this.io.to(roomChannel(room.id)).emit('chat:message', msg);
        return {};
      }),
    );

    socket.on('disconnect', () => this.disconnected(socket));
  }

  private hello(socket: HiveSocket, req: HelloRequest) {
    if (req.protocol !== PROTOCOL_VERSION) throw new RoomError('Versão do jogo incompatível com este servidor. Atualize o aplicativo.');
    let player = req.token ? this.byToken.get(req.token) : undefined;
    if (player) {
      if (player.goneTimer) clearTimeout(player.goneTimer);
      player.goneTimer = undefined;
      if (player.socketId && player.socketId !== socket.id) {
        this.io.sockets.sockets.get(player.socketId)?.disconnect(true);
      }
      player.name = req.name;
    } else {
      player = { id: randomUUID(), token: randomBytes(24).toString('base64url'), name: req.name, socketId: null, roomId: null, connected: true };
      this.players.set(player.id, player);
      this.byToken.set(player.token, player);
    }
    player.socketId = socket.id;
    player.connected = true;
    socket.data.playerId = player.id;
    socket.join('lobby');
    const room = player.roomId ? this.rooms.get(player.roomId) : undefined;
    if (room) {
      socket.join(roomChannel(room.id));
      this.broadcastRoom(room);
    } else {
      player.roomId = null;
    }
    return { token: player.token, playerId: player.id, name: player.name, roomId: player.roomId, server: this.info() };
  }

  private disconnected(socket: HiveSocket): void {
    const player = socket.data.playerId ? this.players.get(socket.data.playerId) : undefined;
    if (!player || player.socketId !== socket.id) return;
    player.connected = false;
    player.socketId = null;
    const room = player.roomId ? this.rooms.get(player.roomId) : undefined;
    if (room) {
      this.broadcastRoom(room);
      const seated = room.seatOf(player.id) && room.status === 'playing';
      player.goneTimer = setTimeout(
        () => {
          if (player.connected) return;
          if (seated && room.status === 'playing') room.abandon(player.id);
          this.forget(player);
        },
        seated ? (this.opts.abandonMs ?? 90_000) : (this.opts.forgetMs ?? 5 * 60_000),
      );
    } else {
      player.goneTimer = setTimeout(() => this.forget(player), this.opts.forgetMs ?? 5 * 60_000);
    }
  }

  private forget(player: Player): void {
    if (player.connected) return;
    this.leaveRoom(player);
    this.players.delete(player.id);
    this.byToken.delete(player.token);
  }

  // ----------------------------------------------------------------- rooms

  private enterRoom(player: Player, room: Room): void {
    player.roomId = room.id;
    if (player.socketId) this.io.sockets.sockets.get(player.socketId)?.join(roomChannel(room.id));
    room.join(player.id);
    this.scheduleLobby();
  }

  /** Seats a server-side player (bot) in a room. */
  seatVirtual(player: Player, room: Room): void {
    player.roomId = room.id;
    room.join(player.id);
    this.scheduleLobby();
  }

  private leaveRoom(player: Player): void {
    const room = player.roomId ? this.rooms.get(player.roomId) : undefined;
    player.roomId = null;
    if (!room) return;
    if (player.socketId) this.io.sockets.sockets.get(player.socketId)?.leave(roomChannel(room.id));
    room.leave(player.id);
    const humans = [...room.members].filter((id) => !this.players.get(id)?.isBot);
    if (humans.length === 0) {
      for (const id of room.members) {
        const bot = this.players.get(id);
        if (bot?.isBot) this.players.delete(id);
      }
      room.dispose();
      this.rooms.delete(room.id);
    }
    this.scheduleLobby();
  }

  private broadcastRoom(room: Room): void {
    if (!this.rooms.has(room.id)) return;
    this.io.to(roomChannel(room.id)).emit('room:state', room.state());
    this.scheduleLobby();
    this.driveBots(room);
  }

  /** Coalesces lobby updates (many room changes per tick → one broadcast). */
  private scheduleLobby(): void {
    if (this.lobbyTimer) return;
    this.lobbyTimer = setTimeout(() => {
      this.lobbyTimer = null;
      this.io.to('lobby').emit('lobby:rooms', [...this.rooms.values()].map((r) => r.summary()));
    }, 50);
  }

  // --------------------------------------------------------------- helpers

  private requirePlayer(socket: HiveSocket): Player {
    const player = socket.data.playerId ? this.players.get(socket.data.playerId) : undefined;
    if (!player) throw new RoomError('Sessão não iniciada.');
    return player;
  }

  private requireRoom(socket: HiveSocket): { player: Player; room: Room } {
    const player = this.requirePlayer(socket);
    const room = player.roomId ? this.rooms.get(player.roomId) : undefined;
    if (!room) throw new RoomError('Você não está em uma sala.');
    return { player, room };
  }

  /** Validates input, runs the action and always answers the ack. */
  private handle<I, O extends object>(
    ack: unknown,
    schema: ZodType<I> | null,
    raw: unknown,
    action: (input: I) => O,
  ): void {
    const reply = (res: Ack<O>) => {
      if (typeof ack === 'function') ack(res);
    };
    try {
      let input = raw as I;
      if (schema) {
        const parsed = schema.safeParse(raw);
        if (!parsed.success) return reply({ ok: false, error: parsed.error.issues[0]?.message ?? 'Pedido inválido.' });
        input = parsed.data;
      }
      reply({ ok: true, ...action(input) });
    } catch (e) {
      if (e instanceof RoomError) reply({ ok: false, error: e.message });
      else {
        console.error(e);
        reply({ ok: false, error: 'Erro interno do servidor.' });
      }
    }
  }
}
