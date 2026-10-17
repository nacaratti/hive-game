import { useEffect, useState } from 'react';
import type { RoomSettings, RoomSummary } from '@hive/protocol';
import { HostPanel, JoinServer } from '../components/HostPanel';
import { SettingsForm, describeTime } from '../components/SettingsForm';
import { TileIcon } from '../components/Tile';
import { send, useNet } from '../net/store';
import { btn, input } from '../lib/ui';
import { useApp } from '../app-store';

const expansionText = (e: RoomSummary['expansions']) => {
  const list = [e.mosquito && 'Mosquito', e.ladybug && 'Joaninha', e.pillbug && 'Tatuzinho'].filter(Boolean);
  return list.length ? `com ${list.join(', ')}` : 'jogo base';
};

const STATUS: Record<RoomSummary['status'], string> = { waiting: 'Aguardando', playing: 'Em partida', finished: 'Partida encerrada' };

export function Lobby() {
  const { name, rooms, server, disconnect, inviteRoom, clearInvite } = useNet();
  const startLocal = useApp((s) => s.startLocal);
  const [creating, setCreating] = useState(false);
  const [settings, setSettings] = useState<RoomSettings>({
    name: `Mesa de ${name}`,
    expansions: { mosquito: true, ladybug: true, pillbug: true },
    timeControl: null,
    randomColors: true,
  });
  const [passwordFor, setPasswordFor] = useState<RoomSummary | null>(null);
  const [password, setPassword] = useState('');

  const join = async (room: RoomSummary, pw?: string) => {
    if (room.hasPassword && pw === undefined) {
      setPasswordFor(room);
      setPassword('');
      return;
    }
    const res = await send('room:join', { roomId: room.id, password: pw });
    if (res.ok) setPasswordFor(null);
  };

  // Invitation links: /?sala=<id> in the browser, or the room carried by a link opened in the mobile app.
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('sala') ?? inviteRoom;
    if (!id) return;
    const room = rooms.find((r) => r.id === id);
    if (room) {
      if (location.search) history.replaceState(null, '', location.pathname);
      clearInvite();
      join(room);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms]);

  const create = async () => {
    const res = await send('room:create', settings);
    if (res.ok) setCreating(false);
  };

  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col px-4 py-6">
      <header className="mb-6 flex items-center gap-3">
        <TileIcon bug="Q" color={0} size={38} />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-bold">{server?.name ?? 'Favo'}</h1>
          <p className="text-sm text-muted">
            Você entrou como <span className="text-ink">{name}</span>
          </p>
        </div>
        <button type="button" onClick={disconnect} className={btn.ghost}>
          Sair
        </button>
      </header>

      <div className="grid flex-1 gap-6 md:grid-cols-[1fr_340px]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold">Salas</h2>
            <button type="button" className={btn.primary} onClick={() => setCreating(true)}>
              Criar sala
            </button>
          </div>
          {rooms.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line p-8 text-center text-muted">
              Nenhuma sala aberta. Crie uma e chame seus amigos.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {rooms.map((r) => (
                <li key={r.id} className="flex items-center gap-3 rounded-xl border border-line/70 bg-panel/70 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">
                      {r.name} {r.hasPassword && <span title="Sala com senha">🔒</span>}
                    </p>
                    <p className="text-sm text-muted">
                      {r.hostName}, {expansionText(r.expansions)}, {describeTime(r.timeControl).toLowerCase()}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <p className={r.status === 'waiting' ? 'text-ok' : 'text-muted'}>{STATUS[r.status]}</p>
                    <p className="text-muted">
                      {r.players}/2 jogadores{r.spectators ? `, ${r.spectators} assistindo` : ''}
                    </p>
                  </div>
                  <button type="button" className={btn.secondary} onClick={() => join(r)}>
                    {r.status !== 'playing' && r.players < 2 ? 'Entrar' : 'Assistir'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 rounded-xl border border-line/70 bg-panel/70 p-4 text-sm">
            <h2 className="font-display text-lg font-semibold">Treinar sozinho</h2>
            <p className="text-muted">Jogue contra o computador, sem precisar de ninguém online.</p>
            <button type="button" className={btn.secondary} onClick={() => startLocal('bot')}>
              Jogar contra o computador
            </button>
          </div>
          <HostPanel />
          <JoinServer />
        </aside>
      </div>

      {creating && (
        <Modal title="Nova sala" onClose={() => setCreating(false)}>
          <SettingsForm value={settings} onChange={setSettings} />
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className={btn.ghost} onClick={() => setCreating(false)}>
              Cancelar
            </button>
            <button type="button" className={btn.primary} disabled={!settings.name.trim()} onClick={create}>
              Criar sala
            </button>
          </div>
        </Modal>
      )}

      {passwordFor && (
        <Modal title={`Senha de ${passwordFor.name}`} onClose={() => setPasswordFor(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              join(passwordFor, password);
            }}
            className="flex flex-col gap-4"
          >
            <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} className={input} aria-label="Senha" />
            <div className="flex justify-end gap-2">
              <button type="button" className={btn.ghost} onClick={() => setPasswordFor(null)}>
                Cancelar
              </button>
              <button type="submit" className={btn.primary}>
                Entrar
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal aria-label={title} className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-line bg-panel p-5 shadow-2xl">
        <h2 className="mb-4 font-display text-xl font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}
