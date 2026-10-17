import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BUG_NAMES_PT, PIECES, hexToKey, hexToPixel, keyToHex, pixelToHex, type Hive, type Move } from '@hive/engine';
import { Tile, hexPath } from './Tile';

export const HEX = 40;
const LIFT = 5;
const TILE = HEX * 0.96;

export type Selection = { piece: number; source: 'hand' | 'board' } | null;

export interface BoardHandle {
  /** Cell key under a viewport point, or null when outside the board. */
  keyAt: (clientX: number, clientY: number) => number | null;
  fit: () => void;
}

interface BoardProps {
  game: Hive;
  selection: Selection;
  /** Legal destinations of the selected piece. */
  targets: Map<number, Move>;
  /** Whether the local user may pick up this board piece now. */
  canPick: (piece: number) => boolean;
  onSelect: (sel: Selection) => void;
  onMove: (move: Move) => void;
  lastMove?: { from: number; to: number } | null;
  /** Fit the view again whenever this value changes (e.g. a new move). */
  fitKey?: unknown;
}

interface View {
  tx: number;
  ty: number;
  k: number;
}

type Press =
  | { mode: 'pending'; id: number; x0: number; y0: number; key: number | null }
  | { mode: 'pan'; id: number; lx: number; ly: number }
  | { mode: 'drag'; id: number; piece: number };

const world = (key: number) => hexToPixel(keyToHex(key), HEX);

export const Board = forwardRef<BoardHandle, BoardProps>(function Board(
  { game, selection, targets, canPick, onSelect, onMove, lastMove, fitKey },
  ref,
) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<View>({ tx: 400, ty: 300, k: 1 });
  const [auto, setAuto] = useState(true);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const press = useRef<Press | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; view: View; cx: number; cy: number } | null>(null);
  /** Touch has no hover: holding a finger on a stack shows its pieces. */
  const longPress = useRef<{ timer: number; fired: boolean } | null>(null);
  const cancelLongPress = () => {
    if (longPress.current) clearTimeout(longPress.current.timer);
  };

  const cells = useMemo(() => {
    const list = game.occupiedCells().map((key) => ({ key, stack: game.stackAt(key)!, ...world(key) }));
    return list.sort((a, b) => a.y - b.y || a.x - b.x);
  }, [game, game.ply]);

  // ------------------------------------------------------------ view fitting

  const fitView = useCallback((): View => {
    const keys = [...cells.map((c) => c.key), ...targets.keys()];
    const pts = keys.length ? keys.map(world) : [{ x: 0, y: 0 }];
    const minX = Math.min(...pts.map((p) => p.x)) - HEX * 2.2;
    const maxX = Math.max(...pts.map((p) => p.x)) + HEX * 2.2;
    const minY = Math.min(...pts.map((p) => p.y)) - HEX * 2.2;
    const maxY = Math.max(...pts.map((p) => p.y)) + HEX * 2.2;
    const k = Math.max(0.3, Math.min(1.2, size.w / (maxX - minX), size.h / (maxY - minY)));
    return { k, tx: size.w / 2 - ((minX + maxX) / 2) * k, ty: size.h / 2 - ((minY + maxY) / 2) * k };
  }, [cells, targets, size]);

  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (auto) setView(fitView());
    // Only refit on board changes, not on every selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, size, cells, fitKey]);

  useImperativeHandle(ref, () => ({
    keyAt: (clientX, clientY) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
      return hexToKey(pixelToHex((clientX - rect.left - view.tx) / view.k, (clientY - rect.top - view.ty) / view.k, HEX));
    },
    fit: () => {
      setAuto(true);
      setView(fitView());
    },
  }));

  const toWorld = (clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left - view.tx) / view.k, y: (clientY - rect.top - view.ty) / view.k };
  };

  const zoomAt = (cx: number, cy: number, factor: number, base: View = view): View => {
    const k = Math.max(0.25, Math.min(2.5, base.k * factor));
    const f = k / base.k;
    return { k, tx: cx - (cx - base.tx) * f, ty: cy - (cy - base.ty) * f };
  };

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      setAuto(false);
      setView((v) => zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0015), v));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  // ------------------------------------------------------------ interaction

  const keyFromEvent = (e: React.PointerEvent): number | null => {
    const hit = (e.target as Element).closest('[data-key]');
    if (hit) return Number(hit.getAttribute('data-key'));
    const w = toWorld(e.clientX, e.clientY);
    return hexToKey(pixelToHex(w.x, w.y, HEX));
  };

  const clickCell = (key: number | null) => {
    if (key !== null && targets.has(key)) return onMove(targets.get(key)!);
    const top = key !== null ? game.topAt(key) : -1;
    if (top >= 0 && canPick(top)) return onSelect(selection?.piece === top ? null : { piece: top, source: 'board' });
    onSelect(null);
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const rect = e.currentTarget.getBoundingClientRect();
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), view, cx: (a.x + b.x) / 2 - rect.left, cy: (a.y + b.y) / 2 - rect.top };
      press.current = null;
      setGhost(null);
      return;
    }
    const key = keyFromEvent(e);
    press.current = { mode: 'pending', id: e.pointerId, x0: e.clientX, y0: e.clientY, key };
    cancelLongPress();
    if (e.pointerType !== 'mouse' && key !== null && (game.stackAt(key)?.length ?? 0) > 1) {
      const state = { fired: false, timer: 0 };
      state.timer = window.setTimeout(() => {
        state.fired = true;
        setHover(key);
      }, 450);
      longPress.current = state;
    } else {
      longPress.current = null;
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const p = pinch.current;
      setAuto(false);
      setView(zoomAt(p.cx, p.cy, Math.hypot(a.x - b.x, a.y - b.y) / p.d, p.view));
      return;
    }
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    if (p.mode === 'pending') {
      if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 6) return;
      cancelLongPress();
      const top = p.key !== null ? game.topAt(p.key) : -1;
      if (top >= 0 && canPick(top)) {
        if (selection?.piece !== top) onSelect({ piece: top, source: 'board' });
        press.current = { mode: 'drag', id: p.id, piece: top };
      } else {
        press.current = { mode: 'pan', id: p.id, lx: e.clientX, ly: e.clientY };
        setAuto(false);
      }
      return;
    }
    if (p.mode === 'pan') {
      const dx = e.clientX - p.lx;
      const dy = e.clientY - p.ly;
      press.current = { ...p, lx: e.clientX, ly: e.clientY };
      setView((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }));
    } else {
      setGhost(toWorld(e.clientX, e.clientY));
    }
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const p = press.current;
    press.current = null;
    if (!p || p.id !== e.pointerId) return;
    cancelLongPress();
    if (longPress.current?.fired) {
      // The finger was showing the stack, not selecting it.
      longPress.current = null;
      setHover(null);
      return;
    }
    if (p.mode === 'pending') clickCell(p.key);
    else if (p.mode === 'drag') {
      setGhost(null);
      const w = toWorld(e.clientX, e.clientY);
      const key = hexToKey(pixelToHex(w.x, w.y, HEX));
      if (targets.has(key)) onMove(targets.get(key)!);
    }
  };

  const onPointerCancel = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    press.current = null;
    pinch.current = null;
    cancelLongPress();
    setGhost(null);
  };

  // --------------------------------------------------------------- render

  const dragging = ghost && selection?.source === 'board' ? selection.piece : -1;
  const hoverStack = hover !== null ? game.stackAt(hover) : undefined;
  const hoverPos = hover !== null ? world(hover) : null;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <svg
        ref={svgRef}
        className="h-full w-full touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={() => setHover(null)}
        role="application"
        aria-label="Tabuleiro"
      >
        <g transform={`translate(${view.tx},${view.ty}) scale(${view.k})`}>
          {lastMove && lastMove.from >= 0 && (
            <path
              d={hexPath(TILE)}
              transform={`translate(${world(lastMove.from).x},${world(lastMove.from).y})`}
              fill="none"
              stroke="#e8a33d"
              strokeOpacity={0.5}
              strokeWidth={2}
              strokeDasharray="6 5"
            />
          )}

          {cells.map(({ key, stack, x, y }) => {
            const levels = stack.length;
            return (
              <g
                key={key}
                data-key={key}
                onPointerEnter={() => setHover(levels > 1 ? key : null)}
                onPointerLeave={() => setHover((h) => (h === key ? null : h))}
                className={canPick(stack[levels - 1]) ? 'cursor-grab' : undefined}
              >
                {stack.map((pid, level) => {
                  const info = PIECES[pid];
                  const isTop = level === levels - 1;
                  const lifted = selection?.piece === pid && isTop ? 4 : 0;
                  return (
                    <g key={pid} opacity={pid === dragging ? 0.3 : 1}>
                      <Tile bug={info.bug} color={info.color} size={TILE} x={x - level * LIFT * 0.4} y={y - level * LIFT - lifted} />
                    </g>
                  );
                })}
                {levels > 1 && (
                  <g transform={`translate(${x + HEX * 0.52},${y - HEX * 0.62 - (levels - 1) * LIFT})`}>
                    <circle r={9} fill="#e8a33d" stroke="#2a211b" strokeWidth={2} />
                    <text textAnchor="middle" dy={4} fontSize={12} fontWeight={700} fill="#2a211b">
                      {levels}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {lastMove && lastMove.to >= 0 && (
            <path
              d={hexPath(TILE * 1.02)}
              transform={`translate(${world(lastMove.to).x},${world(lastMove.to).y - ((game.stackAt(lastMove.to)?.length ?? 1) - 1) * LIFT})`}
              fill="none"
              stroke="#e8a33d"
              strokeOpacity={0.85}
              strokeWidth={2.5}
              pointerEvents="none"
            />
          )}

          {selection?.source === 'board' && game.positionOf(selection.piece) >= 0 && (
            <path
              d={hexPath(TILE * 1.04)}
              transform={`translate(${world(game.positionOf(selection.piece)).x},${world(game.positionOf(selection.piece)).y - ((game.stackAt(game.positionOf(selection.piece))?.length ?? 1) - 1) * LIFT - 4})`}
              fill="none"
              stroke="#fff3d6"
              strokeWidth={3}
              pointerEvents="none"
            />
          )}

          {[...targets.keys()].map((key) => {
            const { x, y } = world(key);
            const h = game.stackAt(key)?.length ?? 0;
            return (
              <g key={`t${key}`} data-key={key} transform={`translate(${x},${y - Math.max(0, h) * LIFT})`} className="cursor-pointer">
                <path d={hexPath(TILE * 0.98)} fill={h ? 'rgba(232,163,61,0.18)' : 'rgba(232,163,61,0.10)'} stroke="#e8a33d" strokeWidth={2} />
                <circle r={HEX * 0.16} fill="#e8a33d" className="target-pulse" />
              </g>
            );
          })}

          {ghost && dragging >= 0 && (
            <g pointerEvents="none" opacity={0.92}>
              <Tile bug={PIECES[dragging].bug} color={PIECES[dragging].color} size={TILE} x={ghost.x} y={ghost.y - 6} />
            </g>
          )}
        </g>
      </svg>

      {hoverStack && hoverPos && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-line bg-panel/95 px-3 py-2 text-xs shadow-lg"
          style={{ left: hoverPos.x * view.k + view.tx + HEX * view.k, top: hoverPos.y * view.k + view.ty - HEX * view.k }}
        >
          <p className="mb-1 font-bold text-ink">Pilha de {hoverStack.length}</p>
          <ol className="flex flex-col-reverse gap-0.5 text-muted">
            {hoverStack.map((pid, i) => (
              <li key={pid}>
                {i === hoverStack.length - 1 ? 'Topo: ' : i === 0 ? 'Base: ' : ''}
                {BUG_NAMES_PT[PIECES[pid].bug]} {PIECES[pid].color === 0 ? 'branca' : 'preta'}
              </li>
            ))}
          </ol>
        </div>
      )}

      {!auto && (
        <button
          type="button"
          onClick={() => {
            setAuto(true);
          }}
          className="absolute bottom-3 right-3 rounded-md border border-line bg-panel/90 px-3 py-1.5 text-sm text-ink hover:bg-panel-hi"
        >
          Centralizar
        </button>
      )}
    </div>
  );
});
