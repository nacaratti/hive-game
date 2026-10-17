import { useMemo } from 'react';
import { Hive, PIECES, PIECE_BY_NAME, hexToPixel, keyToHex, toKey } from '@hive/engine';
import type { RuleDiagram as Diagram } from '../game/rules';
import { Tile, hexPath } from './Tile';

const SIZE = 30;
const LIFT = 4;

interface Computed {
  stacks: { key: number; x: number; y: number; pieces: number[] }[];
  targets: { x: number; y: number; onTop: boolean }[];
  focus: { x: number; y: number } | null;
  also: { x: number; y: number }[];
  viewBox: string;
}

/** Builds the diagram from a real position: the engine decides which cells light up. */
export function computeDiagram(d: Diagram): Computed {
  const layout = d.layout.split(/\s+/).map((tok) => {
    const [piece, q, r] = tok.split(/[@,]/);
    return { piece, q: Number(q), r: Number(r) };
  });
  const game = Hive.fromLayout(layout, { mosquito: true, ladybug: true, pillbug: true, ply: d.ply ?? 20 });
  const at = (key: number) => hexToPixel(keyToHex(key), SIZE + 1.5);
  const cells = new Map<number, number[]>();
  for (const { piece, q, r } of layout) {
    const key = toKey(q, r);
    cells.set(key, [...(cells.get(key) ?? []), PIECE_BY_NAME.get(piece)!.id]);
  }
  const focusId = PIECE_BY_NAME.get(d.focus)!.id;
  const moves = d.blocked ? [] : game.legalMovesForPiece(focusId);
  const targetKeys = [...new Set(moves.flatMap((m) => (m.type === 'pass' ? [] : [m.to])))];
  const focusKey = game.positionOf(focusId);

  const stacks = [...cells].map(([key, pieces]) => ({ key, ...at(key), pieces })).sort((a, b) => a.y - b.y || a.x - b.x);
  const targets = targetKeys.map((key) => ({ ...at(key), onTop: cells.has(key) }));
  const lift = (key: number) => ((cells.get(key)?.length ?? 1) - 1) * LIFT;
  const focus = focusKey >= 0 ? { x: at(focusKey).x, y: at(focusKey).y - lift(focusKey) } : null;
  const also = (d.also ?? []).map((n) => {
    const key = game.positionOf(PIECE_BY_NAME.get(n)!.id);
    return { x: at(key).x, y: at(key).y - lift(key) };
  });

  const pts = [...stacks, ...targets];
  const pad = SIZE * 1.15;
  const minX = Math.min(...pts.map((p) => p.x)) - pad;
  const maxX = Math.max(...pts.map((p) => p.x)) + pad;
  const minY = Math.min(...pts.map((p) => p.y)) - pad;
  const maxY = Math.max(...pts.map((p) => p.y)) + pad;
  return { stacks, targets, focus, also, viewBox: `${minX.toFixed(1)} ${minY.toFixed(1)} ${(maxX - minX).toFixed(1)} ${(maxY - minY).toFixed(1)}` };
}

/** Plain SVG body (no hooks) so it can also be rendered to static files. */
export function DiagramSvg({ diagram, className }: { diagram: Diagram; className?: string }) {
  const c = computeDiagram(diagram);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={c.viewBox} className={className} role="img" aria-label="Exemplo de movimento">
      {c.stacks.map(({ key, x, y, pieces }) => (
        <g key={key}>
          {pieces.map((pid, level) => (
            <Tile key={pid} bug={PIECES[pid].bug} color={PIECES[pid].color} size={SIZE} x={x - level * LIFT * 0.4} y={y - level * LIFT} />
          ))}
        </g>
      ))}
      {c.also.map((p, i) => (
        <path key={i} d={hexPath(SIZE * 1.04)} transform={`translate(${p.x},${p.y})`} fill="none" stroke="#b5a693" strokeWidth={2} strokeDasharray="4 3" />
      ))}
      {c.focus && (
        <path
          d={hexPath(SIZE * 1.06)}
          transform={`translate(${c.focus.x},${c.focus.y})`}
          fill="none"
          stroke={diagram.blocked ? '#d2553f' : '#fff3d6'}
          strokeWidth={2.5}
        />
      )}
      {diagram.blocked && c.focus && (
        <path
          d={`M${c.focus.x - 9},${c.focus.y - 9}L${c.focus.x + 9},${c.focus.y + 9}M${c.focus.x + 9},${c.focus.y - 9}L${c.focus.x - 9},${c.focus.y + 9}`}
          stroke="#d2553f"
          strokeWidth={4}
          strokeLinecap="round"
        />
      )}
      {c.targets.map((t, i) => (
        <g key={`t${i}`} transform={`translate(${t.x},${t.y - (t.onTop ? LIFT : 0)})`}>
          <path d={hexPath(SIZE * 0.96)} fill="rgba(232,163,61,0.12)" stroke="#e8a33d" strokeWidth={1.8} />
          <circle r={SIZE * 0.17} fill="#e8a33d" />
        </g>
      ))}
    </svg>
  );
}

export function RuleDiagramView({ diagram, className }: { diagram: Diagram; className?: string }) {
  // Memoize by content: diagrams are static.
  return useMemo(() => <DiagramSvg diagram={diagram} className={className} />, [diagram, className]);
}
