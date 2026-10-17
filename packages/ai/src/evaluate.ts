import { DIR_DELTA, PIECES, queenId, type BugType, type Color, type Hive } from '@hive/engine';
import current from '../models/current.json';

/**
 * Tunable evaluation weights. Plain JSON so they can be tuned by self-play
 * (see scripts/train.ts) and shipped as data in models/current.json.
 */
export interface Weights {
  /** Penalty for the number of occupied cells around one's own queen (index 0..5). */
  queenPressure: number[];
  /** Value of a piece that can still act, per bug type. */
  activePiece: Record<BugType, number>;
  /** Fraction of the active value kept by a pinned or covered piece. */
  pinnedFactor: number;
  /** Fraction of the active value for a piece still in hand. */
  handFactor: number;
  /** Bonus per own piece touching the enemy queen. */
  attacker: number;
  /** Penalty when an enemy beetle/mosquito sits on top of one's queen. */
  queenCovered: number;
  /** Weight of the board-move count difference. */
  mobility: number;
  /** Penalty while the queen is still in hand after the opening. */
  queenInHand: number;
}

/** Weights shipped with the game. `npm run train` overwrites models/current.json. */
export const DEFAULT_WEIGHTS: Weights = current as Weights;

export const WIN_SCORE = 100_000;

/** Static score from the point of view of `perspective` (positive = good for it). */
export function evaluate(game: Hive, perspective: Color, w: Weights = DEFAULT_WEIGHTS): number {
  switch (game.result) {
    case 'WhiteWins':
      return perspective === 0 ? WIN_SCORE : -WIN_SCORE;
    case 'BlackWins':
      return perspective === 1 ? WIN_SCORE : -WIN_SCORE;
    case 'Draw':
      return 0;
  }

  const pinned = game.pinnedCells();
  const score: [number, number] = [0, 0];

  for (const color of [0, 1] as Color[]) {
    const enemy = (1 - color) as Color;
    const q = game.positionOf(queenId(color));
    if (q >= 0) {
      score[color] -= w.queenPressure[Math.min(5, game.neighborCount(q))] ?? 0;
      const stack = game.stackAt(q)!;
      if (stack.length > 1 && PIECES[stack[stack.length - 1]].color === enemy) score[color] -= w.queenCovered;
    } else if (game.ply >= 4) {
      score[color] -= w.queenInHand;
    }

    const enemyQueen = game.positionOf(queenId(enemy));
    for (const pid of game.hand(color)) score[color] += w.activePiece[PIECES[pid].bug] * w.handFactor;

    for (const key of game.occupiedCells()) {
      const stack = game.stackAt(key)!;
      for (let level = 0; level < stack.length; level++) {
        const p = PIECES[stack[level]];
        if (p.color !== color) continue;
        const top = level === stack.length - 1;
        const free = top && !(stack.length === 1 && pinned.has(key));
        score[color] += w.activePiece[p.bug] * (free ? 1 : w.pinnedFactor);
        if (top && enemyQueen >= 0 && key !== enemyQueen && DIR_DELTA.some((d) => key + d === enemyQueen)) score[color] += w.attacker;
      }
    }
  }

  let total = score[perspective] - score[1 - perspective];
  if (w.mobility) total += w.mobility * (game.movementCount(perspective) - game.movementCount((1 - perspective) as Color));
  return total;
}
