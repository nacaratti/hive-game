export type Color = 0 | 1;
export const WHITE: Color = 0;
export const BLACK: Color = 1;

export type BugType = 'Q' | 'S' | 'B' | 'G' | 'A' | 'M' | 'L' | 'P';

export const BUG_TYPES: readonly BugType[] = ['Q', 'S', 'B', 'G', 'A', 'M', 'L', 'P'];
export const EXPANSION_BUGS: readonly BugType[] = ['M', 'L', 'P'];

export const BUG_COUNTS: Readonly<Record<BugType, number>> = {
  Q: 1,
  S: 2,
  B: 2,
  G: 3,
  A: 3,
  M: 1,
  L: 1,
  P: 1,
};

export const BUG_NAMES_PT: Readonly<Record<BugType, string>> = {
  Q: 'Abelha-Rainha',
  S: 'Aranha',
  B: 'Besouro',
  G: 'Gafanhoto',
  A: 'Formiga',
  M: 'Mosquito',
  L: 'Joaninha',
  P: 'Tatuzinho',
};

export interface PieceInfo {
  /** Stable index 0..27 (white 0..13, black 14..27). */
  id: number;
  color: Color;
  bug: BugType;
  /** 1-based number within its bug type (always 1 for single pieces). */
  num: number;
  /** UHP name, e.g. "wQ", "bS2", "wM". */
  name: string;
}

export const PIECES_PER_COLOR = 14;
export const PIECE_COUNT = PIECES_PER_COLOR * 2;

const build = (): PieceInfo[] => {
  const list: PieceInfo[] = [];
  for (const color of [WHITE, BLACK] as const) {
    for (const bug of BUG_TYPES) {
      const count = BUG_COUNTS[bug];
      for (let num = 1; num <= count; num++) {
        const name = `${color === WHITE ? 'w' : 'b'}${bug}${count > 1 ? num : ''}`;
        list.push({ id: list.length, color, bug, num, name });
      }
    }
  }
  return list;
};

export const PIECES: readonly PieceInfo[] = build();

export const PIECE_BY_NAME: ReadonlyMap<string, PieceInfo> = new Map(PIECES.map((p) => [p.name, p]));

export const queenId = (color: Color): number => color * PIECES_PER_COLOR;

/** Piece ids of a bug type for a color, in placement order (S1 before S2). */
export const BUG_IDS: readonly (Readonly<Record<BugType, readonly number[]>>)[] = [WHITE, BLACK].map((color) => {
  const rec = {} as Record<BugType, number[]>;
  for (const bug of BUG_TYPES) rec[bug] = PIECES.filter((p) => p.color === color && p.bug === bug).map((p) => p.id);
  return rec;
});
