export enum PlayerColor {
  WHITE = 'WHITE',
  BLACK = 'BLACK',
}

export enum BugType {
  QUEEN = 'QUEEN',
  ANT = 'ANT',
  SPIDER = 'SPIDER',
  BEETLE = 'BEETLE',
  GRASSHOPPER = 'GRASSHOPPER',
}

// Cubic coordinates
export interface Hex {
  q: number;
  r: number;
  s: number;
}

export interface Piece {
  id: string; // Unique ID for React keys
  type: BugType;
  color: PlayerColor;
}

// A cell on the board can have a stack of pieces (Beetle mechanics)
export interface BoardCell {
  hex: Hex;
  stack: Piece[];
}

// Map key is usually `q,r`
export type BoardMap = Map<string, BoardCell>;

export interface PlayerState {
  color: PlayerColor;
  nickname: string;
  hand: { [key in BugType]: number };
  wins: number;
}

export interface GameState {
  board: BoardMap;
  turnNumber: number;
  currentPlayer: PlayerColor;
  players: {
    [PlayerColor.WHITE]: PlayerState;
    [PlayerColor.BLACK]: PlayerState;
  };
  winner: PlayerColor | 'DRAW' | null;
  log: string[];
  selectedHex: string | null; // coordinate string
  selectedPieceFromHand: BugType | null;
  validMoves: string[]; // coordinate strings
}
