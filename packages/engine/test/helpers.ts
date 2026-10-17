import { Hive, PIECE_BY_NAME, keyQ, keyR, type LayoutPiece, type LayoutOptions } from '../src';

export const id = (name: string): number => {
  const p = PIECE_BY_NAME.get(name);
  if (!p) throw new Error(`unknown piece ${name}`);
  return p.id;
};

export const L = (spec: string): LayoutPiece[] =>
  spec
    .trim()
    .split(/\s+/)
    .map((tok) => {
      const [piece, q, r] = tok.split(/[@,]/);
      return { piece, q: Number(q), r: Number(r) };
    });

export const layout = (spec: string, opts: Partial<LayoutOptions> = {}): Hive =>
  Hive.fromLayout(L(spec), { mosquito: true, ladybug: true, pillbug: true, ply: 20, ...opts });

/** Destinations of a piece's legal moves as sorted "q,r" strings. */
export const dests = (game: Hive, piece: string): string[] =>
  game
    .legalMovesForPiece(id(piece))
    .map((m) => (m.type === 'pass' ? 'pass' : `${keyQ(m.to)},${keyR(m.to)}`))
    .sort();

export const sorted = (...cells: string[]): string[] => [...cells].sort();
