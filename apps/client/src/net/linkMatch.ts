import { Hive, IllegalMoveError, type Move } from '@hive/engine';
import type { Expansions, LinkEndReason, LinkSide, LinkState } from '@hive/protocol';

export interface LinkMatchData {
  gameString: string;
  expansions: Expansions;
  hostName: string;
  hostColor: 'white' | 'black';
  guestId: string | null;
  guestName: string | null;
  endReason: LinkEndReason | null;
  resignedBy: LinkSide | null;
  rematchBy: LinkSide[];
}

/**
 * The authoritative game kept by the host's browser in a link match.
 * Pure (no network), so it can be tested and saved to localStorage.
 */
export class LinkMatch {
  game: Hive;
  guestId: string | null = null;
  guestName: string | null = null;
  endReason: LinkEndReason | null = null;
  private resignedBy: LinkSide | null = null;
  private rematchBy = new Set<LinkSide>();

  constructor(
    readonly expansions: Expansions,
    public hostName: string,
    public hostColor: 'white' | 'black',
    gameString?: string,
  ) {
    this.game = gameString ? Hive.fromGameString(gameString) : new Hive(expansions);
  }

  static restore(d: LinkMatchData): LinkMatch {
    const m = new LinkMatch(d.expansions, d.hostName, d.hostColor, d.gameString);
    m.guestId = d.guestId;
    m.guestName = d.guestName;
    m.endReason = d.endReason;
    m.resignedBy = d.resignedBy;
    m.rematchBy = new Set(d.rematchBy);
    return m;
  }

  toJSON(): LinkMatchData {
    return {
      gameString: this.game.toGameString(),
      expansions: this.expansions,
      hostName: this.hostName,
      hostColor: this.hostColor,
      guestId: this.guestId,
      guestName: this.guestName,
      endReason: this.endReason,
      resignedBy: this.resignedBy,
      rematchBy: [...this.rematchBy],
    };
  }

  get over(): boolean {
    return this.endReason !== null;
  }

  colorOf(side: LinkSide): 'white' | 'black' {
    return side === 'host' ? this.hostColor : this.hostColor === 'white' ? 'black' : 'white';
  }

  /** Seats a guest. Returns false when another guest already owns the seat. */
  hello(guestId: string, name: string): boolean {
    if (this.guestId && this.guestId !== guestId) return false;
    this.guestId = guestId;
    this.guestName = name;
    return true;
  }

  /** Applies a move by `side`; returns an error message or null. */
  play(side: LinkSide, move: string | Move, ply: number): string | null {
    if (this.over) return 'A partida já terminou.';
    if (side === 'guest' && !this.guestId) return 'Convidado não identificado.';
    if (ply !== this.game.ply) return 'Lance desatualizado.';
    const turn = this.game.turnColor === 0 ? 'white' : 'black';
    if (this.colorOf(side) !== turn) return 'Não é a sua vez.';
    try {
      this.game.play(move);
    } catch (e) {
      if (e instanceof IllegalMoveError) return 'Lance ilegal.';
      throw e;
    }
    if (this.game.isOver) this.endReason = this.game.result === 'Draw' ? 'draw' : 'queen';
    return null;
  }

  resign(side: LinkSide): void {
    if (this.over) return;
    this.endReason = 'resign';
    this.resignedBy = side;
  }

  /** Records a rematch request; starts the new game (colors swapped) once both asked. */
  rematch(side: LinkSide): boolean {
    if (!this.over) return false;
    this.rematchBy.add(side);
    if (!this.rematchBy.has('host') || !this.rematchBy.has('guest')) return false;
    this.restart(this.hostColor === 'white' ? 'black' : 'white');
    return true;
  }

  restart(hostColor: 'white' | 'black'): void {
    this.hostColor = hostColor;
    this.game = new Hive(this.expansions);
    this.endReason = null;
    this.resignedBy = null;
    this.rematchBy.clear();
  }

  get result(): LinkState['result'] {
    if (this.endReason === 'resign') {
      return this.colorOf(this.resignedBy!) === 'white' ? 'BlackWins' : 'WhiteWins';
    }
    return this.game.result;
  }

  state(guestConnected: boolean): LinkState {
    return {
      t: 'state',
      gameString: this.game.toGameString(),
      result: this.result,
      endReason: this.endReason,
      hostName: this.hostName,
      hostColor: this.hostColor,
      guestName: this.guestName,
      guestConnected,
      rematchBy: [...this.rematchBy],
    };
  }
}
