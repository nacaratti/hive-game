import { Worker } from 'node:worker_threads';
import { existsSync } from 'node:fs';
import { Hive } from '@hive/engine';
import { chooseMove, type BotLevel } from '@hive/ai';

type Pending = { resolve: (move: string) => void; reject: (e: Error) => void };

/** Computes bot moves in a worker thread, falling back to the main thread. */
export class BotRunner {
  private worker: Worker | null = null;
  private seq = 0;
  private readonly pending = new Map<number, Pending>();

  constructor(workerPath?: string) {
    if (!workerPath || !existsSync(workerPath)) return;
    try {
      this.worker = new Worker(workerPath);
      this.worker.on('message', (msg: { id: number; move?: string; error?: string }) => {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.move) p.resolve(msg.move);
        else p.reject(new Error(msg.error ?? 'bot failed'));
      });
      this.worker.on('error', (e) => {
        console.error('Bot worker error', e);
        for (const p of this.pending.values()) p.reject(e);
        this.pending.clear();
        this.worker = null;
      });
      this.worker.unref();
    } catch (e) {
      console.warn('Bot worker unavailable, using main thread', e);
      this.worker = null;
    }
  }

  think(gameString: string, level: BotLevel): Promise<string> {
    const worker = this.worker;
    if (!worker) return this.thinkHere(gameString, level);
    const id = ++this.seq;
    return new Promise<string>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ id, gameString, level });
    }).catch(() => this.thinkHere(gameString, level));
  }

  private thinkHere(gameString: string, level: BotLevel): Promise<string> {
    return new Promise((resolve, reject) =>
      setTimeout(() => {
        try {
          const game = Hive.fromGameString(gameString);
          resolve(game.moveToString(chooseMove(game, { level }).move));
        } catch (e) {
          reject(e as Error);
        }
      }, 10),
    );
  }

  close(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
