/**
 * Trains the bot's evaluation weights.
 *
 *   npm run train -- selfplay [--iterations 30] [--games 8] [--ms 40]
 *       The bot plays against slightly perturbed copies of itself (SPSA) and keeps
 *       the changes that win more often.
 *
 *   npm run train -- games [--file ../../data/games.jsonl]
 *       Learns from finished games archived by the server (Texel tuning): adjusts
 *       the evaluation so it predicts who actually won from each position.
 *
 * Both modes start from models/current.json, save checkpoints in models/ and,
 * at the end, play a short match against the starting weights. The new weights
 * become models/current.json only if they are not weaker (use --force to skip).
 * Rebuild the app afterwards so the game ships the new bot.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hive } from '@hive/engine';
import { DEFAULT_WEIGHTS, clampWeights, evaluate, flatten, roundWeights, search, unflatten, type Weights } from '../src';

const here = dirname(fileURLToPath(import.meta.url));
const MODELS = resolve(here, '../models');
const args = process.argv.slice(2);
const mode = args[0] ?? 'selfplay';
const opt = (name: string, def: number | string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : String(def);
};
const force = args.includes('--force');
const OPTIONS = { mosquito: true, ladybug: true, pillbug: true };

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const save = (w: Weights, name: string) => writeFileSync(join(MODELS, name), JSON.stringify(roundWeights(w), null, 2) + '\n');

/** One game between two weight sets; returns +1 if `a` wins, -1 if `b` wins, 0 otherwise. */
function duel(a: Weights, b: Weights, aIsWhite: boolean, ms: number, seed: number): number {
  let s = seed;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const g = new Hive(OPTIONS);
  // A few random opening moves so games differ.
  for (let i = 0; i < 2 + (seed % 3); i++) {
    const legal = g.legalMoves();
    g.makeMove(legal[Math.floor(rand() * legal.length)]);
  }
  while (!g.isOver && g.ply < 140) {
    const white = g.turnColor === 0;
    const weights = white === aIsWhite ? a : b;
    g.makeMove(search(g, { timeMs: ms, maxDepth: 2, weights, noise: 2, random: rand }).move);
  }
  if (g.result === 'Draw' || g.result === 'InProgress') return 0;
  const whiteWon = g.result === 'WhiteWins';
  return whiteWon === aIsWhite ? 1 : -1;
}

function match(a: Weights, b: Weights, games: number, ms: number, seed: number): number {
  let score = 0;
  for (let i = 0; i < games; i++) score += duel(a, b, i % 2 === 0, ms, seed + Math.floor(i / 2));
  return score;
}

function selfplay(start: Weights): Weights {
  const iterations = Number(opt('iterations', 30));
  const games = Number(opt('games', 8));
  const ms = Number(opt('ms', 40));
  let theta = flatten(start);
  const scale = theta.map((x) => Math.max(0.05, Math.abs(x) * 0.25));
  console.log(`Autojogo: ${iterations} iterações × ${games} partidas (${ms} ms por lance)`);
  for (let k = 1; k <= iterations; k++) {
    const ck = 1 / Math.pow(k, 0.101);
    const ak = 0.6 / Math.pow(k + 5, 0.602);
    const delta = theta.map(() => (Math.random() < 0.5 ? -1 : 1));
    const plus = clampWeights(unflatten(theta.map((x, i) => x + ck * delta[i] * scale[i])));
    const minus = clampWeights(unflatten(theta.map((x, i) => x - ck * delta[i] * scale[i])));
    const result = match(plus, minus, games, ms, k * 7919);
    theta = flatten(clampWeights(unflatten(theta.map((x, i) => x + ((ak * result) / games) * delta[i] * scale[i]))));
    console.log(`  iteração ${k}: placar ${result >= 0 ? '+' : ''}${result}`);
    if (k % 5 === 0) save(unflatten(theta), `checkpoint-${stamp()}.json`);
  }
  return unflatten(theta);
}

function fromGames(start: Weights): Weights {
  const file = resolve(opt('file', resolve(here, '../../../data/games.jsonl')));
  if (!existsSync(file)) throw new Error(`Arquivo de partidas não encontrado: ${file}`);
  const samples: { game: Hive; y: number }[] = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line) as { gameString: string; result: string };
    if (rec.result === 'InProgress') continue;
    const y = rec.result === 'WhiteWins' ? 1 : rec.result === 'BlackWins' ? 0 : 0.5;
    const moves = rec.gameString.split(';').slice(3);
    const header = rec.gameString.split(';').slice(0, 3);
    for (let ply = 6; ply < moves.length; ply += 2) {
      try {
        samples.push({ game: Hive.fromGameString([...header, ...moves.slice(0, ply)].join(';')), y });
      } catch {
        /* skip corrupt records */
      }
    }
  }
  if (samples.length < 20) throw new Error(`Poucas posições para aprender (${samples.length}). Jogue mais partidas primeiro.`);
  console.log(`Aprendendo com ${samples.length} posições de partidas reais`);
  const K = 0.01;
  const loss = (w: Weights) =>
    samples.reduce((sum, { game, y }) => {
      const p = 1 / (1 + Math.exp(-K * Math.max(-2000, Math.min(2000, evaluate(game, 0, w)))));
      return sum + (p - y) ** 2;
    }, 0) / samples.length;

  let theta = flatten(start);
  let best = loss(unflatten(theta));
  console.log(`  erro inicial ${best.toFixed(5)}`);
  for (let pass = 1; pass <= Number(opt('passes', 4)); pass++) {
    let improved = false;
    for (let i = 0; i < theta.length; i++) {
      const step = Math.max(0.02, Math.abs(theta[i]) * 0.1);
      for (const dir of [1, -1]) {
        const trial = [...theta];
        trial[i] += dir * step;
        const l = loss(clampWeights(unflatten(trial)));
        if (l < best) {
          best = l;
          theta = flatten(clampWeights(unflatten(trial)));
          improved = true;
          break;
        }
      }
    }
    console.log(`  passada ${pass}: erro ${best.toFixed(5)}`);
    if (!improved) break;
  }
  return unflatten(theta);
}

const start = DEFAULT_WEIGHTS;
const trained = mode === 'games' ? fromGames(start) : selfplay(start);
const name = `weights-${stamp()}.json`;
save(trained, name);
console.log(`\nPesos salvos em models/${name}`);

console.log('Conferindo contra os pesos anteriores (12 partidas)…');
const verdict = match(trained, start, 12, 60, 424242);
console.log(`  placar dos novos pesos: ${verdict >= 0 ? '+' : ''}${verdict}`);
if (verdict >= 0 || force) {
  save(trained, 'current.json');
  console.log('models/current.json atualizado. Reconstrua o app para usar o novo robô.');
} else {
  console.log('Os novos pesos jogaram pior; current.json mantido. Use --force para aplicar mesmo assim.');
}
