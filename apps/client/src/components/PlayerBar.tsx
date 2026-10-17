import { useEffect, useState } from 'react';
import type { Color, Hive } from '@hive/engine';
import type { ClockState } from '@hive/protocol';
import { TileIcon } from './Tile';

export interface SeatInfo {
  name: string;
  connected?: boolean;
  isMe?: boolean;
  isBot?: boolean;
}

const formatClock = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

function useClock(clock: ClockState | null, receivedAt: number) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!clock?.running) return;
    const id = setInterval(() => tick((n) => n + 1), 200);
    return () => clearInterval(id);
  }, [clock]);
  if (!clock) return null;
  const elapsed = Date.now() - receivedAt;
  return {
    white: clock.running === 'white' ? clock.white - elapsed : clock.white,
    black: clock.running === 'black' ? clock.black - elapsed : clock.black,
  };
}

export const statusText = (game: Hive, seats: Record<'white' | 'black', SeatInfo>, endReason?: string | null): string => {
  const name = (c: Color) => seats[c === 0 ? 'white' : 'black'].name;
  if (game.result === 'Draw' || endReason === 'agreement') return endReason === 'agreement' ? 'Empate por acordo' : 'Empate: as duas rainhas foram cercadas';
  if (game.result === 'WhiteWins' || game.result === 'BlackWins') return `${name(game.result === 'WhiteWins' ? 0 : 1)} venceu`;
  const turn = seats[game.turnColor === 0 ? 'white' : 'black'];
  return turn.isMe ? 'Sua vez' : `Vez de ${turn.name}`;
};

interface PlayerBarProps {
  game: Hive;
  seats: Record<'white' | 'black', SeatInfo>;
  clock?: ClockState | null;
  clockAt?: number;
  status: string;
  actions?: React.ReactNode;
}

export function PlayerBar({ game, seats, clock = null, clockAt = 0, status, actions }: PlayerBarProps) {
  const times = useClock(clock, clockAt);
  const chip = (color: Color) => {
    const key = color === 0 ? 'white' : 'black';
    const seat = seats[key];
    const active = !game.isOver && game.turnColor === color;
    const t = times?.[key];
    return (
      <div className={`flex min-w-0 items-center gap-2 rounded-lg px-2 py-1 ${active ? 'bg-honey/15 ring-1 ring-honey/70' : ''} ${color === 1 ? 'flex-row-reverse text-right' : ''}`}>
        <TileIcon bug="Q" color={color} size={30} />
        <div className="min-w-0">
          <p className="truncate font-bold leading-tight">
            {seat.name}
            {seat.isMe && seat.name !== 'Você' && <span className="ml-1 text-xs font-normal text-muted">(você)</span>}
          </p>
          <p className="text-xs text-muted">
            {seat.connected === false ? <span className="text-danger">desconectado</span> : seat.isBot ? 'computador' : color === 0 ? 'brancas' : 'pretas'}
          </p>
        </div>
        {t !== undefined && (
          <span
            className={`ml-1 rounded-md px-2 py-0.5 font-display text-lg tabular-nums ${
              active ? (t < 20_000 ? 'bg-danger text-ink' : 'bg-ink text-table') : 'bg-table-deep text-muted'
            }`}
          >
            {formatClock(t)}
          </span>
        )}
      </div>
    );
  };

  return (
    <>
    <header className="flex items-center gap-2 border-b border-line/60 bg-table-deep/60 px-2 py-1.5">
      <div className="flex min-w-0 flex-1 justify-start">{chip(0)}</div>
      <div className="hidden shrink-0 flex-col items-center sm:flex">
        <p className="font-display text-base font-semibold">{status}</p>
        <p className="text-xs text-muted">Rodada {Math.max(1, game.turnNumber)}</p>
      </div>
      <div className="flex min-w-0 flex-1 justify-end">{chip(1)}</div>
      {actions}
    </header>
    <p className="border-b border-line/60 bg-table-deep/40 py-1 text-center font-display text-sm font-semibold sm:hidden">{status}</p>
    </>
  );
}
