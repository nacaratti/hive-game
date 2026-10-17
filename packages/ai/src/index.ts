import type { Hive, Move } from '@hive/engine';
import { DEFAULT_WEIGHTS, type Weights } from './evaluate';
import { search, type SearchResult } from './search';

export * from './evaluate';
export * from './search';
export * from './weights';

export type BotLevel = 'facil' | 'medio' | 'dificil';

export const BOT_LEVELS: { id: BotLevel; label: string; description: string }[] = [
  { id: 'facil', label: 'Fácil', description: 'Para aprender as regras. Comete erros de propósito.' },
  { id: 'medio', label: 'Médio', description: 'Pensa dois lances à frente.' },
  { id: 'dificil', label: 'Difícil', description: 'Busca profunda. Pensa alguns segundos por lance.' },
];

const PROFILES: Record<BotLevel, { timeMs: number; maxDepth: number; noise: number; blunder: number }> = {
  facil: { timeMs: 250, maxDepth: 1, noise: 60, blunder: 0.25 },
  medio: { timeMs: 900, maxDepth: 2, noise: 8, blunder: 0 },
  dificil: { timeMs: 3000, maxDepth: 6, noise: 0, blunder: 0 },
};

export interface BotOptions {
  level: BotLevel;
  weights?: Weights;
  /** Overrides the level's think time. */
  timeMs?: number;
  random?: () => number;
}

/** Picks a move for the side to move. Never mutates `game`. */
export function chooseMove(game: Hive, opts: BotOptions): SearchResult {
  const p = PROFILES[opts.level];
  const rand = opts.random ?? Math.random;
  const legal = game.legalMoves();
  if (legal.length === 0) throw new Error('No legal moves: the game is over');
  if (p.blunder && rand() < p.blunder) {
    const move: Move = legal[Math.floor(rand() * legal.length)];
    return { move, score: 0, depth: 0, nodes: 0, pv: [move] };
  }
  return search(game, {
    timeMs: opts.timeMs ?? p.timeMs,
    maxDepth: p.maxDepth,
    noise: p.noise,
    weights: opts.weights ?? DEFAULT_WEIGHTS,
    random: rand,
  });
}
