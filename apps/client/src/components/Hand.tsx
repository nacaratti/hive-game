import { BUG_NAMES_PT, BUG_TYPES, PIECES, type Color, type Hive } from '@hive/engine';
import { TileIcon } from './Tile';
import type { Selection } from './Board';

interface HandProps {
  game: Hive;
  color: Color;
  /** Pieces this hand may place right now (legal placements exist). */
  placeable: Set<number>;
  selection: Selection;
  onPick: (piece: number) => void;
  onDragStart: (piece: number, e: React.PointerEvent) => void;
  orientation: 'vertical' | 'horizontal';
}

/** The pieces a player has not placed yet, grouped by bug type. */
export function Hand({ game, color, placeable, selection, onPick, onDragStart, orientation }: HandProps) {
  const hand = game.hand(color);
  const groups = BUG_TYPES.map((bug) => ({ bug, pieces: hand.filter((p) => PIECES[p].bug === bug) })).filter((g) => g.pieces.length);
  const vertical = orientation === 'vertical';

  return (
    <div
      className={`flex ${vertical ? 'flex-col items-center gap-1 py-2' : 'flex-row items-center gap-1 overflow-x-auto px-2'}`}
      aria-label={`Peças das ${color === 0 ? 'brancas' : 'pretas'}`}
    >
      {groups.length === 0 && <p className="px-2 text-xs text-muted">Todas em jogo</p>}
      {groups.map(({ bug, pieces }) => {
        const next = pieces[0];
        const active = placeable.has(next);
        const selected = selection?.source === 'hand' && selection.piece === next;
        return (
          <button
            key={bug}
            type="button"
            disabled={!active}
            onClick={() => onPick(next)}
            onPointerDown={(e) => active && onDragStart(next, e)}
            title={`${BUG_NAMES_PT[bug]} (${pieces.length})`}
            className={`relative shrink-0 touch-none rounded-lg p-0.5 transition-transform ${
              selected ? 'scale-110 bg-honey/25 ring-2 ring-honey' : active ? 'hover:scale-105' : ''
            }`}
          >
            <TileIcon bug={bug} color={color} size={vertical ? 50 : 44} dim={placeable.size > 0 && !active} />
            {pieces.length > 1 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1 text-[11px] font-bold text-table">
                {pieces.length}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
