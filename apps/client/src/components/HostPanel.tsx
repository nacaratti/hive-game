import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { copyText, desktop, useHostInfo, useLanServers } from '../lib/desktop';
import { isMobileApp } from '../lib/platform';
import { btn, input } from '../lib/ui';
import { useNet } from '../net/store';

export function QR({ text, size = 150 }: { text: string; size?: number }) {
  const [data, setData] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(text, { margin: 1, width: size * 2, color: { dark: '#2a211b', light: '#ede6d6' } })
      .then(setData)
      .catch(() => setData(null));
  }, [text, size]);
  return data ? <img src={data} alt={`QR code para ${text}`} width={size} height={size} className="rounded-md" /> : null;
}

function CopyRow({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-md bg-table-deep px-3 py-2 text-sm text-ink">{value}</code>
      <button
        type="button"
        className={`${btn.secondary} shrink-0 px-3 py-2 text-sm`}
        onClick={() =>
          copyText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
        }
      >
        {copied ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  );
}

/** How friends reach this server: LAN address, internet tunnel, or (in a browser) the current address. */
export function HostPanel() {
  const info = useHostInfo();
  const { serverUrl, server, disconnect } = useNet();

  if (isMobileApp && serverUrl) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-line/70 bg-panel/70 p-5 text-sm">
        <h2 className="font-display text-lg font-semibold">{server?.name ?? 'Servidor'}</h2>
        <p className="text-muted">Para chamar mais alguém, mostre este QR code ou envie o endereço:</p>
        <CopyRow value={serverUrl} />
        <div className="self-center">
          <QR text={serverUrl} size={130} />
        </div>
        <button type="button" className={btn.ghost} onClick={disconnect}>
          Trocar de servidor
        </button>
      </div>
    );
  }

  if (desktop && !desktop.isHome) {
    return (
      <div className="rounded-xl border border-line/70 bg-panel/70 p-4 text-sm">
        <h2 className="mb-2 font-display text-lg font-semibold">Servidor de outra pessoa</h2>
        <p className="text-muted">
          Você está jogando em <span className="text-ink">{location.host}</span>.
        </p>
        <button type="button" className={`${btn.secondary} mt-3 w-full`} onClick={() => desktop?.goHome()}>
          Voltar ao meu servidor
        </button>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="rounded-xl border border-line/70 bg-panel/70 p-4 text-sm">
        <h2 className="mb-2 font-display text-lg font-semibold">Chamar amigos</h2>
        <p className="mb-2 text-muted">Quem estiver na mesma rede ou com o link entra pelo navegador:</p>
        <CopyRow value={location.origin} />
      </div>
    );
  }

  const t = info.tunnel;
  const lanUrl = info.lanUrls[0];
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-line/70 bg-panel/70 p-4 text-sm">
      <h2 className="font-display text-lg font-semibold">Chamar amigos</h2>

      <section className="flex flex-col gap-2">
        <h3 className="font-bold">Na mesma rede (Wi-Fi ou cabo)</h3>
        <p className="text-muted">Quem tem o Hive Pro vê sua sala na lista automaticamente. Pelo navegador ou celular, use:</p>
        {lanUrl ? (
          <>
            <CopyRow value={lanUrl} />
            <div className="self-center">
              <QR text={lanUrl} size={130} />
            </div>
          </>
        ) : (
          <p className="text-danger">Este computador não está conectado a uma rede.</p>
        )}
      </section>

      <section className="flex flex-col gap-2 border-t border-line/60 pt-3">
        <h3 className="font-bold">Pela internet</h3>
        {t.status === 'on' ? (
          <>
            <p className="text-muted">Envie este link. Ele funciona enquanto o Hive Pro estiver aberto.</p>
            <CopyRow value={t.url} />
            <div className="self-center">
              <QR text={t.url} size={130} />
            </div>
            <button type="button" className={btn.ghost} onClick={() => desktop?.stopTunnel()}>
              Parar de compartilhar
            </button>
          </>
        ) : t.status === 'starting' ? (
          <p className="text-muted">Abrindo o túnel…</p>
        ) : t.status === 'downloading' ? (
          <div>
            <p className="mb-2 text-muted">Baixando o cloudflared… {Math.round(t.progress * 100)}%</p>
            <div className="h-2 overflow-hidden rounded-full bg-table-deep">
              <div className="h-full bg-honey" style={{ width: `${Math.round(t.progress * 100)}%` }} />
            </div>
          </div>
        ) : t.status === 'missing' ? (
          <>
            <p className="text-muted">
              Para jogar com quem está longe, o Hive Pro usa um túnel gratuito da Cloudflare. Ele precisa do programa oficial cloudflared (cerca de 60 MB), baixado
              do GitHub da Cloudflare.
            </p>
            {t.error && <p className="text-danger">{t.error}</p>}
            <button type="button" className={btn.secondary} onClick={() => desktop?.downloadTunnel()}>
              Baixar cloudflared
            </button>
          </>
        ) : (
          <>
            <p className="text-muted">Gera um link público para seus amigos entrarem de qualquer lugar, sem configurar o roteador.</p>
            {t.status === 'error' && <p className="text-danger">{t.error}</p>}
            <button type="button" className={btn.primary} onClick={() => desktop?.startTunnel()}>
              Compartilhar pela internet
            </button>
            <p className="text-xs text-muted">Dica: coloque senha na sala quando compartilhar o link.</p>
          </>
        )}
      </section>
    </div>
  );
}

/** Join another host: LAN list (desktop app) plus a typed address. */
export function JoinServer() {
  const servers = useLanServers();
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!desktop) return null;

  const open = async (target: string) => {
    setBusy(true);
    setError(null);
    const res = await desktop!.openServer(target);
    setBusy(false);
    if (!res.ok) setError(res.error ?? 'Não foi possível conectar.');
  };

  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border border-line/70 bg-panel/70 p-5 text-sm">
      <h2 className="font-display text-lg font-semibold">Entrar no servidor de um amigo</h2>
      {servers.length === 0 ? (
        <p className="text-muted">Procurando servidores na sua rede…</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {servers.map((s) => (
            <li key={s.id} className="flex items-center gap-3 rounded-lg bg-table-deep/60 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{s.name}</p>
                <p className="text-xs text-muted">
                  {s.rooms} {s.rooms === 1 ? 'sala' : 'salas'}, {s.players} {s.players === 1 ? 'pessoa' : 'pessoas'}
                </p>
              </div>
              <button type="button" className={btn.secondary} disabled={busy} onClick={() => open(s.url)}>
                Entrar
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (address.trim()) open(address);
        }}
      >
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Endereço ou link (ex.: 192.168.0.12)"
          aria-label="Endereço do servidor"
          className={`${input} min-w-0 flex-1 text-sm`}
        />
        <button type="submit" className={btn.secondary} disabled={busy || !address.trim()}>
          Conectar
        </button>
      </form>
      {error && <p className="text-danger">{error}</p>}
    </div>
  );
}
