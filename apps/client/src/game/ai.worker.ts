/// <reference lib="webworker" />
import { Hive } from '@hive/engine';
import { chooseMove, type BotLevel } from '@hive/ai';

self.onmessage = (e: MessageEvent<{ id: number; gameString: string; level: BotLevel }>) => {
  const { id, gameString, level } = e.data;
  try {
    const game = Hive.fromGameString(gameString);
    const result = chooseMove(game, { level });
    self.postMessage({ id, move: game.moveToString(result.move) });
  } catch (err) {
    self.postMessage({ id, error: (err as Error).message });
  }
};
