import { describe, expect, it } from 'vitest';
import { Hive, toKey } from '../src';
import { dests, id, layout, sorted } from './helpers';

describe('placement', () => {
  it('first placement is at the origin and the queen is not allowed (tournament opening)', () => {
    const g = new Hive();
    const moves = g.legalMoves();
    expect(moves).toHaveLength(4);
    expect(moves.every((m) => m.type === 'place' && m.to === toKey(0, 0))).toBe(true);
    expect(moves.some((m) => m.type === 'place' && m.piece === id('wQ'))).toBe(false);
  });

  it('allows the queen first when the tournament opening is off', () => {
    const g = new Hive({ tournamentOpening: false });
    expect(g.legalMoves()).toHaveLength(5);
  });

  it('second placement may go anywhere adjacent to the first piece', () => {
    const g = new Hive();
    g.play('wS1');
    expect(g.legalMoves()).toHaveLength(4 * 6);
  });

  it('later placements must touch only own pieces', () => {
    const g = new Hive();
    g.play('wS1');
    g.play('bS1 wS1-');
    const cells = new Set(g.legalMoves().map((m) => (m.type === 'place' ? m.to : -1)));
    // Neighbors of wS1 (0,0) that are not adjacent to bS1 (1,0).
    expect([...cells].sort()).toEqual([toKey(-1, 0), toKey(-1, 1), toKey(0, -1)].sort());
  });

  it('places numbered pieces in order', () => {
    const g = new Hive();
    g.play('wS1');
    expect(() => g.play('bS2 wS1-')).toThrow();
    g.play('bS1 wS1-');
    expect(() => g.play('wS1 -wS1')).toThrow();
    g.play('wS2 -wS1');
  });

  it('forces the queen on the fourth turn and forbids moving before it', () => {
    const g = Hive.fromGameString('Base;InProgress;White[4];wS1;bS1 wS1-;wS2 -wS1;bS2 bS1-;wB1 -wS2;bB1 bS2-');
    const moves = g.legalMoves();
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((m) => m.type === 'place' && m.piece === id('wQ'))).toBe(true);
  });

  it('does not allow pieces from disabled expansions', () => {
    const g = new Hive();
    expect(() => g.play('wM')).toThrow();
    const e = new Hive({ mosquito: true, ladybug: true, pillbug: true });
    expect(e.legalMoves()).toHaveLength(7);
  });
});

describe('movement', () => {
  it('queen slides one space and respects the gate', () => {
    const g = layout('bQ@0,1 bS1@-1,1 bS2@-1,0 bB1@0,-1 bB2@1,-1 wQ@1,0');
    expect(dests(g, 'wQ')).toEqual(sorted('2,-1', '1,1'));
  });

  it('ant cannot enter a gated hole but walks the whole perimeter', () => {
    const g = layout('bQ@0,1 bS1@-1,1 bS2@-1,0 bB1@0,-1 bB2@1,-1 wQ@-2,0 wA1@-2,1');
    const d = dests(g, 'wA1');
    expect(d).not.toContain('0,0');
    expect(d).toContain('1,0');
    expect(d).toContain('1,-2');
    expect(d).not.toContain('-2,1');
  });

  it('spider moves exactly three spaces', () => {
    const g = layout('wQ@0,0 bQ@1,0 wS1@-1,0');
    expect(dests(g, 'wS1')).toEqual(sorted('2,-1', '1,1'));
  });

  it('grasshopper jumps over a line of pieces', () => {
    const g = layout('wQ@0,0 bQ@1,0 wG1@-1,0');
    expect(dests(g, 'wG1')).toEqual(['2,0']);
  });

  it('beetle slides or climbs', () => {
    const g = layout('wQ@0,0 bQ@1,0 wB1@-1,0');
    expect(dests(g, 'wB1')).toEqual(sorted('0,0', '0,-1', '-1,1'));
  });

  it('beetle on top of the hive moves freely and can climb down', () => {
    const g = layout('wQ@-1,0 bQ@0,0 wB1@0,0');
    expect(dests(g, 'wB1')).toHaveLength(6);
    // The covered queen cannot move.
    expect(dests(g, 'bQ')).toEqual([]);
  });

  it('beetle is blocked by a gate of tall stacks', () => {
    // wB1 at (0,0) wants to climb onto (1,0); shared neighbors (1,-1) and (0,1) are height-2 stacks.
    const g = layout('wQ@0,-1 wB1@0,0 bQ@1,0 bS1@1,-1 bB1@1,-1 wS1@0,1 wB2@0,1');
    const d = dests(g, 'wB1');
    expect(d.length).toBeGreaterThan(0);
    expect(d).not.toContain('1,0');
  });

  it('ladybug moves two on top and one down', () => {
    const g = layout('wQ@0,0 bQ@1,0 wL@-1,0');
    expect(dests(g, 'wL')).toEqual(sorted('2,0', '1,1', '0,1', '1,-1', '2,-1'));
  });

  it('mosquito copies adjacent pieces', () => {
    const g = layout('wM@-1,0 bG1@0,0 wQ@1,0');
    expect(dests(g, 'wM')).toEqual(['2,0']);
  });

  it('mosquito touching only a mosquito cannot move', () => {
    const g = layout('wM@-1,0 bM@0,0 wQ@1,0');
    expect(dests(g, 'wM')).toEqual([]);
  });

  it('mosquito on top of the hive moves as a beetle', () => {
    const g = layout('wQ@-1,0 bQ@0,0 wM@0,0');
    expect(dests(g, 'wM')).toHaveLength(6);
  });

  it('one hive: a piece that would split the hive cannot move', () => {
    const g = layout('wA1@-1,0 wQ@0,0 bQ@1,0');
    expect(dests(g, 'wQ')).toEqual([]);
    expect(dests(g, 'wA1').length).toBeGreaterThan(0);
  });
});

describe('pillbug', () => {
  const base = 'wQ@-1,0 wP@0,0 bQ@1,0';

  it('throws adjacent pieces of either color even while pinned', () => {
    const g = layout(base);
    expect(dests(g, 'bQ')).toEqual(sorted('0,1', '-1,1', '0,-1', '1,-1'));
    expect(dests(g, 'wQ')).toEqual(sorted('0,1', '-1,1', '0,-1', '1,-1'));
    expect(dests(g, 'wP')).toEqual([]); // pinned itself
  });

  it('cannot throw the piece the opponent just moved', () => {
    const g = layout(base, { lastMoved: 'bQ' });
    expect(dests(g, 'bQ')).toEqual([]);
  });

  it('a thrown piece is stunned on its next turn', () => {
    const g = layout(base, { lastMoved: 'wQ' });
    expect(dests(g, 'wQ')).toEqual([]);
  });

  it('mosquito next to a pillbug can throw', () => {
    const g = layout('wQ@-2,0 wP@-1,0 wM@0,0 bQ@1,0');
    expect(dests(g, 'bQ')).toEqual(sorted('0,1', '-1,1', '0,-1', '1,-1'));
  });

  it('cannot throw a piece out of a stack', () => {
    const g = layout('wQ@-1,0 wP@0,0 bQ@1,0 bB1@1,0');
    expect(dests(g, 'bB1')).toEqual([]);
  });
});

describe('end of game', () => {
  it('surrounding the opposing queen wins', () => {
    const g = layout('bQ@0,0 wQ@1,0 wS1@0,1 wS2@-1,1 wG1@-1,0 wG2@0,-1 wB1@1,-2', { mosquito: false, ladybug: false, pillbug: false });
    g.play({ type: 'move', piece: id('wB1'), to: toKey(1, -1) });
    expect(g.result).toBe('WhiteWins');
    expect(g.legalMoves()).toHaveLength(0);
  });

  it('surrounding both queens at once is a draw', () => {
    const g = layout('wQ@0,0 bQ@1,0 wS1@0,1 wS2@-1,1 wG1@-1,0 wG2@0,-1 bS1@2,0 bS2@1,1 bG1@2,-1 wB1@1,-2');
    g.play({ type: 'move', piece: id('wB1'), to: toKey(1, -1) });
    expect(g.result).toBe('Draw');
  });

  it('a player with no legal move must pass', () => {
    const g = layout('wQ@0,0 bQ@1,0 bS1@0,1 bS2@-1,1 bB1@-1,0 bB2@0,-1', { mosquito: false, ladybug: false, pillbug: false });
    expect(g.legalMoves()).toEqual([{ type: 'pass' }]);
    g.play('pass');
    expect(g.turnColor).toBe(1);
  });

  it('pass is illegal while other moves exist', () => {
    const g = new Hive();
    expect(() => g.play('pass')).toThrow();
  });
});

describe('notation', () => {
  it('round-trips a game string', () => {
    const text = 'Base+MLP;InProgress;White[3];wS1;bG1 -wS1;wQ wS1/;bQ /bG1';
    const g = Hive.fromGameString(text);
    expect(g.toGameString()).toBe(text);
    expect(g.turnColor).toBe(0);
    expect(g.turnNumber).toBe(3);
  });

  it('writes beetle moves onto a stack as the covered piece', () => {
    const g = layout('wQ@0,0 bQ@1,0 wB1@-1,0');
    expect(g.moveToString({ type: 'move', piece: id('wB1'), to: toKey(0, 0) })).toBe('wB1 wQ');
  });

  it('starts as NotStarted', () => {
    expect(new Hive().toGameString()).toBe('Base;NotStarted;White[1]');
  });
});
