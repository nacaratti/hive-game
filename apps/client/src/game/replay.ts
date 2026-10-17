import { Hive } from '@hive/engine';

/** Rebuilds the position after `ply` moves of a UHP GameString. */
export const positionAt = (gameString: string, ply: number): Hive => {
  const parts = gameString.split(';');
  return Hive.fromGameString([...parts.slice(0, 3), ...parts.slice(3, 3 + ply)].join(';'));
};

export const movesOf = (gameString: string): string[] => gameString.split(';').slice(3).filter(Boolean);
