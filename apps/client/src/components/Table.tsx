import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PIECES, type Color, type Hive, type Move } from '@hive/engine';
import { tapFeedback } from '../lib/mobile';
import { playTock } from '../lib/sound';
import { Board, type BoardHandle, type Selection } from './Board';
import { Hand } from './Hand';
import { TileIcon } from './Tile';

interface TableProps {
  game: Hive;
  /** Colors the local user is allowed to play. */
  controls: Color[];
  /** Block input (reviewing history, waiting for the server...). */
  frozen?: boolean;
  onMove: (move: Move) => void;
  header: ReactNode;
  side?: ReactNode;
  overlay?: ReactNode;
  /** Label of the button that opens the side panel on small screens. */
  sideLabel?: string;
}

/** Board + both hands + side panel. Shared by online and local games. */
export function Table({ game, controls, frozen, onMove, header, side, overlay, sideLabel = 'Lances e chat' }: TableProps) {
  const boardRef = useRef<BoardHandle>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [handDrag, setHandDrag] = useState<{ piece: number; x: number; y: number; moved: boolean } | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const myTurn = !frozen && !game.isOver && controls.includes(game.turnColor);
  const legal = myTurn ? game.legalMoves() : [];
  const mustPass = myTurn && legal.length === 1 && legal[0].type === 'pass';

  const placeable = useMemo(() => new Set(legal.flatMap((m) => (m.type === 'place' ? [m.piece] : []))), [legal]);

  const targets = useMemo(() => {
    const map = new Map<number, Move>();
    if (!selection || !myTurn) return map;
    for (const m of game.legalMovesForPiece(selection.piece)) {
      if (m.type === 'pass') continue;
      if ((selection.source === 'hand') === (m.type === 'place')) map.set(m.to, m);
    }
    return map;
  }, [selection, myTurn, game, game.ply]);

  const lastMove = useMemo(() => {
    const lm = game.lastMove;
    if (!lm || lm.move.type === 'pass') return null;
    return { from: lm.from, to: lm.move.to };
  }, [game, game.ply]);

  const prevPly = useRef(game.ply);
  useEffect(() => {
    setSelection(null);
    if (game.ply > prevPly.current) {
      playTock(game.isOver ? 'end' : game.lastMove?.move.type === 'move' ? 'move' : 'place');
      tapFeedback(game.isOver);
    }
    prevPly.current = game.ply;
  }, [game, game.ply, game.isOver]);

  useEffect(() => {
    if (!myTurn) setSelection(null);
  }, [myTurn]);

  // Escape clears the selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelection(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const submit = (m: Move) => {
    setSelection(null);
    onMove(m);
  };

  const canPick = (piece: number) => myTurn && game.positionOf(piece) >= 0 && game.legalMovesForPiece(piece).length > 0;

  const startHandDrag = (piece: number, e: React.PointerEvent) => {
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
      if (!moved) setSelection({ piece, source: 'hand' });
      moved = true;
      setHandDrag({ piece, x: ev.clientX, y: ev.clientY, moved });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setHandDrag(null);
      if (!moved) return;
      const key = boardRef.current?.keyAt(ev.clientX, ev.clientY);
      if (key === null || key === undefined) return;
      const m = game.legalMovesForPiece(piece).find((mv) => mv.type === 'place' && mv.to === key);
      if (m) submit(m);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const pickFromHand = (piece: number) =>
    setSelection((s) => (s?.source === 'hand' && s.piece === piece ? null : { piece, source: 'hand' }));

  const hand = (color: Color, orientation: 'vertical' | 'horizontal') => (
    <Hand
      game={game}
      color={color}
      placeable={controls.includes(color) ? placeable : new Set()}
      selection={selection}
      onPick={pickFromHand}
      onDragStart={startHandDrag}
      orientation={orientation}
    />
  );

  // Put the local player's hand at the bottom on narrow screens.
  const bottomColor: Color = controls.length === 1 ? controls[0] : game.turnColor;

  return (
    <div className="flex h-full flex-col">
      {header}
      <div className="md:hidden border-b border-line/60 bg-table-deep/40">{hand(bottomColor === 0 ? 1 : 0, 'horizontal')}</div>
      <div className="relative flex min-h-0 flex-1">
        <aside className="hidden w-[76px] shrink-0 overflow-y-auto border-r border-line/60 bg-table-deep/40 md:block">{hand(0, 'vertical')}</aside>
        <main className="relative min-w-0 flex-1">
          <Board
            ref={boardRef}
            game={game}
            selection={selection}
            targets={targets}
            canPick={canPick}
            onSelect={setSelection}
            onMove={submit}
            lastMove={lastMove}
          />
          {mustPass && (
            <div className="absolute inset-x-0 top-4 mx-auto flex w-fit items-center gap-3 rounded-lg border border-honey/60 bg-panel px-4 py-2 shadow-xl">
              <span>Nenhum lance possível.</span>
              <button type="button" onClick={() => submit({ type: 'pass' })} className="rounded-md bg-honey px-3 py-1 font-bold text-table">
                Passar a vez
              </button>
            </div>
          )}
          {overlay}
          {side && (
            <button
              type="button"
              onClick={() => setPanelOpen((o) => !o)}
              className="absolute right-3 top-3 rounded-md border border-line bg-panel/90 px-3 py-1.5 text-sm lg:hidden"
            >
              {panelOpen ? 'Fechar' : sideLabel}
            </button>
          )}
        </main>
        <aside className="hidden w-[76px] shrink-0 overflow-y-auto border-l border-line/60 bg-table-deep/40 md:block">{hand(1, 'vertical')}</aside>
        {side && (
          <section
            className={`${panelOpen ? 'flex' : 'hidden'} absolute inset-y-0 right-0 z-20 w-80 max-w-[90vw] flex-col border-l border-line bg-panel shadow-2xl lg:static lg:flex lg:shadow-none`}
          >
            {side}
          </section>
        )}
      </div>
      <div className="md:hidden border-t border-line/60 bg-table-deep/40">{hand(bottomColor, 'horizontal')}</div>

      {handDrag?.moved && (
        <div className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2" style={{ left: handDrag.x, top: handDrag.y }}>
          <TileIcon bug={PIECES[handDrag.piece].bug} color={PIECES[handDrag.piece].color} size={60} />
        </div>
      )}
    </div>
  );
}
