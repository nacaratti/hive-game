import Peer, { type PeerOptions } from 'peerjs';

/**
 * Direct browser-to-browser connections (web version, no server of ours).
 * PeerJS's free public broker only introduces the two browsers; moves then
 * travel directly between them over WebRTC.
 */

const OPTIONS: PeerOptions = {
  debug: 0,
  config: {
    iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
  },
};

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

export const newPeerId = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return 'hivepro-' + [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
};

export const isPeerId = (id: string | null): id is string => !!id && /^hivepro-[a-z0-9]{6,20}$/.test(id);

export class PeerError extends Error {
  constructor(readonly type: string) {
    super(type);
  }
}

/** Registers with the broker. Rejects with a PeerError (e.g. "unavailable-id", "network"). */
export function openPeer(id?: string, timeoutMs = 12_000): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id, OPTIONS) : new Peer(OPTIONS);
    const timer = setTimeout(() => {
      peer.destroy();
      reject(new PeerError('timeout'));
    }, timeoutMs);
    peer.once('open', () => {
      clearTimeout(timer);
      resolve(peer);
    });
    peer.once('error', (e: Error & { type?: string }) => {
      clearTimeout(timer);
      peer.destroy();
      reject(new PeerError(e.type ?? 'unknown'));
    });
  });
}

export const peerErrorText = (type: string): string => {
  switch (type) {
    case 'peer-unavailable':
      return 'Partida não encontrada. Quem criou pode ter fechado a página, ou o link está incompleto.';
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
    case 'timeout':
      return 'Não foi possível falar com o serviço que conecta os jogadores. Confira sua internet e tente de novo.';
    case 'browser-incompatible':
      return 'Este navegador não permite conexão direta entre jogadores. Tente Chrome, Edge, Firefox ou Safari atualizados.';
    case 'ice':
      return 'As redes de vocês não deixaram a conexão direta acontecer. Tentem outra rede (por exemplo, os dois no Wi-Fi em vez do 4G).';
    default:
      return 'A conexão falhou. Tente de novo.';
  }
};
