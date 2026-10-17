// Updates the version line on the download page from the latest Windows installer.
// The installer itself is published as a GitHub Release (see README), not on Vercel.
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const desktop = resolve(here, '../../desktop');
const { version } = JSON.parse(readFileSync(resolve(desktop, 'package.json'), 'utf8'));
const installer = resolve(desktop, `release/Hive Pro Setup ${version}.exe`);

let size;
try {
  size = statSync(installer).size;
} catch {
  console.error(`Instalador não encontrado: ${installer}\nRode "npm run dist" na pasta hive-pro primeiro.`);
  process.exit(1);
}

const mb = Math.round(size / 1024 / 1024);
const page = resolve(here, '../public/index.html');
const html = readFileSync(page, 'utf8').replace(
  /(<p class="cta-meta" data-version>)[^<]*(<\/p>)/,
  `$1Programa para Windows: versão ${version}, ${mb} MB, Windows 10 e 11$2`,
);
writeFileSync(page, html);
console.log(`Página atualizada para o instalador ${version} (${mb} MB).`);
