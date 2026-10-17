import { Hive, IllegalMoveError } from '@hive/engine';
import type { ChatMessage, ClockState, EndReason, GameView, RoomSettings, RoomState, RoomStatus, RoomSummary, Seat } from '@hive/protocol';
import type { Player } from './players';

export type Color = 'white' | 'black';

export class RoomError extends Error {}

export interface FinishedGame {
  roomId: string;
  white: string;
  black: string;
  gameString: string;
  result: GameView['result'];
  endReason: EndReason;
  settings: Omit<RoomSettings, 'password'>;
  startedAt: number;
  endedAt: number;
}

interface Clock {
  white: number;
  black: number;
  running: Color | null;
  since: number;
}

const CHAT_HISTORY = 60;

/**
 * One hosted table: seats, spectators, chat and the authoritative game.
 * Every mutation calls `onChange` so the hub can broadcast the new state.
 */
export class Room {
  readonly members = new Set<string>();
  seats: Record<Color, string | null> = { white: null, black: null };
  status: RoomStatus = 'waiting';
  game: Hive | null = null;
  endReason: EndReason | null = null;
  drawOfferBy: Color | null = null;
  rematchBy = new Set<Color>();
  private clock: Clock | null = null;
  private flagTimer: NodeJS.Timeout | null = null;
  private startedAt = 0;
  private chat: ChatMessage[] = [];
  private chatSeq = 0;
  /** Final result, including games that ended off the board (resign, timeout...). */
  private resultOverride: GameView['result'] = 'InProgress';

  constructor(
    readonly id: string,
    public hostId: string,
    public settings: RoomSettings,
    private readonly players: ReadonlyMap<string, Player>,
    private readonly onChange: (room: Room) => void,
    private readonly onFinish: (game: FinishedGame) => void,
  ) {}

  // ------------------------------------------------------------ membership

  seatOf(playerId: string): Color | null {
    if (this.seats.white === playerId) return 'white';
    if (this.seats.black === playerId) return 'black';
    return null;
  }

  checkPassword(password: string | undefined): boolean {
    return !this.settings.password || this.settings.password === password;
  }

  join(playerId: string): void {
    this.members.add(playerId);
    let seated = false;
    if (this.status !== 'playing') {
      if (!this.seats.white) this.seats.white = playerId;
      else if (!this.seats.black) this.seats.black = playerId;
      seated = !!this.seatOf(playerId);
    }
    this.system(`${this.nameOf(playerId)} entrou na sala.`);
    if (seated) this.seatsChanged();
    this.onChange(this);
  }

  leave(playerId: string): void {
    const seat = this.seatOf(playerId);
    // Leaving mid-game ends it as abandonment; the remaining player keeps seeing that result.
    const wasFinished = this.status === 'finished';
    if (seat && this.status === 'playing') this.finish(seat === 'white' ? 'BlackWins' : 'WhiteWins', 'abandon');
    if (seat) this.seats[seat] = null;
    this.members.delete(playerId);
    this.rematchBy.clear();
    if (this.hostId === playerId) {
      const next = this.seats.white ?? this.seats.black ?? [...this.members][0];
      if (next) this.hostId = next;
    }
    this.system(`${this.nameOf(playerId)} saiu da sala.`);
    if (seat && wasFinished) this.seatsChanged();
    this.onChange(this);
  }

  /**
   * After a game ends, a different lineup means a new game: go back to the
   * waiting table so the host can start it (instead of showing the old result).
   */
  private seatsChanged(): void {
    if (this.status !== 'finished') return;
    if (this.flagTimer) clearTimeout(this.flagTimer);
    this.flagTimer = null;
    this.status = 'waiting';
    this.game = null;
    this.clock = null;
    this.endReason = null;
    this.drawOfferBy = null;
    this.rematchBy.clear();
    this.resultOverride = 'InProgress';
  }

  get isEmpty(): boolean {
    return this.members.size === 0;
  }

  setSeat(playerId: string, seat: Seat): void {
    if (this.status === 'playing') throw new RoomError('Não é possível trocar de lugar durante a partida.');
    const current = this.seatOf(playerId);
    if (seat === 'spectator') {
      if (current) this.seats[current] = null;
    } else {
      if (this.seats[seat] && this.seats[seat] !== playerId) throw new RoomError('Lugar ocupado.');
      if (current) this.seats[current] = null;
      this.seats[seat] = playerId;
    }
    this.rematchBy.clear();
    this.seatsChanged();
    this.onChange(this);
  }

  addBot(playerId: string, botId: string, seat: Color): void {
    this.requireHost(playerId);
    if (this.status === 'playing') throw new RoomError('Não é possível adicionar o computador durante a partida.');
    if (this.seats[seat]) throw new RoomError('Lugar ocupado.');
    this.members.add(botId);
    this.seats[seat] = botId;
    this.rematchBy.clear();
    this.system(`${this.nameOf(botId)} sentou com as ${seat === 'white' ? 'brancas' : 'pretas'}.`);
    this.seatsChanged();
    this.onChange(this);
  }

  updateSettings(playerId: string, settings: RoomSettings): void {
    this.requireHost(playerId);
    if (this.status === 'playing') throw new RoomError('Não é possível alterar a sala durante a partida.');
    // An omitted password keeps the current one; an empty string removes it.
    this.settings = { ...settings, password: settings.password === undefined ? this.settings.password : settings.password || undefined };
    this.onChange(this);
  }

  kick(playerId: string, target: string): void {
    this.requireHost(playerId);
    if (target === playerId) throw new RoomError('Você não pode remover a si mesmo.');
    if (!this.members.has(target)) throw new RoomError('Jogador não está na sala.');
    this.leave(target);
  }

  // ----------------------------------------------------------------- game

  start(playerId: string): void {
    this.requireHost(playerId);
    if (this.status === 'playing') throw new RoomError('A partida já começou.');
    this.startGame(this.settings.randomColors && Math.random() < 0.5);
  }

  private startGame(swapColors: boolean): void {
    if (!this.seats.white || !this.seats.black) throw new RoomError('Faltam jogadores.');
    if (swapColors) this.seats = { white: this.seats.black, black: this.seats.white };
    this.game = new Hive(this.settings.expansions);
    this.status = 'playing';
    this.endReason = null;
    this.drawOfferBy = null;
    this.rematchBy.clear();
    this.startedAt = Date.now();
    const tc = this.settings.timeControl;
    this.clock = tc ? { white: tc.minutes * 60_000, black: tc.minutes * 60_000, running: 'white', since: Date.now() } : null;
    this.armFlag();
    this.system(`Partida iniciada: ${this.nameOf(this.seats.white)} (brancas) × ${this.nameOf(this.seats.black)} (pretas).`);
    this.onChange(this);
  }

  move(playerId: string, move: string, ply: number): void {
    const game = this.requireTurn(playerId);
    if (ply !== game.ply) throw new RoomError('Lance desatualizado. Atualizando tabuleiro.');
    const color: Color = game.turnColor === 0 ? 'white' : 'black';
    if (this.tickClock(color)) throw new RoomError('Seu tempo acabou.');
    try {
      game.play(move);
    } catch (e) {
      if (e instanceof IllegalMoveError) throw new RoomError('Lance ilegal.');
      throw e;
    }
    if (this.clock) {
      this.clock[color] += (this.settings.timeControl?.increment ?? 0) * 1000;
      this.clock.running = color === 'white' ? 'black' : 'white';
      this.clock.since = Date.now();
    }
    if (this.drawOfferBy && this.drawOfferBy !== color) this.drawOfferBy = null;
    if (game.isOver) this.finish(game.result, game.result === 'Draw' ? 'draw' : 'queen');
    else this.armFlag();
    this.onChange(this);
  }

  resign(playerId: string): void {
    const seat = this.requirePlaying(playerId);
    this.finish(seat === 'white' ? 'BlackWins' : 'WhiteWins', 'resign');
    this.system(`${this.nameOf(playerId)} desistiu.`);
    this.onChange(this);
  }

  draw(playerId: string, action: 'offer' | 'accept' | 'decline'): void {
    const seat = this.requirePlaying(playerId);
    if (action === 'offer') {
      if (this.drawOfferBy) throw new RoomError('Já existe uma proposta de empate.');
      this.drawOfferBy = seat;
      this.system(`${this.nameOf(playerId)} propôs empate.`);
    } else {
      if (!this.drawOfferBy || this.drawOfferBy === seat) throw new RoomError('Não há proposta para responder.');
      if (action === 'accept') {
        this.finish('Draw', 'agreement');
        this.system('Empate acordado.');
      } else {
        this.drawOfferBy = null;
        this.system(`${this.nameOf(playerId)} recusou o empate.`);
      }
    }
    this.onChange(this);
  }

  rematch(playerId: string): void {
    const seat = this.seatOf(playerId);
    if (!seat) throw new RoomError('Apenas jogadores podem pedir revanche.');
    if (this.status !== 'finished') throw new RoomError('A partida ainda não terminou.');
    this.rematchBy.add(seat);
    const other = seat === 'white' ? 'black' : 'white';
    if (this.rematchBy.has(other) || this.isBot(this.seats[other])) this.startGame(true);
    else this.onChange(this);
  }

  /** Called by the hub when a seated player has been gone for too long. */
  abandon(playerId: string): void {
    const seat = this.seatOf(playerId);
    if (!seat || this.status !== 'playing') return;
    this.finish(seat === 'white' ? 'BlackWins' : 'WhiteWins', 'abandon');
    this.system(`${this.nameOf(playerId)} abandonou a partida.`);
    this.onChange(this);
  }

  dispose(): void {
    if (this.flagTimer) clearTimeout(this.flagTimer);
  }

  // ----------------------------------------------------------------- chat

  say(playerId: string, text: string): ChatMessage {
    return this.pushChat({ id: ++this.chatSeq, from: this.nameOf(playerId), fromId: playerId, text, at: Date.now() });
  }

  system(text: string): ChatMessage {
    return this.pushChat({ id: ++this.chatSeq, from: 'Sistema', fromId: null, text, at: Date.now(), system: true });
  }

  private pushChat(msg: ChatMessage): ChatMessage {
    this.chat.push(msg);
    if (this.chat.length > CHAT_HISTORY) this.chat.shift();
    return msg;
  }

  // ---------------------------------------------------------------- views

  summary(): RoomSummary {
    return {
      id: this.id,
      name: this.settings.name,
      hostName: this.nameOf(this.hostId),
      hasPassword: !!this.settings.password,
      expansions: this.settings.expansions,
      timeControl: this.settings.timeControl,
      status: this.status,
      players: (this.seats.white ? 1 : 0) + (this.seats.black ? 1 : 0),
      spectators: [...this.members].filter((m) => !this.seatOf(m)).length,
    };
  }

  state(): RoomState {
    const { password: _password, ...settings } = this.settings;
    return {
      id: this.id,
      name: this.settings.name,
      hostId: this.hostId,
      hasPassword: !!this.settings.password,
      settings,
      seats: { white: this.ref(this.seats.white), black: this.ref(this.seats.black) },
      spectators: [...this.members].filter((m) => !this.seatOf(m)).map((m) => this.ref(m)!),
      status: this.status,
      game: this.game
        ? {
            gameString: this.game.toGameString(),
            result: this.status === 'finished' ? this.resultOverride : this.game.result,
            endReason: this.endReason,
            clock: this.clockView(),
            drawOfferBy: this.drawOfferBy,
            rematchBy: [...this.rematchBy],
          }
        : null,
      chat: this.chat,
    };
  }

  // ------------------------------------------------------------- internals

  private finish(result: GameView['result'], reason: EndReason): void {
    if (this.status !== 'playing' || !this.game) return;
    if (this.clock && this.clock.running) {
      this.clock[this.clock.running] -= Date.now() - this.clock.since;
      this.clock.running = null;
    }
    if (this.flagTimer) clearTimeout(this.flagTimer);
    this.flagTimer = null;
    this.status = 'finished';
    this.endReason = reason;
    this.resultOverride = result;
    this.drawOfferBy = null;
    this.onFinish({
      roomId: this.id,
      white: this.nameOf(this.seats.white),
      black: this.nameOf(this.seats.black),
      gameString: this.game.toGameString(),
      result,
      endReason: reason,
      settings: this.state().settings,
      startedAt: this.startedAt,
      endedAt: Date.now(),
    });
  }

  /** Charges elapsed time to `color`; returns true if the flag fell. */
  private tickClock(color: Color): boolean {
    if (!this.clock || this.clock.running !== color) return false;
    const now = Date.now();
    this.clock[color] -= now - this.clock.since;
    this.clock.since = now;
    if (this.clock[color] <= 0) {
      this.clock[color] = 0;
      this.finish(color === 'white' ? 'BlackWins' : 'WhiteWins', 'timeout');
      this.system(`Tempo esgotado para as ${color === 'white' ? 'brancas' : 'pretas'}.`);
      this.onChange(this);
      return true;
    }
    return false;
  }

  private armFlag(): void {
    if (this.flagTimer) clearTimeout(this.flagTimer);
    this.flagTimer = null;
    const c = this.clock;
    if (!c || !c.running) return;
    const remaining = c[c.running] - (Date.now() - c.since);
    const running = c.running;
    this.flagTimer = setTimeout(() => this.tickClock(running), Math.max(0, remaining) + 25);
  }

  private clockView(): ClockState | null {
    const c = this.clock;
    if (!c) return null;
    const now = Date.now();
    const elapsed = (color: Color) => (c.running === color ? now - c.since : 0);
    return { white: Math.max(0, c.white - elapsed('white')), black: Math.max(0, c.black - elapsed('black')), running: c.running, serverTime: now };
  }

  private requireHost(playerId: string): void {
    if (this.hostId !== playerId) throw new RoomError('Apenas o anfitrião pode fazer isso.');
  }

  private requirePlaying(playerId: string): Color {
    const seat = this.seatOf(playerId);
    if (!seat) throw new RoomError('Você não está jogando nesta sala.');
    if (this.status !== 'playing' || !this.game) throw new RoomError('Nenhuma partida em andamento.');
    return seat;
  }

  private requireTurn(playerId: string): Hive {
    const seat = this.requirePlaying(playerId);
    const game = this.game!;
    if ((game.turnColor === 0 ? 'white' : 'black') !== seat) throw new RoomError('Não é a sua vez.');
    return game;
  }

  private isBot(playerId: string | null): boolean {
    return !!playerId && !!this.players.get(playerId)?.isBot;
  }

  private nameOf(playerId: string | null): string {
    return (playerId && this.players.get(playerId)?.name) || '—';
  }

  private ref(playerId: string | null) {
    if (!playerId) return null;
    const p = this.players.get(playerId);
    return p ? { id: p.id, name: p.name, connected: p.connected, isBot: p.isBot || undefined } : { id: playerId, name: '—', connected: false };
  }
}
