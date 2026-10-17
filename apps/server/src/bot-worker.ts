import { parentPort } from 'node:worker_threads';
import { Hive } from '@hive/engine';
import { chooseMove, type BotLevel } from '@hive/ai';

/** Runs bot searches off the main thread so the server stays responsive. */
parentPort?.on('message', (msg: { id: number; gameString: string; level: BotLevel }) => {
  try {
    const game = Hive.fromGameString(msg.gameString);
    const result = chooseMove(game, { level: msg.level });
    parentPort!.postMessage({ id: msg.id, move: game.moveToString(result.move) });
  } catch (e) {
    parentPort!.postMessage({ id: msg.id, error: (e as Error).message });
  }
});
