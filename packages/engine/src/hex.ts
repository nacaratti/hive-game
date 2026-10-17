/**
 * Axial hex coordinates (q, r) with pointy-top orientation, matching the
 * Universal Hive Protocol (UHP) direction markers.
 *
 * Cells are packed into a single integer key so the engine can use them as
 * Map keys and do neighbor math with plain additions.
 */

export interface Hex {
  q: number;
  r: number;
}

const OFFSET = 128;

export const toKey = (q: number, r: number): number => ((q + OFFSET) << 8) | (r + OFFSET);
export const keyQ = (key: number): number => (key >> 8) - OFFSET;
export const keyR = (key: number): number => (key & 255) - OFFSET;
export const keyToHex = (key: number): Hex => ({ q: keyQ(key), r: keyR(key) });
export const hexToKey = (h: Hex): number => toKey(h.q, h.r);

export const ORIGIN = toKey(0, 0);

/** Directions in clockwise order. Index i and i±1 are adjacent directions. */
export const Dir = { E: 0, SE: 1, SW: 2, W: 3, NW: 4, NE: 5 } as const;

export const DIRS: readonly (readonly [number, number])[] = [
  [1, 0], // E
  [0, 1], // SE
  [-1, 1], // SW
  [-1, 0], // W
  [0, -1], // NW
  [1, -1], // NE
];

/** Key delta for each direction (q contributes 256 per step, r contributes 1). */
export const DIR_DELTA: readonly number[] = DIRS.map(([dq, dr]) => dq * 256 + dr);

export const neighborKey = (key: number, dir: number): number => key + DIR_DELTA[dir];

export const neighborKeys = (key: number): number[] => DIR_DELTA.map((d) => key + d);

/** Direction index from `a` to an adjacent `b`, or -1 if not adjacent. */
export const dirBetween = (a: number, b: number): number => DIR_DELTA.indexOf(b - a);

export const hexDistance = (a: Hex, b: Hex): number => {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
};

/** Pixel center of a pointy-top hex of the given circumradius. */
export const hexToPixel = (h: Hex, size: number): { x: number; y: number } => ({
  x: size * Math.sqrt(3) * (h.q + h.r / 2),
  y: size * 1.5 * h.r,
});

/** Nearest hex to a pixel point (inverse of hexToPixel). */
export const pixelToHex = (x: number, y: number, size: number): Hex => {
  const q = ((Math.sqrt(3) / 3) * x - y / 3) / size;
  const r = ((2 / 3) * y) / size;
  return hexRound(q, r);
};

export const hexRound = (q: number, r: number): Hex => {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return { q: rq + 0, r: rr + 0 };
};
