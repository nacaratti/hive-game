import type { Hive } from './game';

/** Counts leaf nodes of the legal move tree to `depth` plies (engine correctness benchmark). */
export const perft = (game: Hive, depth: number): number => {
  if (depth === 0) return 1;
  const moves = game.legalMoves();
  if (depth === 1) return moves.length;
  const record = game.recordNotation;
  game.recordNotation = false;
  let total = 0;
  for (const m of [...moves]) {
    game.makeMove(m);
    total += perft(game, depth - 1);
    game.undo();
  }
  game.recordNotation = record;
  return total;
};
