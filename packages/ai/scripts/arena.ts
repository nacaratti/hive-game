/**
 * Plays bot levels (or weight files) against each other.
 *   npx tsx packages/ai/scripts/arena.ts facil medio 10 [timeMs]
 */
import { Hive } from '@hive/engine';
import { chooseMove, type BotLevel } from '../src';

const [a = 'facil', b = 'medio', n = '10', ms] = process.argv.slice(2);
const games = Number(n);
const timeMs = ms ? Number(ms) : undefined;
const score = { [a]: 0, [b]: 0, draw: 0 } as Record<string, number>;

for (let i = 0; i < games; i++) {
  const white = (i % 2 === 0 ? a : b) as BotLevel;
  const black = (i % 2 === 0 ? b : a) as BotLevel;
  const g = new Hive({ mosquito: true, ladybug: true, pillbug: true });
  while (!g.isOver && g.ply < 160) g.play(chooseMove(g, { level: g.turnColor === 0 ? white : black, timeMs }).move);
  const winner = g.result === 'WhiteWins' ? white : g.result === 'BlackWins' ? black : 'draw';
  score[winner]++;
  console.log(`jogo ${i + 1}: brancas=${white} pretas=${black} -> ${g.result} em ${g.ply} lances`);
}
console.log('placar', score);
