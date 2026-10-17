import { describe, expect, it } from 'vitest';
import { LinkMatch } from '../src/net/linkMatch';

const exp = { mosquito: true, ladybug: true, pillbug: true };

describe('LinkMatch (host-authoritative browser game)', () => {
  it('applies legal moves in turn and rejects illegal, stale or out-of-turn ones', () => {
    const m = new LinkMatch(exp, 'Ana', 'white');
    expect(m.play('guest', 'bS1', 0)).toBe('Convidado não identificado.');
    expect(m.hello('g1', 'Bruno')).toBe(true);
    expect(m.hello('g2', 'Intruso')).toBe(false);
    expect(m.play('guest', 'bS1', 0)).toBe('Não é a sua vez.');
    expect(m.play('host', 'wQ', 0)).toBe('Lance ilegal.'); // tournament opening
    expect(m.play('host', 'wS1', 1)).toBe('Lance desatualizado.');
    expect(m.play('host', 'wS1', 0)).toBeNull();
    expect(m.play('guest', 'bS1 wS1-', 1)).toBeNull();
    expect(m.state(true).gameString).toBe('Base+MLP;InProgress;White[2];wS1;bS1 wS1-');
  });

  it('resignation ends the game for the right color and rematch swaps colors', () => {
    const m = new LinkMatch(exp, 'Ana', 'white');
    m.hello('g1', 'Bruno');
    m.play('host', 'wS1', 0);
    m.resign('guest');
    expect(m.result).toBe('WhiteWins');
    expect(m.play('host', 'wQ wS1-', 1)).toBe('A partida já terminou.');
    expect(m.rematch('host')).toBe(false);
    expect(m.rematch('guest')).toBe(true);
    expect(m.hostColor).toBe('black');
    expect(m.state(true)).toMatchObject({ result: 'InProgress', endReason: null, rematchBy: [] });
  });

  it('survives a save and restore (host page reload)', () => {
    const m = new LinkMatch(exp, 'Ana', 'black');
    m.hello('g1', 'Bruno');
    m.play('guest', 'wG1', 0);
    const back = LinkMatch.restore(JSON.parse(JSON.stringify(m.toJSON())));
    expect(back.game.toGameString()).toBe(m.game.toGameString());
    expect(back.hello('g1', 'Bruno')).toBe(true);
    expect(back.play('host', 'bG1 wG1-', 1)).toBeNull();
  });
});
