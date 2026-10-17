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
