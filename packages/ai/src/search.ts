import { DIR_DELTA, queenId, type Color, type Hive, type Move } from '@hive/engine';
import { DEFAULT_WEIGHTS, WIN_SCORE, evaluate, type Weights } from './evaluate';

export interface SearchOptions {
  /** Soft time budget in milliseconds. */
  timeMs: number;
  maxDepth: number;
  weights?: Weights;
  /** Random jitter added at the root to vary play (score units). */
  noise?: number;
  random?: () => number;
}

export interface SearchResult {
  move: Move;
  score: number;
  depth: number;
  nodes: number;
  pv: Move[];
}

const enum Bound {
  Exact,
  Lower,
  Upper,
}

interface TTEntry {
  depth: number;
  score: number;
  bound: Bound;
  best: Move | null;
}

class Timeout extends Error {}

const sameMove = (a: Move | null, b: Move): boolean =>
  !!a && a.type === b.type && (a.type === 'pass' || (b.type !== 'pass' && a.piece === b.piece && a.to === b.to));

const touches = (a: number, b: number) => DIR_DELTA.some((d) => a + d === b);

/**
 * Iterative-deepening negamax with alpha-beta pruning and a transposition table.
 * Works on a private clone, so the caller's game is untouched.
 */
export function search(input: Hive, opts: SearchOptions): SearchResult {
  const game = input.clone();
  game.recordNotation = false;
  const weights = opts.weights ?? DEFAULT_WEIGHTS;
  const rand = opts.random ?? Math.random;
  const deadline = Date.now() + opts.timeMs;
  const tt = new Map<string, TTEntry>();
  let nodes = 0;

  const rootMoves = [...game.legalMoves()];
  if (rootMoves.length === 1) return { move: rootMoves[0], score: 0, depth: 0, nodes: 0, pv: [rootMoves[0]] };

  /** Cheap ordering: captures of space around the enemy queen first. */
  const orderScore = (g: Hive, m: Move, color: Color, ttBest: Move | null): number => {
    if (sameMove(ttBest, m)) return 1e9;
    if (m.type === 'pass') return 0;
    let s = 0;
    const enemyQ = g.positionOf(queenId((1 - color) as Color));
    const ownQ = g.positionOf(queenId(color));
    if (enemyQ >= 0 && touches(m.to, enemyQ)) s += 100;
    if (enemyQ >= 0 && m.to === enemyQ) s += 150;
    if (m.type === 'move') {
      const from = g.positionOf(m.piece);
      if (enemyQ >= 0 && touches(from, enemyQ)) s -= 60;
      if (ownQ >= 0 && touches(from, ownQ)) s += 40;
      if (ownQ >= 0 && touches(m.to, ownQ)) s -= 30;
      s += 10;
    }
    return s;
  };

  const negamax = (depth: number, alpha: number, beta: number, ply: number): number => {
    if ((++nodes & 1023) === 0 && Date.now() > deadline) throw new Timeout();
    if (game.isOver || depth === 0) {
      const v = evaluate(game, game.turnColor, weights);
      // Prefer faster wins and slower losses.
      return v >= WIN_SCORE ? v - ply : v <= -WIN_SCORE ? v + ply : v;
    }
    const key = game.positionKey();
    const entry = tt.get(key);
    if (entry && entry.depth >= depth) {
      if (entry.bound === Bound.Exact) return entry.score;
      if (entry.bound === Bound.Lower && entry.score >= beta) return entry.score;
      if (entry.bound === Bound.Upper && entry.score <= alpha) return entry.score;
    }
    const color = game.turnColor;
    const moves = [...game.legalMoves()];
    const ttBest = entry?.best ?? null;
    const ordered = moves.map((m) => ({ m, s: orderScore(game, m, color, ttBest) })).sort((a, b) => b.s - a.s);

    const alpha0 = alpha;
    let best = -Infinity;
    let bestMove: Move | null = null;
    for (const { m } of ordered) {
      game.makeMove(m);
      let v: number;
      try {
        v = -negamax(depth - 1, -beta, -alpha, ply + 1);
      } finally {
        game.undo();
      }
      if (v > best) {
        best = v;
        bestMove = m;
      }
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    tt.set(key, {
      depth,
      score: best,
      bound: best <= alpha0 ? Bound.Upper : best >= beta ? Bound.Lower : Bound.Exact,
      best: bestMove,
    });
    return best;
  };

  const color = game.turnColor;
  let result: SearchResult = { move: rootMoves[0], score: -Infinity, depth: 0, nodes: 0, pv: [] };
  let scored = rootMoves.map((m) => ({ m, s: orderScore(game, m, color, null) })).sort((a, b) => b.s - a.s);

  for (let depth = 1; depth <= opts.maxDepth; depth++) {
    try {
      let alpha = -Infinity;
      const next: { m: Move; s: number }[] = [];
      for (const { m } of scored) {
        game.makeMove(m);
        let v: number;
        try {
          v = -negamax(depth - 1, -Infinity, -alpha, 1);
        } finally {
          game.undo();
        }
        if (opts.noise) v += (rand() - 0.5) * opts.noise;
        next.push({ m, s: v });
        if (v > alpha) alpha = v;
      }
      next.sort((a, b) => b.s - a.s);
      scored = next;
      result = { move: next[0].m, score: next[0].s, depth, nodes, pv: [next[0].m] };
      if (Math.abs(next[0].s) >= WIN_SCORE - 100) break; // forced result found
    } catch (e) {
      if (e instanceof Timeout) break;
      throw e;
    }
    if (Date.now() > deadline) break;
  }
  result.nodes = nodes;
  return result;
}
