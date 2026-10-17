import { useEffect, useState } from 'react';
import { BASIC_RULES, PIECE_RULES, type RuleEntry } from '../game/rules';
import { btn } from '../lib/ui';
import { RuleDiagramView } from './RuleDiagram';
import { TileIcon } from './Tile';

function Entry({ rule }: { rule: RuleEntry }) {
  return (
    <article className="flex flex-col gap-2 rounded-xl border border-line/60 bg-table-deep/50 p-3 sm:flex-row sm:items-center sm:gap-4">
      {rule.diagram && (
        <div className="flex shrink-0 justify-center sm:w-40">
          <RuleDiagramView diagram={rule.diagram} className="h-32 w-full max-w-[12rem]" />
        </div>
      )}
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
          {rule.bug && <TileIcon bug={rule.bug} color={0} size={26} />}
          {rule.title}
          {rule.expansion && <span className="rounded-full border border-line px-2 py-0.5 text-xs font-normal text-muted">expansão</span>}
        </h3>
        <p className="mt-1 text-sm text-muted">{rule.text}</p>
      </div>
    </article>
  );
}

/** Quick rules reference, opened from the board. */
export function RulesGuide({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'pecas' | 'regras'>('pecas');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-3" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal aria-label="Como jogar" className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-xl border border-line bg-panel shadow-2xl">
        <header className="flex items-center gap-2 border-b border-line/60 p-4">
          <h2 className="flex-1 font-display text-xl font-semibold">Como jogar</h2>
          <button type="button" className={btn.ghost} onClick={onClose}>
            Fechar
          </button>
        </header>
        <div role="tablist" className="flex border-b border-line/60">
          {(
            [
              ['pecas', 'Como cada peça anda'],
              ['regras', 'Regras básicas'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`flex-1 py-2.5 text-sm font-bold ${tab === id ? 'border-b-2 border-honey text-ink' : 'text-muted hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-4">
          {tab === 'pecas' && (
            <p className="text-sm text-muted">
              A peça com contorno claro é a que se move; os hexágonos dourados mostram para onde ela pode ir.
            </p>
          )}
          {(tab === 'pecas' ? PIECE_RULES : BASIC_RULES).map((rule) => (
            <Entry key={rule.id} rule={rule} />
          ))}
        </div>
      </div>
    </div>
  );
}
