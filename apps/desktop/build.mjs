import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';

mkdirSync('bin', { recursive: true });

const common = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  logLevel: 'info',
  // Optional native accelerators of `ws`; the library falls back without them.
  external: ['electron', 'bufferutil', 'utf-8-validate'],
};

await build({ ...common, entryPoints: ['src/main.ts'], outfile: 'dist/main.cjs' });
await build({ ...common, entryPoints: ['src/preload.ts'], outfile: 'dist/preload.cjs' });
await build({ ...common, entryPoints: ['../server/src/bot-worker.ts'], outfile: 'dist/bot-worker.cjs' });
