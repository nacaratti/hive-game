import { describe, expect, it } from 'vitest';
import { DIR_DELTA, Hive, PIECES, perft } from '../src';

describe('perft (reference values from Mzinga, Base game)', () => {
  const expected = [4, 96, 1440, 21600, 516240, 12219480];
  expected.forEach((count, i) => {
    it(`depth ${i + 1} = ${count}`, () => {
      expect(perft(new Hive(), i + 1)).toBe(count);
    });
  });
});

const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const checkInvariants = (g: Hive): void => {
  const cells = g.occupiedCells();
  let count = 0;
  for (const key of cells) {
    const stack = g.stackAt(key)!;
    expect(stack.length).toBeGreaterThan(0);
    stack.forEach((p) => expect(g.positionOf(p)).toBe(key));
    count += stack.length;
  }
  expect(count).toBe(PIECES.filter((p) => g.positionOf(p.id) >= 0).length);
  // One Hive: all occupied cells connected.
  if (cells.length > 0) {
    const set = new Set(cells);
    const seen = new Set([cells[0]]);
    const stack = [cells[0]];
    while (stack.length) {
      const k = stack.pop()!;
      for (const d of DIR_DELTA) if (set.has(k + d) && !seen.has(k + d)) (seen.add(k + d), stack.push(k + d));
    }
    expect(seen.size).toBe(cells.length);
  }
};

describe('fuzz: random games keep every invariant', () => {
  const variants = [
    { label: 'Base', opts: {} },
    { label: 'Base+MLP', opts: { mosquito: true, ladybug: true, pillbug: true } },
  ];
  for (const { label, opts } of variants) {
    it(`${label}: 150 random games`, { timeout: 180_000 }, () => {
      const rand = rng(label.length * 7919);
      for (let game = 0; game < 150; game++) {
        const g = new Hive(opts);
        const startKey = g.positionKey();
        while (!g.isOver && g.ply < 160) {
          const moves = g.legalMoves();
          expect(moves.length).toBeGreaterThan(0);
          for (let s = 0; s < 3; s++) {
            const m = moves[Math.floor(rand() * moves.length)];
            expect(g.parseMove(g.moveToString(m))).toEqual(m);
          }
          const before = g.positionKey();
          const m = moves[Math.floor(rand() * moves.length)];
          g.play(m);
          checkInvariants(g);
          if (rand() < 0.1) {
            g.undo();
            expect(g.positionKey()).toBe(before);
            g.play(m);
          }
        }
        const replay = Hive.fromGameString(g.toGameString());
        expect(replay.positionKey()).toBe(g.positionKey());
        expect(replay.result).toBe(g.result);
        while (g.canUndo) g.undo();
        expect(g.positionKey()).toBe(startKey);
        expect(g.occupiedCells()).toHaveLength(0);
      }
    });
  }
});
