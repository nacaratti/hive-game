import { BUG_TYPES, type BugType } from '@hive/engine';
import type { Weights } from './evaluate';

/** Weights as a flat numeric vector (for optimizers) and back. */
export const flatten = (w: Weights): number[] => [
  ...w.queenPressure,
  ...BUG_TYPES.map((b) => w.activePiece[b]),
  w.pinnedFactor,
  w.handFactor,
  w.attacker,
  w.queenCovered,
  w.mobility,
  w.queenInHand,
];

export const unflatten = (v: number[]): Weights => {
  let i = 0;
  const next = () => v[i++];
  const queenPressure = Array.from({ length: 6 }, next);
  const activePiece = Object.fromEntries(BUG_TYPES.map((b) => [b, next()])) as Record<BugType, number>;
  return {
    queenPressure,
    activePiece,
    pinnedFactor: next(),
    handFactor: next(),
    attacker: next(),
    queenCovered: next(),
    mobility: next(),
    queenInHand: next(),
  };
};

/** Keeps parameters in sensible ranges (factors in 0..1, everything else non-negative). */
export const clampWeights = (w: Weights): Weights => ({
  ...w,
  queenPressure: w.queenPressure.map((x) => Math.max(0, x)),
  activePiece: Object.fromEntries(Object.entries(w.activePiece).map(([k, x]) => [k, Math.max(0, x)])) as Record<BugType, number>,
  pinnedFactor: Math.min(1, Math.max(0, w.pinnedFactor)),
  handFactor: Math.min(1, Math.max(0, w.handFactor)),
  attacker: Math.max(0, w.attacker),
  queenCovered: Math.max(0, w.queenCovered),
  mobility: Math.max(0, w.mobility),
  queenInHand: Math.max(0, w.queenInHand),
});

export const roundWeights = (w: Weights): Weights => unflatten(flatten(w).map((x) => Math.round(x * 1000) / 1000));
