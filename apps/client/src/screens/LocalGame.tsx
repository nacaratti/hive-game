import { useEffect, useMemo, useRef, useState } from 'react';
import { Hive, type Color, type Move } from '@hive/engine';
import { BOT_LEVELS, type BotLevel } from '@hive/ai';
import type { Expansions } from '@hive/protocol';
import { PlayerBar, statusText, type SeatInfo } from '../components/PlayerBar';
import { SettingsForm } from '../components/SettingsForm';
import { MoveList } from '../components/SidePanel';
import { Table } from '../components/Table';
import { botMove } from '../game/bot';
import { positionAt } from '../game/replay';
import { btn } from '../lib/ui';
import { useApp } from '../app-store';
import { Modal } from './Lobby';

interface Setup {
  expansions: Expansions;
  opponent: 'human' | BotLevel;
  humanColor: 'white' | 'black' | 'random';
}

const levelLabel = (l: BotLevel) => BOT_LEVELS.find((b) => b.id === l)!.label.toLowerCase();

/** Games on this computer: two people sharing the screen, or one person against the bot. */
export function LocalGame() {
  const exit = useApp((s) => s.exitLocal);
  const preset = useApp((s) => s.localPreset);
  const [draft, setDraft] = useState<Setup>({
    expansions: { mosquito: true, ladybug: true, pillbug: true },
    opponent: preset === 'bot' ? 'medio' : 'human',
    humanColor: 'white',
  });
  const [setup, setSetup] = useState<Setup>(draft);
  const [botColor, setBotColor] = useState<Color | null>(null);
  const [showSetup, setShowSetup] = useState(true);
  const [game, setGame] = useState(() => new Hive(draft.expansions));
  const [reviewPly, setReviewPly] = useState<number | null>(null);
  const [thinking, setThinking] = useState(false);
  const generation = useRef(0);

  const shown = useMemo(() => (reviewPly === null ? game : positionAt(game.toGameString(), reviewPly)), [game, reviewPly]);

  // The bot plays whenever it is its turn.
  useEffect(() => {
    if (botColor === null || game.isOver || game.turnColor !== botColor || showSetup) return;
    const gen = generation.current;
    const level = setup.opponent as BotLevel;
    setThinking(true);
    botMove(game.toGameString(), level)
      .then((move) => {
        if (gen !== generation.current) return;
        setGame((g) => {
          if (g !== game) return g;
          const next = g.clone();
          next.play(move);
          return next;
        });
      })
      .catch((e) => console.error('bot', e))
      .finally(() => gen === generation.current && setThinking(false));
  }, [game, botColor, setup.opponent, showSetup]);

  const play = (m: Move) => {
    const next = game.clone();
    next.play(m);
    setGame(next);
  };

  const undo = () => {
    generation.current++;
    setThinking(false);
    const next = game.clone();
    // Against the bot, take back the bot's reply and your own move.
    const steps = botColor === null ? 1 : game.turnColor === botColor ? 1 : 2;
    for (let i = 0; i < steps && next.canUndo; i++) next.undo();
    setReviewPly(null);
    setGame(next);
  };

  const start = () => {
    generation.current++;
    setThinking(false);
    const vsBot = draft.opponent !== 'human';
    const human: Color = draft.humanColor === 'random' ? (Math.random() < 0.5 ? 0 : 1) : draft.humanColor === 'white' ? 0 : 1;
    setBotColor(vsBot ? ((1 - human) as Color) : null);
    setSetup(draft);
    setGame(new Hive(draft.expansions));
    setReviewPly(null);
    setShowSetup(false);
  };

  const botName = setup.opponent === 'human' ? '' : `Computador (${levelLabel(setup.opponent)})`;
  const seats: Record<'white' | 'black', SeatInfo> =
    botColor === null
      ? { white: { name: 'Brancas' }, black: { name: 'Pretas' } }
      : botColor === 1
        ? { white: { name: 'Você', isMe: true }, black: { name: botName, isBot: true } }
        : { white: { name: botName, isBot: true }, black: { name: 'Você', isMe: true } };

  let status = statusText(shown, seats);
  if (botColor === null) status = status.replace('Vez de ', 'Vez das ');
  if (thinking && reviewPly === null) status = 'Computador pensando…';

  const controls: Color[] = botColor === null ? [0, 1] : [(1 - botColor) as Color];

  return (
    <div className="h-full">
      <Table
        game={shown}
        controls={controls}
        frozen={reviewPly !== null || thinking}
        sideLabel="Lances"
        onMove={play}
        header={
          <PlayerBar
            game={shown}
            seats={seats}
            status={reviewPly !== null ? `Revendo lance ${reviewPly}` : status}
            actions={
              <button type="button" className={`${btn.ghost} ml-1`} onClick={exit}>
                Sair
              </button>
            }
          />
        }
        side={
          <>
            <MoveList moves={game.moveHistory} reviewPly={reviewPly} onReview={setReviewPly} />
            <div className="flex gap-2 border-t border-line/60 p-2">
              <button type="button" className={`${btn.secondary} flex-1 text-sm`} disabled={!game.canUndo} onClick={undo}>
                Desfazer
              </button>
              <button type="button" className={`${btn.secondary} flex-1 text-sm`} onClick={() => setShowSetup(true)}>
                Nova partida
              </button>
            </div>
          </>
        }
        overlay={
          game.isOver && reviewPly === null ? (
            <div className="absolute inset-x-0 bottom-6 z-20 mx-auto w-[min(24rem,calc(100%-2rem))] rounded-xl border border-honey/70 bg-panel p-5 text-center shadow-2xl">
              <p className="font-display text-2xl font-bold">{status === 'Você venceu' ? 'Você venceu!' : status}</p>
              <div className="mt-4 flex justify-center gap-2">
                <button type="button" className={btn.primary} onClick={start}>
                  Jogar de novo
                </button>
                <button type="button" className={btn.secondary} onClick={() => setShowSetup(true)}>
                  Mudar opções
                </button>
              </div>
            </div>
          ) : null
        }
      />
      {showSetup && (
        <Modal title="Partida neste computador" onClose={() => setShowSetup(false)}>
          <div className="mb-5 flex flex-col gap-4">
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1 text-sm text-muted">Adversário</legend>
              <label className="flex cursor-pointer items-center gap-3 rounded-md px-1 py-1 hover:bg-panel-hi/60">
                <input
                  type="radio"
                  name="opponent"
                  checked={draft.opponent === 'human'}
                  onChange={() => setDraft({ ...draft, opponent: 'human' })}
                  className="accent-[#e8a33d]"
                />
                <span>
                  <span className="font-bold">Outra pessoa</span>
                  <span className="block text-xs text-muted">Vocês se revezam na mesma tela.</span>
                </span>
              </label>
              {BOT_LEVELS.map((l) => (
                <label key={l.id} className="flex cursor-pointer items-center gap-3 rounded-md px-1 py-1 hover:bg-panel-hi/60">
                  <input
                    type="radio"
                    name="opponent"
                    checked={draft.opponent === l.id}
                    onChange={() => setDraft({ ...draft, opponent: l.id })}
                    className="accent-[#e8a33d]"
                  />
                  <span>
                    <span className="font-bold">Computador {l.label.toLowerCase()}</span>
                    <span className="block text-xs text-muted">{l.description}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            {draft.opponent !== 'human' && (
              <label className="flex flex-col gap-1">
                <span className="text-sm text-muted">Você joga com</span>
                <select
                  value={draft.humanColor}
                  onChange={(e) => setDraft({ ...draft, humanColor: e.target.value as Setup['humanColor'] })}
                  className="rounded-md border border-line bg-table-deep px-3 py-2 outline-none focus:border-honey"
                >
                  <option value="white">Brancas (começa)</option>
                  <option value="black">Pretas</option>
                  <option value="random">Sortear</option>
                </select>
              </label>
            )}
          </div>
          <SettingsForm
            value={{ name: 'Local', expansions: draft.expansions, timeControl: null, randomColors: false }}
            onChange={(v) => setDraft({ ...draft, expansions: v.expansions })}
            showName={false}
            showPassword={false}
            showClock={false}
          />
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className={btn.ghost} onClick={exit}>
              Voltar
            </button>
            <button type="button" className={btn.primary} onClick={start}>
              Começar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
