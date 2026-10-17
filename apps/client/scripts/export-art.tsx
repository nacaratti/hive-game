import React from 'react';
/** Exports game art as standalone SVG files for the download page (apps/site). */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { BUG_TYPES, hexToPixel, type BugType, type Color } from '@hive/engine';
import { Tile, hexPath } from '../src/components/Tile';

const out = resolve(import.meta.dirname, '../../site/public/img');
mkdirSync(out, { recursive: true });
const svg = (viewBox: string, body: React.ReactNode) =>
  '<?xml version="1.0" encoding="UTF-8"?>\n' + renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg" viewBox={viewBox}>{body}</svg>);

const TILE = 30;
const S = TILE + 2.5;
const rosette: { bug: BugType; color: Color; q: number; r: number }[] = [
  { bug: 'Q', color: 1, q: 0, r: 0 },
  { bug: 'A', color: 0, q: 1, r: 0 },
  { bug: 'B', color: 0, q: 0, r: 1 },
  { bug: 'G', color: 0, q: -1, r: 1 },
  { bug: 'S', color: 0, q: -1, r: 0 },
  { bug: 'L', color: 1, q: 0, r: -1 },
];
const open = hexToPixel({ q: 1, r: -1 }, S);
writeFileSync(
  resolve(out, 'rosette.svg'),
  svg(
    '-84 -82 170 166',
    <>
      <g transform={`translate(${open.x},${open.y})`}>
        <path d={hexPath(TILE * 0.96)} fill="rgba(232,163,61,0.08)" stroke="#e8a33d" strokeWidth={1.6} strokeDasharray="5 4" />
        <circle r={TILE * 0.17} fill="#e8a33d" />
      </g>
      {rosette.map((t) => {
        const p = hexToPixel(t, S);
        return <Tile key={`${t.q},${t.r}`} bug={t.bug} color={t.color} size={TILE} x={p.x} y={p.y} />;
      })}
    </>,
  ),
);
for (const bug of BUG_TYPES) {
  writeFileSync(resolve(out, `tile-${bug}.svg`), svg('-52 -54 106 114', <Tile bug={bug} color={0} size={46} />));
}
console.log('arte exportada para', out);

// ------------------------------------------------------------------ rules
// "Como jogar": one SVG per rule diagram, then the same text injected into the
// rules page (/regras) and the README (between <!-- regras:inicio --> markers).
import { readFileSync } from 'node:fs';
import { BASIC_RULES, PIECE_RULES, type RuleEntry } from '../src/game/rules';
import { DiagramSvg } from '../src/components/RuleDiagram';

const rulesDir = resolve(out, 'regras');
mkdirSync(rulesDir, { recursive: true });
for (const rule of [...BASIC_RULES, ...PIECE_RULES]) {
  if (!rule.diagram) continue;
  writeFileSync(resolve(rulesDir, `${rule.id}.svg`), '<?xml version="1.0" encoding="UTF-8"?>\n' + renderToStaticMarkup(<DiagramSvg diagram={rule.diagram} />));
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const card = (r: RuleEntry) =>
  `          <article class="rule${r.diagram ? '' : ' no-art'}">` +
  (r.diagram ? `\n            <img class="art" src="/img/regras/${r.id}.svg" alt="Exemplo: ${esc(r.title)}" loading="lazy" />` : '') +
  `\n            <div>\n              <h4>${r.bug ? `<img src="/img/tile-${r.bug}.svg" alt="" />` : ''}${esc(r.title)}${r.expansion ? ' <span class="badge">expansão</span>' : ''}</h4>` +
  `\n              <p>${esc(r.text)}</p>\n            </div>\n          </article>`;

const siteBlock = `      <!-- regras:inicio -->
      <section class="rules wrap" id="regras">
        <h1 class="rules-title">Regras do Favo</h1>
        <p class="lead">Vence quem cercar primeiro a Abelha-Rainha do adversário. Nos desenhos, a peça com contorno claro é a que se move e os hexágonos dourados mostram para onde ela pode ir. As posições são reais: foram calculadas pelo próprio jogo.</p>
        <h3 class="group">Como cada peça anda</h3>
        <div class="rule-grid">
${PIECE_RULES.map(card).join('\n')}
        </div>
        <h3 class="group">Regras básicas</h3>
        <div class="rule-grid">
${BASIC_RULES.map(card).join('\n')}
        </div>
      </section>
      <!-- regras:fim -->`;

const md = (r: RuleEntry) =>
  `| ${r.diagram ? `<img src="apps/site/public/img/regras/${r.id}.svg" width="150" alt="${r.title}">` : ''} | ${r.bug ? `<img src="apps/site/public/img/tile-${r.bug}.svg" width="22" alt=""> ` : ''}**${r.title}**${r.expansion ? ' _(expansão)_' : ''} | ${r.text} |`;

const readmeBlock = `<!-- regras:inicio -->
## Como jogar

Nos desenhos, a peça com contorno claro é a que se move e os hexágonos dourados mostram para onde ela pode ir. As posições foram calculadas pelo próprio motor de regras. Dentro do jogo, o botão **Como jogar** no canto do tabuleiro mostra o mesmo guia.

### Como cada peça anda

| Exemplo | Peça | Como anda |
|:-:|---|---|
${PIECE_RULES.map(md).join('\n')}

### Regras básicas

| Exemplo | Regra | |
|:-:|---|---|
${BASIC_RULES.map(md).join('\n')}
<!-- regras:fim -->`;

const inject = (file: string, block: string) => {
  const text = readFileSync(file, 'utf8');
  const re = /[ \t]*<!-- regras:inicio -->[\s\S]*?<!-- regras:fim -->/;
  if (!re.test(text)) throw new Error(`Marcadores de regras não encontrados em ${file}`);
  writeFileSync(file, text.replace(re, block));
};
inject(resolve(import.meta.dirname, '../../site/public/regras.html'), siteBlock);
inject(resolve(import.meta.dirname, '../../../README.md'), readmeBlock);
console.log('regras exportadas (desenhos, site e README)');
