import { useEffect } from 'react';
import { useApp } from './app-store';
import { registerAppLifecycle } from './lib/mobile';
import { hasActiveSession, resumeConnection, send, useNet } from './net/store';
import { webOnly } from './lib/platform';
import { Demo } from './screens/Demo';
import { LinkGame } from './screens/LinkGame';
import { LocalGame } from './screens/LocalGame';
import { Lobby } from './screens/Lobby';
import { RoomScreen } from './screens/RoomScreen';
import { Welcome } from './screens/Welcome';

function Toasts() {
  const { toasts, dismissToast } = useNet();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismissToast(t.id)}
          className={`pointer-events-auto rounded-lg border px-4 py-2 text-sm shadow-xl ${
            t.tone === 'error' ? 'border-danger/70 bg-[#4a2620] text-ink' : 'border-line bg-panel text-ink'
          }`}
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}

function ConnectionBanner() {
  const status = useNet((s) => s.status);
  if (status !== 'reconnecting') return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 bg-danger px-4 py-1.5 text-center text-sm font-bold text-ink">
      Conexão perdida. Tentando reconectar…
    </div>
  );
}

let autoConnectTried = false;
const isDemo = new URLSearchParams(location.search).has('demo');

export function App() {
  const mode = useApp((s) => s.mode);
  const { status, playerId, room, connect, name } = useNet();

  useEffect(() => {
    if (autoConnectTried || isDemo || webOnly) return;
    autoConnectTried = true;
    if (hasActiveSession()) connect(name);
    // Once per page load (StrictMode runs effects twice in development).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mobile app: reconnect on resume; Android back button leaves the current screen.
  useEffect(
    () =>
      registerAppLifecycle({
        onResume: resumeConnection,
        onBack: () => {
          if (document.querySelector('[role="dialog"]')) {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
            return true;
          }
          if (useApp.getState().mode === 'local') {
            useApp.getState().exitLocal();
            return true;
          }
          const net = useNet.getState();
          if (net.room) {
            if (net.room.status !== 'playing' || window.confirm('Sair da partida? Se você estiver jogando, ela conta como abandono.')) send('room:leave');
            return true;
          }
          return false;
        },
      }),
    [],
  );

  let screen;
  if (isDemo) screen = <Demo />;
  else if (mode === 'local') screen = <LocalGame />;
  else if (mode === 'link') screen = <LinkGame />;
  else if (!playerId || status === 'offline' || status === 'connecting') screen = <Welcome />;
  else if (room) screen = <RoomScreen room={room} />;
  else screen = <Lobby />;

  return (
    <>
      {screen}
      <Toasts />
      {mode === 'online' && !webOnly && <ConnectionBanner />}
    </>
  );
}
