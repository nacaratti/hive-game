import type { BugType } from '@hive/engine';

/** Traditional engraving colors of the physical game. */
export const BUG_COLORS: Record<BugType, string> = {
  Q: '#d9a21b',
  A: '#3b82c4',
  S: '#9a6232',
  B: '#8350b5',
  G: '#4e9a3a',
  M: '#8a909a',
  L: '#cf3a2e',
  P: '#2a9d9a',
};

interface GlyphProps {
  bug: BugType;
  /** Tile face color, used to cut details (stripes, spots) out of the glyph. */
  bg: string;
}

const leg = (d: string, w = 3.6) => <path d={d} fill="none" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />;

/** Insect drawn in a -50..50 box, head up. Inherits `fill`/`stroke` from the parent group. */
export function BugGlyph({ bug, bg }: GlyphProps) {
  switch (bug) {
    case 'Q':
      return (
        <g>
          <ellipse cx={-15} cy={-6} rx={14} ry={7.5} transform="rotate(-28 -15 -6)" opacity={0.42} />
          <ellipse cx={15} cy={-6} rx={14} ry={7.5} transform="rotate(28 15 -6)" opacity={0.42} />
          {leg('M-3 -24 Q-8 -34 -13 -35')}
          {leg('M3 -24 Q8 -34 13 -35')}
          <circle cy={-23} r={6.5} />
          <circle cy={-11} r={8.5} />
          <ellipse cy={11} rx={12} ry={17} />
          <path d="M-12 4h24M-11.5 13h23M-9 21h18" stroke={bg} strokeWidth={3.4} fill="none" />
          <path d="M-3 27 L0 35 L3 27Z" />
        </g>
      );
    case 'A':
      return (
        <g>
          {leg('M-3 -13 L-15 -22 L-21 -17')}
          {leg('M3 -13 L15 -22 L21 -17')}
          {leg('M-4 -9 L-19 -8 L-26 -1')}
          {leg('M4 -9 L19 -8 L26 -1')}
          {leg('M-3 -5 L-13 5 L-17 17')}
          {leg('M3 -5 L13 5 L17 17')}
          {leg('M-3 -29 Q-7 -38 -14 -39', 2.8)}
          {leg('M3 -29 Q7 -38 14 -39', 2.8)}
          <circle cy={-25} r={7} />
          <ellipse cy={-10} rx={5} ry={7.5} />
          <ellipse cy={13} rx={10} ry={14} />
        </g>
      );
    case 'S':
      return (
        <g>
          {leg('M-5 -15 L-19 -27 L-27 -20')}
          {leg('M5 -15 L19 -27 L27 -20')}
          {leg('M-6 -12 L-25 -16 L-33 -6')}
          {leg('M6 -12 L25 -16 L33 -6')}
          {leg('M-6 -9 L-23 -1 L-28 11')}
          {leg('M6 -9 L23 -1 L28 11')}
          {leg('M-5 -6 L-15 9 L-17 24')}
          {leg('M5 -6 L15 9 L17 24')}
          <circle cy={-12} r={8} />
          <circle cy={9} r={13.5} />
          <path d="M0 0v18M-6 6l6 4 6-4" stroke={bg} strokeWidth={2.6} fill="none" strokeLinecap="round" />
        </g>
      );
    case 'B':
      return (
        <g>
          {leg('M-10 -6 L-21 -14 L-24 -22')}
          {leg('M10 -6 L21 -14 L24 -22')}
          {leg('M-12 4 L-24 4 L-28 12')}
          {leg('M12 4 L24 4 L28 12')}
          {leg('M-10 14 L-20 24 L-21 32')}
          {leg('M10 14 L20 24 L21 32')}
          {leg('M-3 -27 Q-9 -33 -6 -38', 3)}
          {leg('M3 -27 Q9 -33 6 -38', 3)}
          <circle cy={-25} r={5.5} />
          <ellipse cy={-16} rx={11} ry={6.5} />
          <ellipse cy={7} rx={16.5} ry={21} />
          <path d="M0 -12v39" stroke={bg} strokeWidth={2.8} />
        </g>
      );
    case 'G':
      return (
        <g>
          {leg('M-3 -30 Q-12 -38 -20 -36', 2.4)}
          {leg('M3 -30 Q12 -38 20 -36', 2.4)}
          {leg('M-4 -14 L-13 -12 L-16 -4', 3)}
          {leg('M4 -14 L13 -12 L16 -4', 3)}
          {leg('M-5 4 L-17 -12 L-19 28', 4.4)}
          {leg('M5 4 L17 -12 L19 28', 4.4)}
          <circle cy={-25} r={6.5} />
          <ellipse cy={2} rx={7.5} ry={24} />
          <path d="M-5 4h10M-5 12h10M-4.5 20h9" stroke={bg} strokeWidth={2} />
        </g>
      );
    case 'M':
      return (
        <g>
          <ellipse cx={-12} cy={-2} rx={15} ry={5} transform="rotate(-24 -12 -2)" opacity={0.42} />
          <ellipse cx={12} cy={-2} rx={15} ry={5} transform="rotate(24 12 -2)" opacity={0.42} />
          {leg('M0 -22 L0 -39', 2.4)}
          {leg('M-3 -10 L-20 -22 L-30 -18', 2.4)}
          {leg('M3 -10 L20 -22 L30 -18', 2.4)}
          {leg('M-4 -7 L-24 -2 L-34 10', 2.4)}
          {leg('M4 -7 L24 -2 L34 10', 2.4)}
          {leg('M-3 -4 L-15 14 L-20 32', 2.4)}
          {leg('M3 -4 L15 14 L20 32', 2.4)}
          <circle cy={-19} r={4.5} />
          <circle cy={-9} r={6} />
          <ellipse cy={13} rx={4.5} ry={18} />
        </g>
      );
    case 'L':
      return (
        <g>
          {leg('M-15 -6 L-25 -12', 3.2)}
          {leg('M15 -6 L25 -12', 3.2)}
          {leg('M-18 6 L-28 7', 3.2)}
          {leg('M18 6 L28 7', 3.2)}
          {leg('M-14 18 L-22 26', 3.2)}
          {leg('M14 18 L22 26', 3.2)}
          <circle cy={-16} r={9} />
          <circle cy={5} r={20} />
          <path d="M0 -15v40" stroke={bg} strokeWidth={2.8} />
          <circle cx={-9} cy={-3} r={4} fill={bg} />
          <circle cx={9} cy={-3} r={4} fill={bg} />
          <circle cx={-10} cy={13} r={4.2} fill={bg} />
          <circle cx={10} cy={13} r={4.2} fill={bg} />
          <circle cx={-4} cy={-19} r={2.2} fill={bg} />
          <circle cx={4} cy={-19} r={2.2} fill={bg} />
        </g>
      );
    case 'P':
      return (
        <g>
          {leg('M-5 -24 Q-12 -32 -18 -31', 2.6)}
          {leg('M5 -24 Q12 -32 18 -31', 2.6)}
          {leg('M-15 -8 L-22 -10', 2.6)}
          {leg('M15 -8 L22 -10', 2.6)}
          {leg('M-16 4 L-23 4', 2.6)}
          {leg('M16 4 L23 4', 2.6)}
          {leg('M-14 16 L-21 19', 2.6)}
          {leg('M14 16 L21 19', 2.6)}
          <ellipse cy={1} rx={16} ry={25} />
          <path
            d="M-13 -12 Q0 -7 13 -12M-15.5 -3 Q0 2 15.5 -3M-15.5 6 Q0 11 15.5 6M-13.5 15 Q0 20 13.5 15"
            stroke={bg}
            strokeWidth={2.6}
            fill="none"
          />
        </g>
      );
  }
}
