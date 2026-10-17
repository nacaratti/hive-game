// Builds the browser-only game (no server: computer opponent + matches by link) into public/jogar/.
import { execSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const client = resolve(here, '../../client');
const out = resolve(client, 'dist-web');
const target = resolve(here, '../public/jogar');

execSync(`npx vite build --outDir "${out}" --emptyOutDir`, {
  cwd: client,
  stdio: 'inherit',
  env: { ...process.env, VITE_WEB_ONLY: 'true', HIVE_BASE: '/jogar/' },
});
rmSync(target, { recursive: true, force: true });
cpSync(out, target, { recursive: true });
rmSync(out, { recursive: true, force: true });
console.log('Versão para navegador gerada em public/jogar/');
