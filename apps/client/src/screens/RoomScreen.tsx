import { useEffect, useMemo, useState } from 'react';
import { Hive, type Color, type Move } from '@hive/engine';
import { BOT_LEVELS } from '@hive/ai';
import type { BotLevel, RoomSettings, RoomState } from '@hive/protocol';
import { QR } from '../components/HostPanel';
import { PlayerBar, statusText, type SeatInfo } from '../components/PlayerBar';
import { SettingsForm, describeTime } from '../components/SettingsForm';
import { Chat, MoveList, Tabs } from '../components/SidePanel';
import { Table } from '../components/Table';
import { TileIcon } from '../components/Tile';
import { movesOf, positionAt } from '../game/replay';
import { copyText, useShareBase } from '../lib/desktop';
import { btn } from '../lib/ui';
import { send, useNet } from '../net/store';

export function RoomScreen({ room }: { room: RoomState }) {
  const [setup, setSetup] = useState(false);
  useEffect(() => {
    if (room.status === 'playing') setSetup(false);
  }, [room.status]);
  if (room.status === 'waiting' || setup || !room.game) return <WaitingRoom room={room} />;
  return <OnlineGame room={room} onSetup={() => setSetup(true)} />;
}

// ------------------------------------------------------------------- waiting

function WaitingRoom({ room }: { room: RoomState }) {
  const me = useNet((s) => s.playerId);
  const isHost = room.hostId === me;
  const mySeat = room.seats.white?.id === me ? 'white' : room.seats.black?.id === me ? 'black' : null;
  const invite = `${useShareBase()}/?sala=${room.id}`;
  const [copied, setCopied] = useState(false);
  const canStart = isHost && room.seats.white && room.seats.black && room.status !== 'playing';

  const updateSettings = (s: RoomSettings) => send('room:settings', { ...s, password: undefined });

  const seatCard = (seat: 'white' | 'black') => {
    const p = room.seats[seat];
    const color: Color = seat === 'white' ? 0 : 1;
    return (
      <div className="flex items-center gap-3 rounded-xl border border-line/70 bg-panel/70 p-4">
        <TileIcon bug="Q" color={color} size={52} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted">{seat === 'white' ? 'Brancas (começam)' : 'Pretas'}</p>
          {p ? (
            <p className="truncate text-lg font-bold">
              {p.name} {p.id === me && <span className="text-sm font-normal text-muted">(você)</span>}
              {!p.connected && <span className="ml-1 text-sm font-normal text-danger">desconectado</span>}
            </p>
          ) : (
            <p className="text-lg text-muted">Lugar livre</p>
          )}
        </div>
        {!p && (
          <div className="flex flex-col items-end gap-1.5">
            <button type="button" className={btn.secondary} onClick={() => send('room:seat', seat)}>
              Sentar aqui
            </button>
            {isHost && (
              <select
                aria-label="Colocar o computador neste lugar"
                value=""
                onChange={(e) => e.target.value && send('room:bot', { seat, level: e.target.value as BotLevel })}
                className="rounded-md border border-line bg-table-deep px-2 py-1 text-xs text-muted outline-none focus:border-honey"
              >
                <option value="">Colocar o computador…</option>
                {BOT_LEVELS.map((l) => (
                  <option key={l.id} value={l.id}>
                    Computador {l.label.toLowerCase()}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        {p && p.id === me && (
          <button type="button" className={btn.ghost} onClick={() => send('room:seat', 'spectator')}>
            Levantar
          </button>
        )}
        {p && isHost && p.id !== me && (
          <button type="button" className={btn.ghost} onClick={() => send('room:kick', p.id)} title="Remover da sala">
            Remover
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto grid min-h-full max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-5">
        <header className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-3xl font-bold">{room.name}</h1>
            <p className="text-sm text-muted">
              {isHost ? 'Você é o anfitrião desta sala.' : `Anfitrião: ${[room.seats.white, room.seats.black, ...room.spectators].find((p) => p?.id === room.hostId)?.name ?? '—'}`}
              {room.hasPassword && ' Sala com senha.'}
            </p>
          </div>
          <button type="button" className={btn.ghost} onClick={() => send('room:leave')}>
            Sair da sala
          </button>
        </header>

        <div className="grid gap-3 sm:grid-cols-2">
          {seatCard('white')}
          {seatCard('black')}
        </div>

        {room.spectators.length > 0 && (
          <p className="text-sm text-muted">
            Assistindo: <span className="text-ink">{room.spectators.map((s) => s.name).join(', ')}</span>
          </p>
        )}

        <div className="grid gap-5 md:grid-cols-[1fr_auto]">
          <div className="rounded-xl border border-line/70 bg-panel/70 p-4">
            <h2 className="mb-3 font-display text-lg font-semibold">Regras da partida</h2>
            {isHost ? (
              <SettingsForm value={{ ...room.settings }} onChange={updateSettings} showName={false} showPassword={false} />
            ) : (
              <ul className="space-y-1 text-sm">
                <li>
                  Expansões:{' '}
                  {[room.settings.expansions.mosquito && 'Mosquito', room.settings.expansions.ladybug && 'Joaninha', room.settings.expansions.pillbug && 'Tatuzinho']
                    .filter(Boolean)
                    .join(', ') || 'nenhuma'}
                </li>
                <li>Relógio: {describeTime(room.settings.timeControl)}</li>
                <li>Cores: {room.settings.randomColors ? 'sorteadas no início' : 'escolhidas pelos lugares'}</li>
              </ul>
            )}
          </div>
          <div className="flex flex-col items-center gap-2 rounded-xl border border-line/70 bg-panel/70 p-4 md:w-56">
            <h2 className="self-start font-display text-lg font-semibold">Convite</h2>
            <QR text={invite} size={160} />
            <button
              type="button"
              className={`${btn.secondary} w-full text-sm`}
              onClick={() => {
                copyText(invite).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              {copied ? 'Link copiado' : 'Copiar link'}
            </button>
            <p className="break-all text-center font-mono text-[11px] text-muted">{invite}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          {!canStart && <p className="text-sm text-muted">{isHost ? 'Aguardando os dois lugares serem ocupados.' : 'O anfitrião inicia a partida.'}</p>}
          {isHost && (
            <button type="button" className={`${btn.primary} px-6 py-3 text-lg`} disabled={!canStart} onClick={() => send('room:start')}>
              Iniciar partida
            </button>
          )}
          {!isHost && mySeat === null && <span className="text-sm text-muted">Você está assistindo.</span>}
        </div>
      </div>

      <aside className="flex h-[70vh] min-h-80 flex-col overflow-hidden rounded-xl border border-line/70 bg-panel/70 lg:h-auto">
        <h2 className="border-b border-line/60 px-3 py-2 font-display font-semibold">Conversa</h2>
        <Chat messages={room.chat} myId={me} onSend={(text) => send('chat:send', { text })} />
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------- game

function OnlineGame({ room, onSetup }: { room: RoomState; onSetup: () => void }) {
  const { playerId: me, roomAt } = useNet();
  const view = room.game!;
  const live = useMemo(() => Hive.fromGameString(view.gameString), [view.gameString]);
  const moves = useMemo(() => movesOf(view.gameString), [view.gameString]);
  const [reviewPly, setReviewPly] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setPending(false);
  }, [view.gameString]);
  useEffect(() => {
    if (room.status === 'playing') setDismissed(false);
  }, [room.status]);

  const shown = useMemo(() => (reviewPly === null ? live : positionAt(view.gameString, reviewPly)), [live, reviewPly, view.gameString]);
  const mySeat = room.seats.white?.id === me ? 'white' : room.seats.black?.id === me ? 'black' : null;
  const myColor: Color | null = mySeat === 'white' ? 0 : mySeat === 'black' ? 1 : null;
  const playing = room.status === 'playing';
  const over = room.status === 'finished';

  const seats: Record<'white' | 'black', SeatInfo> = {
    white: { name: room.seats.white?.name ?? '—', connected: room.seats.white?.connected, isMe: mySeat === 'white', isBot: room.seats.white?.isBot },
    black: { name: room.seats.black?.name ?? '—', connected: room.seats.black?.connected, isMe: mySeat === 'black', isBot: room.seats.black?.isBot },
  };

  const status = over ? endText(view.result, view.endReason, seats) : statusText(live, seats);

  const onMove = async (m: Move) => {
    setPending(true);
    const res = await send('game:move', { move: live.moveToString(m), ply: live.ply });
    if (!res.ok) setPending(false);
  };

  const opponentOffered = playing && view.drawOfferBy && mySeat && view.drawOfferBy !== mySeat;

  const actions = mySeat && playing && (
    <div className="ml-1 flex items-center gap-0.5 text-sm">
      <button
        type="button"
        className={btn.ghost}
        disabled={!!view.drawOfferBy}
        onClick={() => send('game:draw', 'offer')}
        title="Propor empate"
      >
        {view.drawOfferBy === mySeat ? 'Empate proposto' : 'Empate'}
      </button>
      <button type="button" className={btn.ghost} onClick={() => setConfirmResign(true)}>
        Desistir
      </button>
    </div>
  );

  const side = (
    <Tabs
      tabs={[
        { id: 'moves', label: 'Lances', content: <MoveList moves={moves} reviewPly={reviewPly} onReview={setReviewPly} /> },
        { id: 'chat', label: 'Conversa', content: <Chat messages={room.chat} myId={me} onSend={(text) => send('chat:send', { text })} /> },
      ]}
    />
  );

  const overlay = (
    <>
      {opponentOffered && (
        <div className="absolute inset-x-0 top-4 mx-auto flex w-fit items-center gap-2 rounded-lg border border-honey/60 bg-panel px-4 py-2 shadow-xl">
          <span>Seu oponente propõe empate.</span>
          <button type="button" className={btn.primary} onClick={() => send('game:draw', 'accept')}>
            Aceitar
          </button>
          <button type="button" className={btn.ghost} onClick={() => send('game:draw', 'decline')}>
            Recusar
          </button>
        </div>
      )}
      {confirmResign && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/50">
          <div className="rounded-xl border border-line bg-panel p-5 text-center shadow-2xl">
            <p className="mb-4 font-display text-lg">Desistir desta partida?</p>
            <div className="flex justify-center gap-2">
              <button type="button" className={btn.ghost} onClick={() => setConfirmResign(false)}>
                Continuar jogando
              </button>
              <button
                type="button"
                className={btn.danger}
                onClick={() => {
                  setConfirmResign(false);
                  send('game:resign');
                }}
              >
                Desistir
              </button>
            </div>
          </div>
        </div>
      )}
      {over && !dismissed && (
        <div className="absolute inset-x-0 bottom-6 z-20 mx-auto w-[min(26rem,calc(100%-2rem))] rounded-xl border border-honey/70 bg-panel p-5 text-center shadow-2xl">
          <p className="font-display text-2xl font-bold">{status}</p>
          <p className="mt-1 text-sm text-muted">{reasonText(view.endReason)}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {mySeat && (
              <button type="button" className={btn.primary} disabled={view.rematchBy.includes(mySeat)} onClick={() => send('game:rematch')}>
                {view.rematchBy.includes(mySeat) ? 'Aguardando oponente' : view.rematchBy.length ? 'Aceitar revanche' : 'Revanche'}
              </button>
            )}
            <button type="button" className={btn.secondary} onClick={() => setDismissed(true)}>
              Ver tabuleiro
            </button>
            <button type="button" className={btn.ghost} onClick={onSetup}>
              Voltar à sala
            </button>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="h-full">
      <Table
        game={shown}
        controls={myColor !== null && playing ? [myColor] : []}
        frozen={pending || reviewPly !== null}
        onMove={onMove}
        header={
          <PlayerBar
            game={shown}
            seats={seats}
            clock={view.clock}
            clockAt={roomAt}
            status={reviewPly !== null ? `Revendo lance ${reviewPly}` : status}
            actions={
              <>
                {actions}
                <button type="button" className={`${btn.ghost} ml-1`} onClick={() => send('room:leave')} title="Sair da sala">
                  Sair
                </button>
              </>
            }
          />
        }
        side={side}
        overlay={overlay}
      />
    </div>
  );
}

const endText = (result: string, reason: string | null, seats: Record<'white' | 'black', SeatInfo>) => {
  if (result === 'Draw') return 'Empate';
  const winner = result === 'WhiteWins' ? seats.white : seats.black;
  return winner.isMe ? 'Você venceu!' : `${winner.name} venceu`;
};

const reasonText = (reason: string | null) =>
  ({
    queen: 'A rainha foi cercada.',
    draw: 'As duas rainhas foram cercadas ao mesmo tempo.',
    resign: 'Desistência.',
    timeout: 'O tempo acabou.',
    agreement: 'Empate combinado entre os jogadores.',
    abandon: 'Um jogador abandonou a partida.',
  })[reason ?? ''] ?? '';
