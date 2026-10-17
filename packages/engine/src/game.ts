import { DIR_DELTA, ORIGIN, keyQ, keyR, toKey } from './hex';
import {
  BUG_IDS,
  BUG_TYPES,
  PIECES,
  PIECE_BY_NAME,
  PIECE_COUNT,
  queenId,
  type BugType,
  type Color,
} from './pieces';

export interface GameOptions {
  mosquito?: boolean;
  ladybug?: boolean;
  pillbug?: boolean;
  /** Queen may not be placed on a player's first turn (UHP / tournament standard). */
  tournamentOpening?: boolean;
}

export type ResolvedOptions = Readonly<Required<GameOptions>>;

export type Move =
  | { type: 'place'; piece: number; to: number }
  | { type: 'move'; piece: number; to: number }
  | { type: 'pass' };

export type GameResult = 'InProgress' | 'WhiteWins' | 'BlackWins' | 'Draw';

export interface LayoutPiece {
  /** UHP piece name, e.g. "wQ". Pieces sharing a cell are stacked in array order. */
  piece: string;
  q: number;
  r: number;
}

export interface LayoutOptions extends GameOptions {
  /** Number of plies already played (decides whose turn it is and turn rules). */
  ply: number;
  /** UHP name of the piece moved on the previous ply (pillbug rules). */
  lastMoved?: string;
}

export class IllegalMoveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalMoveError';
  }
}

interface HistoryEntry {
  move: Move;
  from: number;
  prevLastMoved: number;
  prevResult: GameResult;
  notation: string;
}

const REL_PREFIX: Readonly<Record<string, number>> = { '-': 3, '/': 2, '\\': 4 };
const REL_SUFFIX: Readonly<Record<string, number>> = { '-': 0, '/': 5, '\\': 1 };
const MOVE_RE = /^([wb][QSBGAMLP][1-3]?)(?:\s+([-/\\]?)([wb][QSBGAMLP][1-3]?)([-/\\]?))?$/;

/** Writes `piece` relative to a reference piece, where dest = ref + direction `dir`. */
const formatRelative = (ref: string, dir: number): string => {
  switch (dir) {
    case 0:
      return `${ref}-`;
    case 1:
      return `${ref}\\`;
    case 2:
      return `/${ref}`;
    case 3:
      return `-${ref}`;
    case 4:
      return `\\${ref}`;
    default:
      return `${ref}/`;
  }
};

const zobrist = (piece: number, key: number, level: number, seed: number): number => {
  let x = Math.imul(piece + 1, 0x9e3779b1) ^ Math.imul(key + 7, 0x85ebca77) ^ Math.imul(level + 3, 0xc2b2ae3d) ^ seed;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
};

/**
 * Complete Hive rules engine (base game + Mosquito, Ladybug, Pillbug).
 *
 * The board is mutable for speed (play/undo), but every public mutation goes
 * through rule validation unless the caller explicitly uses `makeMove`.
 */
export class Hive {
  readonly options: ResolvedOptions;
  /** Set to false to skip computing UHP strings for each move (bots, self-play). */
  recordNotation = true;

  private readonly cells = new Map<number, number[]>();
  private readonly pos = new Int32Array(PIECE_COUNT).fill(-1);
  private readonly enabled: readonly boolean[];
  private _ply = 0;
  private _lastMoved = -1;
  private _result: GameResult = 'InProgress';
  private history: HistoryEntry[] = [];
  private hashLo = 0;
  private hashHi = 0;
  private movesCache: Move[] | null = null;

  constructor(options: GameOptions = {}) {
    this.options = Object.freeze({
      mosquito: options.mosquito ?? false,
      ladybug: options.ladybug ?? false,
      pillbug: options.pillbug ?? false,
      tournamentOpening: options.tournamentOpening ?? true,
    });
    this.enabled = PIECES.map((p) =>
      p.bug === 'M' ? this.options.mosquito : p.bug === 'L' ? this.options.ladybug : p.bug === 'P' ? this.options.pillbug : true,
    );
  }

  // ---------------------------------------------------------------- queries

  get ply(): number {
    return this._ply;
  }

  get turnColor(): Color {
    return (this._ply & 1) as Color;
  }

  /** The current player's own turn number, starting at 1. */
  get turnNumber(): number {
    return (this._ply >> 1) + 1;
  }

  get result(): GameResult {
    return this._result;
  }

  get isOver(): boolean {
    return this._result !== 'InProgress';
  }

  get lastMovedPiece(): number {
    return this._lastMoved;
  }

  get canUndo(): boolean {
    return this.history.length > 0;
  }

  get moveHistory(): string[] {
    return this.history.map((h) => h.notation);
  }

  get lastMove(): { move: Move; from: number } | null {
    const h = this.history[this.history.length - 1];
    return h ? { move: h.move, from: h.from } : null;
  }

  /** UHP GameTypeString, e.g. "Base" or "Base+MLP". */
  get gameType(): string {
    const ext = (this.options.mosquito ? 'M' : '') + (this.options.ladybug ? 'L' : '') + (this.options.pillbug ? 'P' : '');
    return ext ? `Base+${ext}` : 'Base';
  }

  isEnabled(piece: number): boolean {
    return this.enabled[piece];
  }

  /** Cell key of a piece, or -1 when it is still in hand. */
  positionOf(piece: number): number {
    return this.pos[piece];
  }

  /** Stack at a cell, bottom to top. */
  stackAt(key: number): readonly number[] | undefined {
    return this.cells.get(key);
  }

  topAt(key: number): number {
    const s = this.cells.get(key);
    return s ? s[s.length - 1] : -1;
  }

  occupiedCells(): number[] {
    return [...this.cells.keys()];
  }

  /** Enabled pieces of a color that are not yet on the board. */
  hand(color: Color): number[] {
    const out: number[] = [];
    for (const p of PIECES) if (p.color === color && this.enabled[p.id] && this.pos[p.id] < 0) out.push(p.id);
    return out;
  }

  isQueenSurrounded(color: Color): boolean {
    const key = this.pos[queenId(color)];
    return key >= 0 && DIR_DELTA.every((d) => this.cells.has(key + d));
  }

  /** 64-bit-ish position hash split in two 32-bit halves (includes side to move). */
  hash(): [number, number] {
    const side = this._ply & 1 ? 0x5bd1e995 : 0;
    const lm = this._lastMoved >= 0 && this.options.pillbug ? zobrist(this._lastMoved, 0, 99, 0x1234) : 0;
    return [(this.hashLo ^ side ^ lm) >>> 0, (this.hashHi ^ (side >>> 3) ^ (lm >>> 5)) >>> 0];
  }

  positionKey(): string {
    const [lo, hi] = this.hash();
    return `${hi.toString(16)}${lo.toString(16).padStart(8, '0')}`;
  }

  /** Cells whose single piece is pinned by the One Hive rule (for evaluation). */
  pinnedCells(): Set<number> {
    return this.articulationPoints();
  }

  /** Number of board moves `color` would have if it were to move now (ignores placements). */
  movementCount(color: Color): number {
    if (this._result !== 'InProgress' || this.pos[queenId(color)] < 0) return 0;
    const out: Move[] = [];
    this.genMovements(color, out);
    return out.length;
  }

  /** Occupied neighbors of a cell. */
  neighborCount(key: number): number {
    let n = 0;
    for (const d of DIR_DELTA) if (this.cells.has(key + d)) n++;
    return n;
  }

  legalMoves(): readonly Move[] {
    if (!this.movesCache) this.movesCache = this.generate();
    return this.movesCache;
  }

  legalMovesForPiece(piece: number): Move[] {
    return this.legalMoves().filter((m) => m.type !== 'pass' && m.piece === piece);
  }

  findLegal(move: Move): Move | undefined {
    return this.legalMoves().find(
      (m) => m.type === move.type && (m.type === 'pass' || (move.type !== 'pass' && m.piece === move.piece && m.to === move.to)),
    );
  }

  isLegal(move: Move): boolean {
    return this.findLegal(move) !== undefined;
  }

  // -------------------------------------------------------------- mutation

  /** Plays a move after validating it. Accepts a Move or a UHP move string. */
  play(move: Move | string): Move {
    const legal = typeof move === 'string' ? this.parseMove(move) : this.findLegal(move);
    if (!legal) throw new IllegalMoveError(`Illegal move: ${JSON.stringify(move)}`);
    this.makeMove(legal);
    return legal;
  }

  /** Applies a move WITHOUT validation. Only pass moves from `legalMoves()`. */
  makeMove(m: Move): void {
    const notation = this.recordNotation ? this.moveToString(m) : '';
    let from = -1;
    if (m.type === 'place') {
      this.dropOn(m.to, m.piece);
      this.pos[m.piece] = m.to;
      this.toggleHash(m.piece, m.to, this.cells.get(m.to)!.length - 1);
    } else if (m.type === 'move') {
      from = this.pos[m.piece];
      this.toggleHash(m.piece, from, this.cells.get(from)!.length - 1);
      this.liftTop(from);
      this.dropOn(m.to, m.piece);
      this.pos[m.piece] = m.to;
      this.toggleHash(m.piece, m.to, this.cells.get(m.to)!.length - 1);
    }
    this.history.push({ move: m, from, prevLastMoved: this._lastMoved, prevResult: this._result, notation });
    this._lastMoved = m.type === 'pass' ? -1 : m.piece;
    this._ply++;
    this._result = this.computeResult();
    this.movesCache = null;
  }

  undo(): Move {
    const h = this.history.pop();
    if (!h) throw new Error('Nothing to undo');
    const m = h.move;
    if (m.type !== 'pass') {
      this.toggleHash(m.piece, m.to, this.cells.get(m.to)!.length - 1);
      this.liftTop(m.to);
      if (m.type === 'place') {
        this.pos[m.piece] = -1;
      } else {
        this.dropOn(h.from, m.piece);
        this.pos[m.piece] = h.from;
        this.toggleHash(m.piece, h.from, this.cells.get(h.from)!.length - 1);
      }
    }
    this._ply--;
    this._lastMoved = h.prevLastMoved;
    this._result = h.prevResult;
    this.movesCache = null;
    return m;
  }

  clone(): Hive {
    const g = new Hive(this.options);
    for (const [k, s] of this.cells) g.cells.set(k, [...s]);
    g.pos.set(this.pos);
    g._ply = this._ply;
    g._lastMoved = this._lastMoved;
    g._result = this._result;
    g.history = [...this.history];
    g.hashLo = this.hashLo;
    g.hashHi = this.hashHi;
    g.recordNotation = this.recordNotation;
    return g;
  }

  // -------------------------------------------------------------- notation

  /** UHP MoveString for a move in the current position (before it is played). */
  moveToString(m: Move): string {
    if (m.type === 'pass') return 'pass';
    const name = PIECES[m.piece].name;
    const from = m.type === 'move' ? this.pos[m.piece] : -1;
    if (from >= 0) this.liftTop(from);
    try {
      const dest = this.cells.get(m.to);
      if (dest) return `${name} ${PIECES[dest[dest.length - 1]].name}`;
      for (let d = 0; d < 6; d++) {
        const ref = this.cells.get(m.to - DIR_DELTA[d]);
        if (ref) return `${name} ${formatRelative(PIECES[ref[ref.length - 1]].name, d)}`;
      }
      return name;
    } finally {
      if (from >= 0) this.dropOn(from, m.piece);
    }
  }

  /** Parses a UHP MoveString into a legal move of the current position. */
  parseMove(text: string): Move {
    const s = text.trim();
    if (/^pass$/i.test(s)) {
      const pass = this.legalMoves().find((m) => m.type === 'pass');
      if (!pass) throw new IllegalMoveError('Pass is only allowed when there is no other legal move');
      return pass;
    }
    const match = MOVE_RE.exec(s);
    if (!match) throw new IllegalMoveError(`Invalid move string: "${text}"`);
    const piece = PIECE_BY_NAME.get(match[1]);
    if (!piece || !this.enabled[piece.id]) throw new IllegalMoveError(`Unknown piece: ${match[1]}`);
    let to: number;
    if (!match[3]) {
      if (this.cells.size > 0) throw new IllegalMoveError(`Missing position in "${text}"`);
      to = ORIGIN;
    } else {
      const ref = PIECE_BY_NAME.get(match[3]);
      const refPos = ref ? this.pos[ref.id] : -1;
      if (refPos < 0) throw new IllegalMoveError(`Reference piece not on board: ${match[3]}`);
      const pre = match[2];
      const suf = match[4];
      if (pre && suf) throw new IllegalMoveError(`Invalid move string: "${text}"`);
      to = pre ? refPos + DIR_DELTA[REL_PREFIX[pre]] : suf ? refPos + DIR_DELTA[REL_SUFFIX[suf]] : refPos;
    }
    const type = this.pos[piece.id] < 0 ? 'place' : 'move';
    const legal = this.findLegal({ type, piece: piece.id, to });
    if (!legal) throw new IllegalMoveError(`Illegal move: "${text}"`);
    return legal;
  }

  /** UHP GameString, e.g. "Base+MLP;InProgress;Black[2];wS1;bG1 -wS1;wQ wS1/". */
  toGameString(): string {
    const state = this._ply === 0 ? 'NotStarted' : this._result;
    const turn = `${this.turnColor === 0 ? 'White' : 'Black'}[${this.turnNumber}]`;
    return [this.gameType, state, turn, ...this.moveHistory].join(';');
  }

  static parseGameType(gameType: string): GameOptions {
    const m = /^Base(?:\+([MLP]+))?$/.exec(gameType.trim());
    if (!m) throw new Error(`Unsupported game type: ${gameType}`);
    const ext = m[1] ?? '';
    return { mosquito: ext.includes('M'), ladybug: ext.includes('L'), pillbug: ext.includes('P') };
  }

  static fromGameString(text: string, extra: Pick<GameOptions, 'tournamentOpening'> = {}): Hive {
    const parts = text.split(';').map((p) => p.trim()).filter((p) => p.length > 0);
    const options = Hive.parseGameType(parts[0] ?? 'Base');
    const game = new Hive({ ...options, ...extra });
    // Skip optional GameStateString and TurnString.
    let i = 1;
    if (parts[i] && /^(NotStarted|InProgress|Draw|WhiteWins|BlackWins)$/.test(parts[i])) i++;
    if (parts[i] && /^(White|Black)\[\d+\]$/.test(parts[i])) i++;
    for (; i < parts.length; i++) game.play(parts[i]);
    return game;
  }

  /** Builds an arbitrary position (puzzles, tests, analysis). Undo stops at the layout. */
  static fromLayout(layout: LayoutPiece[], options: LayoutOptions): Hive {
    const game = new Hive(options);
    for (const { piece, q, r } of layout) {
      const info = PIECE_BY_NAME.get(piece);
      if (!info) throw new Error(`Unknown piece ${piece}`);
      if (!game.enabled[info.id]) throw new Error(`Piece ${piece} not enabled in options`);
      if (game.pos[info.id] >= 0) throw new Error(`Piece ${piece} placed twice`);
      const key = toKey(q, r);
      game.dropOn(key, info.id);
      game.pos[info.id] = key;
      game.toggleHash(info.id, key, game.cells.get(key)!.length - 1);
    }
    game._ply = options.ply;
    game._lastMoved = options.lastMoved ? (PIECE_BY_NAME.get(options.lastMoved)?.id ?? -1) : -1;
    game._result = game.computeResult();
    return game;
  }

  // ------------------------------------------------------------- internals

  private toggleHash(piece: number, key: number, level: number): void {
    this.hashLo ^= zobrist(piece, key, level, 0x2545f491);
    this.hashHi ^= zobrist(piece, key, level, 0x6c8e9cf5);
  }

  private liftTop(key: number): number {
    const s = this.cells.get(key)!;
    const pid = s.pop()!;
    if (s.length === 0) this.cells.delete(key);
    return pid;
  }

  private dropOn(key: number, piece: number): void {
    const s = this.cells.get(key);
    if (s) s.push(piece);
    else this.cells.set(key, [piece]);
  }

  private height(key: number): number {
    const s = this.cells.get(key);
    return s ? s.length : 0;
  }

  private computeResult(): GameResult {
    const w = this.isQueenSurrounded(0);
    const b = this.isQueenSurrounded(1);
    if (w && b) return 'Draw';
    if (w) return 'BlackWins';
    if (b) return 'WhiteWins';
    return 'InProgress';
  }

  private generate(): Move[] {
    if (this._result !== 'InProgress') return [];
    const color = this.turnColor;
    const out: Move[] = [];
    this.genPlacements(color, out);
    if (this.pos[queenId(color)] >= 0) this.genMovements(color, out);
    if (out.length === 0) out.push({ type: 'pass' });
    return out;
  }

  private genPlacements(color: Color, out: Move[]): void {
    const turn = this.turnNumber;
    const mustPlaceQueen = turn === 4 && this.pos[queenId(color)] < 0;
    const candidates: number[] = [];
    for (const bug of BUG_TYPES) {
      if (bug === 'Q' ? turn === 1 && this.options.tournamentOpening : mustPlaceQueen) continue;
      const id = BUG_IDS[color][bug].find((p) => this.enabled[p] && this.pos[p] < 0);
      if (id !== undefined) candidates.push(id);
    }
    if (candidates.length === 0) return;

    const targets: number[] = [];
    if (this.cells.size === 0) {
      targets.push(ORIGIN);
    } else if (this._ply === 1) {
      const seen = new Set<number>();
      for (const key of this.cells.keys()) {
        for (const d of DIR_DELTA) {
          const n = key + d;
          if (!this.cells.has(n) && !seen.has(n)) {
            seen.add(n);
            targets.push(n);
          }
        }
      }
    } else {
      const seen = new Set<number>();
      for (const [key, stack] of this.cells) {
        if (PIECES[stack[stack.length - 1]].color !== color) continue;
        for (const d of DIR_DELTA) {
          const n = key + d;
          if (seen.has(n) || this.cells.has(n)) continue;
          seen.add(n);
          let touchesOpponent = false;
          for (const d2 of DIR_DELTA) {
            const s = this.cells.get(n + d2);
            if (s && PIECES[s[s.length - 1]].color !== color) {
              touchesOpponent = true;
              break;
            }
          }
          if (!touchesOpponent) targets.push(n);
        }
      }
    }
    for (const piece of candidates) for (const to of targets) out.push({ type: 'place', piece, to });
  }

  private genMovements(color: Color, out: Move[]): void {
    const pinnedCells = this.articulationPoints();
    // A piece the opponent just moved with a pillbug cannot move (or act) this turn.
    const stunned = this._lastMoved >= 0 && PIECES[this._lastMoved].color === color ? this._lastMoved : -1;
    const seen = new Set<number>();
    const add = (piece: number, to: number): void => {
      const k = piece * 65536 + to;
      if (!seen.has(k)) {
        seen.add(k);
        out.push({ type: 'move', piece, to });
      }
    };

    // Generation lifts pieces temporarily, which replaces stack arrays: re-read each cell.
    for (const key of [...this.cells.keys()]) {
      const stack = this.cells.get(key)!;
      const pid = stack[stack.length - 1];
      const info = PIECES[pid];
      if (info.color !== color || pid === stunned) continue;
      const height = stack.length;
      const pinned = height === 1 && pinnedCells.has(key);
      const bugs: BugType[] = info.bug === 'M' ? (height > 1 ? ['B'] : this.mosquitoBugs(key)) : [info.bug];
      for (const bug of bugs) {
        if (bug === 'P' && height === 1) this.genPillbugThrows(key, pinnedCells, add);
        if (pinned) continue;
        this.liftTop(key);
        const dests = this.destinations(bug, key);
        this.dropOn(key, pid);
        for (const to of dests) add(pid, to);
      }
    }
  }

  private mosquitoBugs(key: number): BugType[] {
    const set = new Set<BugType>();
    for (const d of DIR_DELTA) {
      const s = this.cells.get(key + d);
      if (s) {
        const bug = PIECES[s[s.length - 1]].bug;
        if (bug !== 'M') set.add(bug);
      }
    }
    return [...set];
  }

  /** Destinations for a piece already lifted from `from`. */
  private destinations(bug: BugType, from: number): Iterable<number> {
    switch (bug) {
      case 'Q':
      case 'P':
        return this.slideSteps(from);
      case 'B':
        return this.climbSteps(from);
      case 'G':
        return this.grasshopperJumps(from);
      case 'S':
        return this.spiderWalks(from);
      case 'A':
        return this.antWalks(from);
      case 'L':
        return this.ladybugWalks(from);
      default:
        return [];
    }
  }

  /**
   * Ground-level slide from `from` in direction `d`: the target must be empty and
   * exactly one of the two shared neighbors occupied (both = gate, none = loses contact).
   */
  private canSlide(from: number, d: number): boolean {
    if (this.cells.has(from + DIR_DELTA[d])) return false;
    const left = this.cells.has(from + DIR_DELTA[(d + 5) % 6]);
    const right = this.cells.has(from + DIR_DELTA[(d + 1) % 6]);
    return left !== right;
  }

  /**
   * One step for a piece that may travel on top of the hive (Beetle, Ladybug,
   * pillbug throws). Blocked when both shared neighbors are taller than both
   * the source and the destination stacks.
   */
  private canClimb(from: number, d: number): boolean {
    const hFrom = this.height(from);
    const hTo = this.height(from + DIR_DELTA[d]);
    const hLeft = this.height(from + DIR_DELTA[(d + 5) % 6]);
    const hRight = this.height(from + DIR_DELTA[(d + 1) % 6]);
    if (hFrom === 0 && hTo === 0) return (hLeft > 0) !== (hRight > 0);
    return Math.min(hLeft, hRight) <= Math.max(hFrom, hTo);
  }

  private slideSteps(from: number): number[] {
    const out: number[] = [];
    for (let d = 0; d < 6; d++) if (this.canSlide(from, d)) out.push(from + DIR_DELTA[d]);
    return out;
  }

  private climbSteps(from: number): number[] {
    const out: number[] = [];
    for (let d = 0; d < 6; d++) if (this.canClimb(from, d)) out.push(from + DIR_DELTA[d]);
    return out;
  }

  private grasshopperJumps(from: number): number[] {
    const out: number[] = [];
    for (const delta of DIR_DELTA) {
      let k = from + delta;
      if (!this.cells.has(k)) continue;
      while (this.cells.has(k)) k += delta;
      out.push(k);
    }
    return out;
  }

  private spiderWalks(from: number): Set<number> {
    const result = new Set<number>();
    const path = new Set<number>([from]);
    const walk = (k: number, depth: number): void => {
      if (depth === 3) {
        result.add(k);
        return;
      }
      for (let d = 0; d < 6; d++) {
        if (!this.canSlide(k, d)) continue;
        const n = k + DIR_DELTA[d];
        if (path.has(n)) continue;
        path.add(n);
        walk(n, depth + 1);
        path.delete(n);
      }
    };
    walk(from, 0);
    return result;
  }

  private antWalks(from: number): Set<number> {
    const visited = new Set<number>([from]);
    const queue = [from];
    while (queue.length > 0) {
      const k = queue.pop()!;
      for (let d = 0; d < 6; d++) {
        if (!this.canSlide(k, d)) continue;
        const n = k + DIR_DELTA[d];
        if (!visited.has(n)) {
          visited.add(n);
          queue.push(n);
        }
      }
    }
    visited.delete(from);
    return visited;
  }

  private ladybugWalks(from: number): Set<number> {
    const result = new Set<number>();
    for (let d1 = 0; d1 < 6; d1++) {
      const a = from + DIR_DELTA[d1];
      if (!this.cells.has(a) || !this.canClimb(from, d1)) continue;
      for (let d2 = 0; d2 < 6; d2++) {
        const b = a + DIR_DELTA[d2];
        if (!this.cells.has(b) || !this.canClimb(a, d2)) continue;
        for (let d3 = 0; d3 < 6; d3++) {
          const c = b + DIR_DELTA[d3];
          if (c === from || this.cells.has(c) || !this.canClimb(b, d3)) continue;
          result.add(c);
        }
      }
    }
    return result;
  }

  /** Pillbug special ability: lift an adjacent piece over itself to an empty adjacent cell. */
  private genPillbugThrows(pillbug: number, pinnedCells: Set<number>, add: (piece: number, to: number) => void): void {
    for (let d = 0; d < 6; d++) {
      const src = pillbug + DIR_DELTA[d];
      const s = this.cells.get(src);
      if (!s || s.length !== 1) continue;
      const target = s[0];
      if (target === this._lastMoved || pinnedCells.has(src)) continue;
      this.liftTop(src);
      if (this.canClimb(src, (d + 3) % 6)) {
        for (let e = 0; e < 6; e++) {
          const dest = pillbug + DIR_DELTA[e];
          if (dest === src || this.cells.has(dest)) continue;
          if (this.canClimb(pillbug, e)) add(target, dest);
        }
      }
      this.dropOn(src, target);
    }
  }

  /** Cells whose single piece cannot leave without splitting the hive (One Hive rule). */
  private articulationPoints(): Set<number> {
    const result = new Set<number>();
    const first = this.cells.keys().next();
    if (first.done) return result;
    const disc = new Map<number, number>();
    const low = new Map<number, number>();
    let time = 0;
    const visit = (u: number, parent: number): void => {
      disc.set(u, time);
      low.set(u, time);
      time++;
      let children = 0;
      for (const delta of DIR_DELTA) {
        const v = u + delta;
        if (!this.cells.has(v)) continue;
        if (!disc.has(v)) {
          children++;
          visit(v, u);
          low.set(u, Math.min(low.get(u)!, low.get(v)!));
          if (parent !== -1 && low.get(v)! >= disc.get(u)!) result.add(u);
        } else if (v !== parent) {
          low.set(u, Math.min(low.get(u)!, disc.get(v)!));
        }
      }
      if (parent === -1 && children > 1) result.add(u);
    };
    visit(first.value, -1);
    return result;
  }
}

export const keyToString = (key: number): string => `${keyQ(key)},${keyR(key)}`;
