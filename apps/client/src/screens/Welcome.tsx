import { useState } from 'react';
import { hexToPixel, type BugType, type Color } from '@hive/engine';
import { parseServerAddress } from '@hive/protocol';
import { JoinServer } from '../components/HostPanel';
import { ServerField } from '../components/ServerField';
import { isMobileApp, webOnly } from '../lib/platform';
import { Tile, hexPath } from '../components/Tile';
import { useNet } from '../net/store';
import { btn, input } from '../lib/ui';
import { useApp } from '../app-store';

const TILE = 30;
const isTouchDevice = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
const SPACING = TILE + 2.5;

/** The black queen, one move away from being surrounded: the whole game in one picture. */
const ROSETTE: { bug: BugType; color: Color; q: number; r: number }[] = [
  { bug: 'Q', color: 1, q: 0, r: 0 },
  { bug: 'A', color: 0, q: 1, r: 0 },
  { bug: 'B', color: 0, q: 0, r: 1 },
  { bug: 'G', color: 0, q: -1, r: 1 },
  { bug: 'S', color: 0, q: -1, r: 0 },
  { bug: 'L', color: 1, q: 0, r: -1 },
];
const OPEN_CELL = { q: 1, r: -1 };

function Rosette() {
  const open = hexToPixel(OPEN_CELL, SPACING);
  return (
    <svg viewBox="-84 -82 170 166" className="w-56 sm:w-72 lg:w-[22rem]" role="img" aria-label="Rainha preta quase cercada por peças brancas">
      <g transform={`translate(${open.x},${open.y})`}>
        <path d={hexPath(TILE * 0.96)} fill="rgba(232,163,61,0.08)" stroke="#e8a33d" strokeWidth={1.6} strokeDasharray="5 4" />
        <circle r={TILE * 0.17} fill="#e8a33d" className="target-pulse" />
      </g>
      {ROSETTE.map((t) => {
        const p = hexToPixel({ q: t.q, r: t.r }, SPACING);
        return <Tile key={`${t.q},${t.r}`} bug={t.bug} color={t.color} size={TILE} x={p.x} y={p.y} />;
      })}
    </svg>
  );
}

export function Welcome() {
  const { name: savedName, connect, status, serverUrl, toast } = useNet();
  const startLocal = useApp((s) => s.startLocal);
  const startLink = useApp((s) => s.startLink);
  const [name, setName] = useState(savedName);
  const [address, setAddress] = useState(serverUrl ?? '');
  const busy = status === 'connecting';

  const enter = () => {
    if (!name.trim()) return;
    if (!isMobileApp) return void connect(name.trim());
    const target = parseServerAddress(address);
    if (!target) return toast('Digite o endereço que aparece no computador de quem hospeda, ou leia o QR code.', 'error');
    connect(name.trim(), target);
  };

  return (
    <div className="grid min-h-full place-items-center px-4 py-8 sm:px-8">
      <div className="grid w-full max-w-5xl items-center gap-10 lg:grid-cols-[1fr_28rem] lg:gap-16">
        <section className="flex min-w-0 flex-col items-center gap-6 text-center lg:items-start lg:text-left">
          <Rosette />
          <div>
            <h1 className="font-display text-6xl font-extrabold leading-none tracking-tight lg:text-7xl">Favo</h1>
            <p className="mt-3 max-w-md text-balance text-lg text-muted">Cerque a rainha adversária antes que cerquem a sua.</p>
          </div>
        </section>

        <section className="flex w-full min-w-0 flex-col gap-4">
          {webOnly && (
            <>
              <div className="flex flex-col gap-2 rounded-xl border border-line/70 bg-panel/70 p-5">
                <h2 className="font-display text-xl font-semibold">Jogar com um amigo</h2>
                <p className="text-sm text-muted">Crie a partida e mande o link. Cada um joga do seu aparelho, sem instalar nada.</p>
                <button type="button" onClick={startLink} className={btn.primary}>
                  Criar partida e copiar link
                </button>
              </div>
              <div className="flex flex-col gap-2 rounded-xl border border-line/70 bg-panel/70 p-5">
                <h2 className="font-display text-xl font-semibold">Jogar sozinho ou em dupla</h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button type="button" onClick={() => startLocal('bot')} className={btn.secondary}>
                    Contra o computador
                  </button>
                  <button type="button" onClick={() => startLocal('human')} className={btn.secondary}>
                    Duas pessoas aqui
                  </button>
                </div>
              </div>
            </>
          )}
          {!webOnly && (
          <>
          <form
            className="flex flex-col gap-3 rounded-xl border border-line/70 bg-panel/70 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              enter();
            }}
          >
            <h2 className="font-display text-xl font-semibold">Jogar com outras pessoas</h2>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-muted">Seu nome</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} autoFocus={!isMobileApp} className={input} placeholder="Como os outros vão te ver" />
            </label>
            {isMobileApp && <ServerField value={address} onChange={setAddress} />}
            <button type="submit" disabled={!name.trim() || busy || (isMobileApp && !address.trim())} className={btn.primary}>
              {busy ? 'Conectando…' : 'Entrar no salão'}
            </button>
            {!isMobileApp && <p className="text-xs text-muted">Servidor: {location.host}</p>}
          </form>

          <div className="flex flex-col gap-2 rounded-xl border border-line/70 bg-panel/70 p-5">
            <h2 className="font-display text-xl font-semibold">{isMobileApp || isTouchDevice ? 'Jogar neste aparelho' : 'Jogar neste computador'}</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => startLocal('bot')} className={btn.secondary}>
                Contra o computador
              </button>
              <button type="button" onClick={() => startLocal('human')} className={btn.secondary}>
                Duas pessoas
              </button>
            </div>
          </div>

          <JoinServer />
          </>
          )}
        </section>
      </div>
    </div>
  );
}
