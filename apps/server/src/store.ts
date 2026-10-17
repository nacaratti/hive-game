import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FinishedGame } from './room';

/**
 * Append-only game archive (one JSON object per line). Doubles as the
 * training dataset for the AI.
 */
export class GameStore {
  private readonly file: string;
  private ready: Promise<void>;

  constructor(dir: string) {
    this.file = join(dir, 'games.jsonl');
    this.ready = mkdir(dir, { recursive: true }).then(() => undefined);
  }

  async save(game: FinishedGame): Promise<void> {
    await this.ready;
    await appendFile(this.file, JSON.stringify(game) + '\n', 'utf8');
  }

  async recent(limit = 50): Promise<FinishedGame[]> {
    await this.ready;
    try {
      const lines = (await readFile(this.file, 'utf8')).trim().split('\n').filter(Boolean);
      return lines.slice(-limit).reverse().map((l) => JSON.parse(l) as FinishedGame);
    } catch {
      return [];
    }
  }
}
