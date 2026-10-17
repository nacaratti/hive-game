import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import { Hive, type Color, type Move } from '@hive/engine';
import { GuestMessage, type Expansions, type HostMessage, type LinkState } from '@hive/protocol';
import { QR } from '../components/HostPanel';
import { PlayerBar, statusText, type SeatInfo } from '../components/PlayerBar';
import { SettingsForm } from '../components/SettingsForm';
import { MoveList } from '../components/SidePanel';
import { Table } from '../components/Table';
import { positionAt } from '../game/replay';
import { copyText } from '../lib/desktop';
import { btn, input } from '../lib/ui';
import { LinkMatch, type LinkMatchData } from '../net/linkMatch';
import { PeerError, isPeerId, newPeerId, openPeer, peerErrorText } from '../net/p2p';
import { useApp } from '../app-store';
import { Modal } from './Lobby';

const NAME_KEY = 'hive.name';
const HOST_KEY = 'hive.link';
const GUEST_KEY = 'hive.guestId';

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Match played between two browsers through a shared link (web version). */
export function LinkGame() {
  const params = new URLSearchParams(location.search);
  const hostId = params.get('p');
  return isPeerId(hostId) ? <GuestView hostId={hostId} /> : <HostView resumeId={params.get('anfitriao')} />;
}

// ---------------------------------------------------------------------- host

interface Setup {
  name: string;
  expansions: Expansions;
  color: 'white' | 'black' | 'random';
}

function HostView({ resumeId }: { resumeId: string | null }) {
  const exit = useApp((s) => s.exitLink);
  const [phase, setPhase] = useState<'setup' | 'opening' | 'ready' | 'error'>('setup');
  const [error, setError] = useState('');
  const [setup, setSetup] = useState<Setup>({
    name: store.get(NAME_KEY) ?? '',
    expansions: { mosquito: true, ladybug: true, pillbug: true },
    color: 'random',
  });
  const [showSetup, setShowSetup] = useState(true);
  const [, bump] = useState(0);
  const [guestConnected, setGuestConnected] = useState(false);
  const match = useRef<LinkMatch | null>(null);
  const peer = useRef<Peer | null>(null);
  const conn = useRef<DataConnection | null>(null);
  const peerId = useRef<string>('');

  /** Saves, re-renders and sends the new state to the guest. */
  const publish = useCallback(() => {
    const m = match.current;
    if (!m) return;
    store.set(HOST_KEY, JSON.stringify({ peerId: peerId.current, match: m.toJSON() }));
    bump((n) => n + 1);
    const c = conn.current;
    if (c?.open) c.send(m.state(true) satisfies HostMessage);
  }, []);

  const attach = useCallback(
    (p: Peer) => {
      peer.current = p;
      p.on('connection', (c) => {
        c.on('data', (raw) => {
          const parsed = GuestMessage.safeParse(raw);
          const m = match.current;
          if (!parsed.success || !m) return;
          const msg = parsed.data;
          if (msg.t === 'hello') {
            if (!m.hello(msg.guestId, msg.name)) {
              c.send({ t: 'full' } satisfies HostMessage);
              setTimeout(() => c.close(), 500);
              return;
            }
            if (conn.current && conn.current !== c) conn.current.close();
            conn.current = c;
            setGuestConnected(true);
            publish();
            return;
          }
          if (c !== conn.current) return;
          if (msg.t === 'move') {
            const err = m.play('guest', msg.move, msg.ply);
            if (err) c.send({ t: 'error', error: err } satisfies HostMessage);
          } else if (msg.t === 'resign') m.resign('guest');
          else if (msg.t === 'rematch') m.rematch('guest');
          publish();
        });
        const gone = () => {
          if (conn.current === c) {
            conn.current = null;
            setGuestConnected(false);
          }
        };
        c.on('close', gone);
        c.on('error', gone);
      });
      // Losing the broker does not drop the game connection; reconnect so new joins still work.
      p.on('disconnected', () => {
        if (!p.destroyed) setTimeout(() => !p.destroyed && p.reconnect(), 2000);
      });
    },
    [publish],
  );

  const open = useCallback(
    async (id: string, attempts: number) => {
      setPhase('opening');
      for (let i = 0; i < attempts; i++) {
        try {
          const p = await openPeer(id);
          peerId.current = id;
          attach(p);
          history.replaceState(null, '', `${location.pathname}?anfitriao=${id}`);
          setPhase('ready');
          publish();
          return;
        } catch (e) {
          // After a reload the broker may still hold our old id for a few seconds.
          const type = e instanceof PeerError ? e.type : 'unknown';
          if (type !== 'unavailable-id' || i === attempts - 1) {
            setError(type === 'unavailable-id' ? 'Este link ainda está em uso em outra aba. Feche a outra aba ou crie uma nova partida.' : peerErrorText(type));
            setPhase('error');
            return;
          }
          await sleep(2500);
        }
      }
    },
    [attach, publish],
  );

  // Resume after a page reload (guarded: React runs mount effects twice in development).
  const resumed = useRef(false);
  useEffect(() => {
    if (!resumeId || resumed.current) return;
    resumed.current = true;
    try {
      const saved = JSON.parse(store.get(HOST_KEY) ?? 'null') as { peerId: string; match: LinkMatchData } | null;
      if (saved?.peerId === resumeId) {
        match.current = LinkMatch.restore(saved.match);
        setShowSetup(false);
        open(resumeId, 6);
      }
    } catch {
      /* corrupt save: start over */
    }
    // Once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onUnload = () => peer.current?.destroy();
    window.addEventListener('pagehide', onUnload);
    return () => window.removeEventListener('pagehide', onUnload);
  }, []);

  const start = () => {
    const name = setup.name.trim() || 'Anfitrião';
    store.set(NAME_KEY, name);
    const color = setup.color === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : setup.color;
    const previous = match.current;
    const m = new LinkMatch(setup.expansions, name, color);
    // "Nova partida" keeps the friend who is already connected.
    if (previous?.guestId) m.hello(previous.guestId, previous.guestName ?? 'Convidado');
    match.current = m;
    setShowSetup(false);
    if (peer.current && !peer.current.destroyed) publish();
    else open(newPeerId(), 3);
  };

  const leave = () => {
    peer.current?.destroy();
    store.set(HOST_KEY, null);
    exit();
  };

  const m = match.current;
  const link = `${location.origin}${location.pathname}?p=${peerId.current}`;

  return (
    <div className="h-full">
      {m && phase === 'ready' ? (
        <MatchView
          state={m.state(guestConnected)}
          side="host"
          onMove={(mv, ply) => {
            const err = m.play('host', mv, ply);
            if (!err) publish();
          }}
          onResign={() => {
            m.resign('host');
            publish();
          }}
          onRematch={() => {
            m.rematch('host');
            publish();
          }}
          onNewGame={() => setShowSetup(true)}
          onLeave={leave}
          waiting={
            !m.guestName ? (
              <InviteCard link={link} />
            ) : !guestConnected ? (
              <Banner>{m.guestName} se desconectou. A partida continua quando voltar pelo mesmo link.</Banner>
            ) : null
          }
        />
      ) : (
        <Centered>
          {phase === 'opening' && <p className="text-muted">Preparando a partida…</p>}
          {phase === 'error' && (
            <div className="max-w-md text-center">
              <p className="mb-4">{error}</p>
              <div className="flex justify-center gap-2">
                <button type="button" className={btn.primary} onClick={() => setShowSetup(true)}>
                  Criar nova partida
                </button>
                <button type="button" className={btn.ghost} onClick={leave}>
                  Voltar
                </button>
              </div>
            </div>
          )}
        </Centered>
      )}

      {showSetup && (
        <Modal title={m ? 'Nova partida com o mesmo link' : 'Jogar com um amigo'} onClose={() => (m ? setShowSetup(false) : leave())}>
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm text-muted">Seu nome</span>
              <input value={setup.name} maxLength={24} onChange={(e) => setSetup({ ...setup, name: e.target.value })} className={input} placeholder="Como seu amigo vai te ver" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-muted">Você joga com</span>
              <select value={setup.color} onChange={(e) => setSetup({ ...setup, color: e.target.value as Setup['color'] })} className={input}>
                <option value="random">Sortear</option>
                <option value="white">Brancas (começa)</option>
                <option value="black">Pretas</option>
              </select>
            </label>
            <SettingsForm
              value={{ name: 'Link', expansions: setup.expansions, timeControl: null, randomColors: false }}
              onChange={(v) => setSetup({ ...setup, expansions: v.expansions })}
              showName={false}
              showPassword={false}
              showClock={false}
            />
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className={btn.ghost} onClick={() => (m ? setShowSetup(false) : leave())}>
              {m ? 'Cancelar' : 'Voltar'}
            </button>
            <button type="button" className={btn.primary} onClick={start}>
              {m ? 'Começar' : 'Criar link'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function InviteCard({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="absolute inset-x-0 top-6 z-20 mx-auto flex w-[min(24rem,calc(100%-2rem))] flex-col items-center gap-3 rounded-xl border border-honey/70 bg-panel p-5 text-center shadow-2xl">
      <p className="font-display text-xl font-bold">Mande este link para seu amigo</p>
      <QR text={link} size={150} />
      <code className="w-full truncate rounded-md bg-table-deep px-3 py-2 text-xs">{link}</code>
      <button
        type="button"
        className={`${btn.primary} w-full`}
        onClick={() =>
          copyText(link).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
        }
      >
        {copied ? 'Link copiado' : 'Copiar link'}
      </button>
      <p className="text-sm text-muted">Aguardando seu amigo entrar… Deixe esta página aberta durante a partida.</p>
    </div>
  );
}

// --------------------------------------------------------------------- guest

function GuestView({ hostId }: { hostId: string }) {
  const exit = useApp((s) => s.exitLink);
  const [name, setName] = useState(store.get(NAME_KEY) ?? '');
  const [phase, setPhase] = useState<'name' | 'connecting' | 'ready' | 'error'>(store.get(NAME_KEY) ? 'connecting' : 'name');
  const [error, setError] = useState('');
  const [state, setState] = useState<LinkState | null>(null);
  const [online, setOnline] = useState(false);
  const peer = useRef<Peer | null>(null);
  const conn = useRef<DataConnection | null>(null);
  const closed = useRef(false);
  const everConnected = useRef(false);

  const guestId = useMemo(() => {
    let id = store.get(GUEST_KEY);
    if (!id) {
      id = newPeerId().replace('favo-', 'g-');
      store.set(GUEST_KEY, id);
    }
    return id;
  }, []);

  const fail = (text: string) => {
    closed.current = true;
    setError(text);
    setPhase('error');
  };

  const busy = useRef(false);
  const connect = useCallback(async () => {
    if (closed.current || busy.current) return;
    busy.current = true;
    try {
      if (!peer.current || peer.current.destroyed) peer.current = await openPeer();
    } catch (e) {
      busy.current = false;
      return fail(peerErrorText(e instanceof PeerError ? e.type : 'unknown'));
    }
    busy.current = false;
    const p = peer.current;
    let opened = false;
    const c = p.connect(hostId, { reliable: true });
    conn.current = c;
    const timer = setTimeout(() => {
      if (opened) return;
      c.close();
      if (everConnected.current) retry();
      else fail(peerErrorText('ice'));
    }, 15_000);
    p.once('error', (e: Error & { type?: string }) => {
      if (opened) return;
      clearTimeout(timer);
      // The host may be reloading its page: keep trying for a while if we were already playing.
      if (everConnected.current) retry();
      else fail(peerErrorText(e.type ?? 'unknown'));
    });
    c.on('open', () => {
      opened = true;
      everConnected.current = true;
      clearTimeout(timer);
      setOnline(true);
      c.send({ t: 'hello', name: store.get(NAME_KEY) ?? 'Convidado', guestId } satisfies GuestMessage);
    });
    c.on('data', (raw) => {
      const msg = raw as HostMessage;
      if (msg?.t === 'state') {
        setState(msg);
        setPhase('ready');
      } else if (msg?.t === 'full') fail('Essa partida já tem dois jogadores.');
    });
    c.on('close', () => {
      if (conn.current !== c) return;
      setOnline(false);
      retry();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostId, guestId]);

  const retries = useRef(0);
  const retry = () => {
    if (closed.current) return;
    if (++retries.current > 20) return fail('Perdemos a conexão com quem criou a partida. Peça um novo link.');
    setTimeout(connect, 3000);
  };

  useEffect(() => {
    if (phase === 'connecting') connect();
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase === 'connecting']);

  // Closing the page (not the development double-mount) tears the connection down.
  useEffect(() => {
    const onUnload = () => peer.current?.destroy();
    window.addEventListener('pagehide', onUnload);
    return () => window.removeEventListener('pagehide', onUnload);
  }, []);

  const send = (msg: GuestMessage) => conn.current?.open && conn.current.send(msg);
  const leave = () => {
    closed.current = true;
    peer.current?.destroy();
    exit();
  };

  if (phase === 'ready' && state) {
    return (
      <div className="h-full">
        <MatchView
          state={state}
          side="guest"
          onMove={(mv, ply) => {
            const game = Hive.fromGameString(state.gameString);
            send({ t: 'move', move: game.moveToString(mv), ply });
          }}
          onResign={() => send({ t: 'resign' })}
          onRematch={() => send({ t: 'rematch' })}
          onLeave={leave}
          waiting={!online ? <Banner>Conexão perdida. Tentando reconectar…</Banner> : null}
        />
      </div>
    );
  }

  return (
    <Centered>
      {phase === 'name' && (
        <form
          className="flex w-full max-w-sm flex-col gap-3 rounded-xl border border-line/70 bg-panel/70 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            store.set(NAME_KEY, name.trim());
            setPhase('connecting');
          }}
        >
          <h1 className="font-display text-2xl font-bold">Você foi convidado para uma partida</h1>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-muted">Seu nome</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} autoFocus className={input} placeholder="Como seu amigo vai te ver" />
          </label>
          <button type="submit" className={btn.primary} disabled={!name.trim()}>
            Entrar na partida
          </button>
        </form>
      )}
      {phase === 'connecting' && <p className="text-muted">Conectando ao seu amigo…</p>}
      {phase === 'error' && (
        <div className="max-w-md text-center">
          <p className="mb-4">{error}</p>
          <button type="button" className={btn.secondary} onClick={leave}>
            Ir para o início
          </button>
        </div>
      )}
    </Centered>
  );
}

// ------------------------------------------------------------------- shared

interface MatchViewProps {
  state: LinkState;
  side: 'host' | 'guest';
  onMove: (move: Move, ply: number) => void;
  onResign: () => void;
  onRematch: () => void;
  onNewGame?: () => void;
  onLeave: () => void;
  waiting: React.ReactNode;
}

function MatchView({ state, side, onMove, onResign, onRematch, onNewGame, onLeave, waiting }: MatchViewProps) {
  const live = useMemo(() => Hive.fromGameString(state.gameString), [state.gameString]);
  const moves = live.moveHistory;
  const [reviewPly, setReviewPly] = useState<number | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const [pending, setPending] = useState(false);
  useEffect(() => setPending(false), [state]);

  const shown = useMemo(() => (reviewPly === null ? live : positionAt(state.gameString, reviewPly)), [live, reviewPly, state.gameString]);
  const myColorName = side === 'host' ? state.hostColor : state.hostColor === 'white' ? 'black' : 'white';
  const myColor: Color = myColorName === 'white' ? 0 : 1;
  const hostSeat: SeatInfo = { name: state.hostName, isMe: side === 'host', connected: true };
  const guestSeat: SeatInfo = {
    name: state.guestName ?? 'Seu amigo',
    isMe: side === 'guest',
    // Before anyone joins there is nothing to call "disconnected".
    connected: !state.guestName || side === 'guest' || state.guestConnected,
  };
  const seats = state.hostColor === 'white' ? { white: hostSeat, black: guestSeat } : { white: guestSeat, black: hostSeat };

  const over = state.endReason !== null;
  const status = over ? endText(state, seats) : !state.guestName ? 'Aguardando seu amigo entrar' : statusText(live, seats);
  const canPlay = !over && !!state.guestName;
  const iAskedRematch = state.rematchBy.includes(side);

  return (
    <Table
      game={shown}
      controls={canPlay ? [myColor] : []}
      frozen={pending || reviewPly !== null}
      onMove={(m) => {
        setPending(true);
        onMove(m, live.ply);
      }}
      sideLabel="Lances"
      header={
        <PlayerBar
          game={shown}
          seats={seats}
          status={reviewPly !== null ? `Revendo lance ${reviewPly}` : status}
          actions={
            <div className="ml-1 flex items-center gap-0.5 text-sm">
              {canPlay && (
                <button type="button" className={btn.ghost} onClick={() => setConfirmResign(true)}>
                  Desistir
                </button>
              )}
              <button type="button" className={btn.ghost} onClick={onLeave}>
                Sair
              </button>
            </div>
          }
        />
      }
      side={<MoveList moves={moves} reviewPly={reviewPly} onReview={setReviewPly} />}
      overlay={
        <>
          {waiting}
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
                      onResign();
                    }}
                  >
                    Desistir
                  </button>
                </div>
              </div>
            </div>
          )}
          {over && reviewPly === null && (
            <div className="absolute inset-x-0 bottom-6 z-20 mx-auto w-[min(26rem,calc(100%-2rem))] rounded-xl border border-honey/70 bg-panel p-5 text-center shadow-2xl">
              <p className="font-display text-2xl font-bold">{status}</p>
              <p className="mt-1 text-sm text-muted">
                {state.endReason === 'resign' ? 'Desistência.' : state.endReason === 'draw' ? 'As duas rainhas foram cercadas ao mesmo tempo.' : 'A rainha foi cercada.'}
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button type="button" className={btn.primary} disabled={iAskedRematch} onClick={onRematch}>
                  {iAskedRematch ? 'Aguardando seu amigo' : state.rematchBy.length ? 'Aceitar revanche' : 'Revanche'}
                </button>
                {onNewGame && (
                  <button type="button" className={btn.secondary} onClick={onNewGame}>
                    Nova partida
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      }
    />
  );
}

const endText = (state: LinkState, seats: Record<'white' | 'black', SeatInfo>) => {
  if (state.result === 'Draw') return 'Empate';
  const winner = state.result === 'WhiteWins' ? seats.white : seats.black;
  return winner.isMe ? 'Você venceu!' : `${winner.name} venceu`;
};

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-x-0 top-4 z-10 mx-auto w-fit max-w-[calc(100%-2rem)] rounded-lg border border-honey/60 bg-panel px-4 py-2 text-sm shadow-xl">{children}</div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-full place-items-center px-4 py-10">{children}</div>;
}
