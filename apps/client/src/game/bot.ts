import type { BotLevel } from '@hive/ai';

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (m: string) => void; reject: (e: Error) => void }>();

const getWorker = () => {
  if (!worker) {
    worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; move?: string; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.move) p.resolve(e.data.move);
      else p.reject(new Error(e.data.error ?? 'bot failed'));
    };
  }
  return worker;
};

/** Asks the in-browser bot for a move (UHP string). Takes at least `minMs` to feel natural. */
export async function botMove(gameString: string, level: BotLevel, minMs = 650): Promise<string> {
  const started = performance.now();
  const id = ++seq;
  const move = await new Promise<string>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, gameString, level });
  });
  const wait = minMs - (performance.now() - started);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  return move;
}
