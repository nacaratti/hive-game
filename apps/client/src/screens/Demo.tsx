import { useMemo } from 'react';
import { Hive } from '@hive/engine';
import { PlayerBar, statusText, type SeatInfo } from '../components/PlayerBar';
import { MoveList } from '../components/SidePanel';
import { Table } from '../components/Table';

/** A mid-game position, used for screenshots on the download page (`/?demo`). */
const DEMO_GAME =
  String.raw`Base+MLP;InProgress;White[12];wG1;bB1 wG1\;wQ -wG1;bQ bB1-;wQ \wG1;bS1 /bB1;wP /wQ;bM -bS1;wQ wG1/;bA1 bM\;wG2 \wP;bB2 bA1\;wA1 wQ/;bM \wA1;wA2 -wG2;bA2 bA1-;wM wA1-;bA3 bB2-;wA2 wG2/;bM wA2-;wA3 /wP;bS2 /bA1`;

const SEATS: Record<'white' | 'black', SeatInfo> = {
  white: { name: 'Ana', isMe: true },
  black: { name: 'Bruno' },
};

export function Demo() {
  const game = useMemo(() => Hive.fromGameString(DEMO_GAME), []);
  return (
    <div className="h-full">
      <Table
        game={game}
        controls={[0]}
        onMove={() => undefined}
        header={<PlayerBar game={game} seats={SEATS} clock={{ white: 412_000, black: 388_000, running: null, serverTime: 0 }} status={statusText(game, SEATS)} />}
        side={<MoveList moves={game.moveHistory} reviewPly={null} onReview={() => undefined} />}
      />
    </div>
  );
}
