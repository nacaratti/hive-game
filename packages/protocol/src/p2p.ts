import { z } from 'zod';

/**
 * Browser-to-browser games (web version): the host's browser is authoritative,
 * the guest sends only moves, exactly like the client↔server protocol.
 */

export const LinkHello = z.object({
  t: z.literal('hello'),
  name: z.string().trim().min(1).max(24).regex(/^[^<>]+$/),
  /** Random id kept in the guest's browser, so a reload resumes the same seat. */
  guestId: z.string().min(8).max(64),
});

export const LinkMove = z.object({
  t: z.literal('move'),
  move: z.string().min(1).max(40),
  ply: z.number().int().min(0),
});

export const LinkResign = z.object({ t: z.literal('resign') });
export const LinkRematch = z.object({ t: z.literal('rematch') });

export const GuestMessage = z.discriminatedUnion('t', [LinkHello, LinkMove, LinkResign, LinkRematch]);
export type GuestMessage = z.infer<typeof GuestMessage>;

export type LinkSide = 'host' | 'guest';
export type LinkEndReason = 'queen' | 'draw' | 'resign';

export interface LinkState {
  t: 'state';
  gameString: string;
  result: 'InProgress' | 'WhiteWins' | 'BlackWins' | 'Draw';
  endReason: LinkEndReason | null;
  hostName: string;
  hostColor: 'white' | 'black';
  guestName: string | null;
  guestConnected: boolean;
  rematchBy: LinkSide[];
}

export type HostMessage = LinkState | { t: 'error'; error: string } | { t: 'full' };
