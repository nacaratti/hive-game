import { BUG_NAMES_PT, type BugType, type Color } from '@hive/engine';
import { BUG_COLORS, BugGlyph } from '../lib/bugs';

export const TILE_FACE: Record<Color, string> = { 0: '#ede6d6', 1: '#2b2623' };
const TILE_EDGE: Record<Color, string> = { 0: '#bfb39b', 1: '#121010' };
const TILE_RIM: Record<Color, string> = { 0: '#fffaf0', 1: '#4a423c' };

/** Pointy-top hexagon path with rounded corners, centered on 0,0. */
export const hexPath = (size: number, round = size * 0.14): string => {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 90);
    return [size * Math.cos(a), size * Math.sin(a)] as const;
  });
  const t = round / size;
  let d = '';
  pts.forEach((p, i) => {
    const prev = pts[(i + 5) % 6];
    const next = pts[(i + 1) % 6];
    const a = [p[0] + (prev[0] - p[0]) * t, p[1] + (prev[1] - p[1]) * t];
    const b = [p[0] + (next[0] - p[0]) * t, p[1] + (next[1] - p[1]) * t];
    d += `${i === 0 ? 'M' : 'L'}${a[0].toFixed(2)},${a[1].toFixed(2)}Q${p[0].toFixed(2)},${p[1].toFixed(2)} ${b[0].toFixed(2)},${b[1].toFixed(2)}`;
  });
  return d + 'Z';
};

interface TileProps {
  bug: BugType;
  color: Color;
  /** Circumradius in SVG units. */
  size: number;
  x?: number;
  y?: number;
  dim?: boolean;
}

/** A bakelite tile with an engraved insect, as an SVG group. */
export function Tile({ bug, color, size, x = 0, y = 0, dim }: TileProps) {
  const face = TILE_FACE[color];
  const glyphScale = (size * 0.98) / 50;
  return (
    <g transform={`translate(${x},${y})`} opacity={dim ? 0.45 : 1}>
      <path d={hexPath(size)} transform={`translate(${size * 0.06},${size * 0.11})`} fill="rgba(0,0,0,0.38)" />
      <path d={hexPath(size)} fill={TILE_EDGE[color]} />
      <path d={hexPath(size * 0.9)} transform={`translate(0,${-size * 0.04})`} fill={face} stroke={TILE_RIM[color]} strokeWidth={size * 0.03} />
      <g
        transform={`translate(0,${-size * 0.04}) scale(${glyphScale})`}
        fill={BUG_COLORS[bug]}
        stroke={BUG_COLORS[bug]}
      >
        <BugGlyph bug={bug} bg={face} />
      </g>
    </g>
  );
}

/** Standalone tile icon (hand, menus, legends). */
export function TileIcon({ bug, color, size = 44, dim, title }: { bug: BugType; color: Color; size?: number; dim?: boolean; title?: string }) {
  const r = 46;
  return (
    <svg width={size} height={size * 1.08} viewBox="-52 -54 106 114" role="img" aria-label={title ?? BUG_NAMES_PT[bug]}>
      <Tile bug={bug} color={color} size={r} dim={dim} />
    </svg>
  );
}
