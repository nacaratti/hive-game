export interface Player {
  id: string;
  /** Secret used to resume the session after a refresh or network drop. */
  token: string;
  name: string;
  socketId: string | null;
  roomId: string | null;
  connected: boolean;
  isBot?: boolean;
  botLevel?: 'facil' | 'medio' | 'dificil';
  /** Pending removal/abandon timer while disconnected. */
  goneTimer?: NodeJS.Timeout;
}
