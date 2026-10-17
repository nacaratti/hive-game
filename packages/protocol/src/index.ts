import { z } from 'zod';

export const PROTOCOL_VERSION = 1;

// ------------------------------------------------------------------ inputs

export const PlayerName = z
  .string()
  .trim()
  .min(1)
  .max(24)
  .regex(/^[^<>]+$/, 'Nome inválido');

export const Expansions = z.object({
  mosquito: z.boolean(),
  ladybug: z.boolean(),
  pillbug: z.boolean(),
});
export type Expansions = z.infer<typeof Expansions>;

export const TimeControl = z
  .object({
    /** Minutes per player. */
    minutes: z.number().int().min(1).max(180),
    /** Seconds added after each move. */
    increment: z.number().int().min(0).max(120),
  })
  .nullable();
export type TimeControl = z.infer<typeof TimeControl>;

export const RoomSettings = z.object({
  name: z.string().trim().min(1).max(40),
  password: z.string().max(40).optional(),
  expansions: Expansions,
  timeControl: TimeControl,
  /** Assign colors at random when the game starts. */
  randomColors: z.boolean(),
});
export type RoomSettings = z.infer<typeof RoomSettings>;

export const Seat = z.enum(['white', 'black', 'spectator']);
export type Seat = z.infer<typeof Seat>;

export const HelloRequest = z.object({
  protocol: z.number().int(),
  name: PlayerName,
  token: z.string().max(100).optional(),
});
export type HelloRequest = z.infer<typeof HelloRequest>;

export const JoinRequest = z.object({ roomId: z.string().max(40), password: z.string().max(40).optional() });
export type JoinRequest = z.infer<typeof JoinRequest>;

export const MoveRequest = z.object({
  /** UHP MoveString, e.g. "wS1 -bQ" or "pass". */
  move: z.string().min(1).max(40),
  /** Ply the client believes it is playing at (rejects stale moves). */
  ply: z.number().int().min(0),
});
export type MoveRequest = z.infer<typeof MoveRequest>;

export const BotLevel = z.enum(['facil', 'medio', 'dificil']);
export type BotLevel = z.infer<typeof BotLevel>;

export const AddBotRequest = z.object({ seat: z.enum(['white', 'black']), level: BotLevel });
export type AddBotRequest = z.infer<typeof AddBotRequest>;

export const ChatRequest = z.object({ text: z.string().trim().min(1).max(300) });

// ----------------------------------------------------------------- outputs

export interface PlayerRef {
  id: string;
  name: string;
  connected: boolean;
  isBot?: boolean;
}

export interface RoomSummary {
  id: string;
  name: string;
  hostName: string;
  hasPassword: boolean;
  expansions: Expansions;
  timeControl: TimeControl;
  status: RoomStatus;
  players: number;
  spectators: number;
}

export type RoomStatus = 'waiting' | 'playing' | 'finished';

export type EndReason = 'queen' | 'resign' | 'timeout' | 'agreement' | 'abandon' | 'draw';

export interface ClockState {
  /** Remaining milliseconds at the moment the state was sent (`serverTime`). */
  white: number;
  black: number;
  running: 'white' | 'black' | null;
  serverTime: number;
}

export interface GameView {
  /** UHP GameString: the client rebuilds the position with the engine. */
  gameString: string;
  result: 'InProgress' | 'WhiteWins' | 'BlackWins' | 'Draw';
  endReason: EndReason | null;
  clock: ClockState | null;
  drawOfferBy: 'white' | 'black' | null;
  rematchBy: ('white' | 'black')[];
}

export interface ChatMessage {
  id: number;
  from: string;
  fromId: string | null;
  text: string;
  at: number;
  system?: boolean;
}

export interface RoomState {
  id: string;
  name: string;
  hostId: string;
  hasPassword: boolean;
  settings: Omit<RoomSettings, 'password'>;
  seats: { white: PlayerRef | null; black: PlayerRef | null };
  spectators: PlayerRef[];
  status: RoomStatus;
  game: GameView | null;
  chat: ChatMessage[];
}

export interface ServerInfo {
  name: string;
  version: string;
  protocol: number;
  rooms: number;
  players: number;
}

export type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export interface HelloResponse {
  token: string;
  playerId: string;
  name: string;
  roomId: string | null;
  server: ServerInfo;
}

/** Typed Socket.IO event maps (shared by server and client). */
export interface ClientToServerEvents {
  'session:hello': (req: HelloRequest, ack: (res: Ack<HelloResponse>) => void) => void;
  'room:list': (ack: (rooms: RoomSummary[]) => void) => void;
  'room:create': (req: RoomSettings, ack: (res: Ack<{ roomId: string }>) => void) => void;
  'room:join': (req: JoinRequest, ack: (res: Ack) => void) => void;
  'room:leave': (ack: (res: Ack) => void) => void;
  'room:seat': (seat: Seat, ack: (res: Ack) => void) => void;
  'room:settings': (req: RoomSettings, ack: (res: Ack) => void) => void;
  'room:start': (ack: (res: Ack) => void) => void;
  'room:kick': (playerId: string, ack: (res: Ack) => void) => void;
  'room:bot': (req: AddBotRequest, ack: (res: Ack) => void) => void;
  'game:move': (req: MoveRequest, ack: (res: Ack) => void) => void;
  'game:resign': (ack: (res: Ack) => void) => void;
  'game:draw': (action: 'offer' | 'accept' | 'decline', ack: (res: Ack) => void) => void;
  'game:rematch': (ack: (res: Ack) => void) => void;
  'chat:send': (req: { text: string }, ack: (res: Ack) => void) => void;
}

export interface ServerToClientEvents {
  'lobby:rooms': (rooms: RoomSummary[]) => void;
  'room:state': (room: RoomState) => void;
  'room:closed': (reason: string) => void;
  'chat:message': (msg: ChatMessage) => void;
}
export * from './desktop';
export * from './address';
export * from './p2p';
