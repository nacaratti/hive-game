import { describe, expect, it } from 'vitest';
import { Hive, toKey, PIECE_BY_NAME } from '@hive/engine';
import { chooseMove, evaluate, type BotLevel } from '../src';

const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

type Player = BotLevel | 'random';

const playGame = (white: Player, black: Player, seed: number, opts = { mosquito: true, ladybug: true, pillbug: true }) => {
  const g = new Hive(opts);
  const rand = rng(seed);
  while (!g.isOver && g.ply < 200) {
    const who = g.turnColor === 0 ? white : black;
    const legal = g.legalMoves();
    const move = who === 'random' ? legal[Math.floor(rand() * legal.length)] : chooseMove(g, { level: who, timeMs: 60, random: rand }).move;
    g.play(move); // play() validates: throws on an illegal bot move
  }
  return g.result;
};

describe('bot', () => {
  it('takes an immediate win', () => {
    // Black queen surrounded on five sides; the white beetle can fill the sixth cell.
    const g = Hive.fromLayout(
      [
        { piece: 'bQ', q: 0, r: 0 },
        { piece: 'wQ', q: 1, r: 0 },
        { piece: 'wS1', q: 0, r: 1 },
        { piece: 'wS2', q: -1, r: 1 },
        { piece: 'wG1', q: -1, r: 0 },
        { piece: 'wG2', q: 0, r: -1 },
        { piece: 'wB1', q: 1, r: -2 },
      ],
      { ply: 20 },
    );
    const res = chooseMove(g, { level: 'medio', timeMs: 500 });
    expect(res.move).toEqual({ type: 'move', piece: PIECE_BY_NAME.get('wB1')!.id, to: toKey(1, -1) });
  });

  it('evaluation is symmetric', () => {
    const g = Hive.fromGameString('Base;InProgress;White[3];wS1;bG1 -wS1;wQ wS1/;bQ /bG1');
    expect(evaluate(g, 0)).toBeCloseTo(-evaluate(g, 1));
  });

  it('never plays an illegal move and beats a random player', { timeout: 120_000 }, () => {
    let wins = 0;
    const games = 12;
    for (let i = 0; i < games; i++) {
      const botWhite = i % 2 === 0;
      const result = botWhite ? playGame('medio', 'random', i + 1) : playGame('random', 'medio', i + 1);
      if ((botWhite && result === 'WhiteWins') || (!botWhite && result === 'BlackWins')) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(10);
  });
});
