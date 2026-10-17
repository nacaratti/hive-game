import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@hive/protocol';

interface MoveListProps {
  moves: string[];
  /** Ply being reviewed, or null when following the live game. */
  reviewPly: number | null;
  onReview: (ply: number | null) => void;
}

export function MoveList({ moves, reviewPly, onReview }: MoveListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = listRef.current;
    if (el && reviewPly === null) el.scrollTop = el.scrollHeight;
  }, [moves.length, reviewPly]);

  const rows = [];
  for (let i = 0; i < moves.length; i += 2) rows.push({ n: i / 2 + 1, w: i, b: i + 1 });

  const cell = (ply: number) => {
    if (ply >= moves.length) return <span />;
    const current = reviewPly === null ? ply === moves.length - 1 : ply === reviewPly - 1;
    return (
      <button
        type="button"
        onClick={() => onReview(ply + 1 === moves.length ? null : ply + 1)}
        className={`truncate rounded px-1.5 py-0.5 text-left font-mono text-[13px] ${current ? 'bg-honey text-table' : 'hover:bg-panel-hi'}`}
      >
        {moves[ply]}
      </button>
    );
  };

  const step = (delta: number) => {
    const at = reviewPly ?? moves.length;
    const next = Math.max(0, Math.min(moves.length, at + delta));
    onReview(next === moves.length ? null : next);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {moves.length === 0 && <p className="px-2 text-sm text-muted">Os lances aparecem aqui.</p>}
        <div className="grid grid-cols-[2rem_1fr_1fr] gap-x-1 gap-y-0.5">
          {rows.map((r) => (
            <div key={r.n} className="contents">
              <span className="py-0.5 text-right text-xs leading-6 text-muted">{r.n}.</span>
              {cell(r.w)}
              {cell(r.b)}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1 border-t border-line/60 p-2">
        <button type="button" className="rounded px-2 py-1 hover:bg-panel-hi" onClick={() => onReview(0)} aria-label="Início">
          ⏮
        </button>
        <button type="button" className="rounded px-2 py-1 hover:bg-panel-hi" onClick={() => step(-1)} aria-label="Lance anterior">
          ◀
        </button>
        <button type="button" className="rounded px-2 py-1 hover:bg-panel-hi" onClick={() => step(1)} aria-label="Próximo lance">
          ▶
        </button>
        <button type="button" className="rounded px-2 py-1 hover:bg-panel-hi" onClick={() => onReview(null)} aria-label="Ao vivo">
          ⏭
        </button>
        {reviewPly !== null && <span className="ml-auto text-xs text-honey">Revendo lance {reviewPly}</span>}
      </div>
    </div>
  );
}

interface ChatProps {
  messages: ChatMessage[];
  myId: string | null;
  onSend: (text: string) => void;
}

export function Chat({ messages, myId, onSend }: ChatProps) {
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={listRef} className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2 text-sm">
        {messages.map((m) =>
          m.system ? (
            <p key={m.id} className="text-xs text-muted">
              {m.text}
            </p>
          ) : (
            <p key={m.id}>
              <span className={`font-bold ${m.fromId === myId ? 'text-honey' : 'text-ink'}`}>{m.from}:</span>{' '}
              <span className="break-words">{m.text}</span>
            </p>
          ),
        )}
      </div>
      <form
        className="flex gap-1 border-t border-line/60 p-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          onSend(text.trim());
          setText('');
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={300}
          placeholder="Mensagem"
          aria-label="Mensagem"
          className="min-w-0 flex-1 rounded-md border border-line bg-table-deep px-2 py-1.5 text-sm outline-none focus:border-honey"
        />
        <button type="submit" className="rounded-md bg-panel-hi px-3 text-sm font-bold hover:bg-line">
          Enviar
        </button>
      </form>
    </div>
  );
}

export function Tabs({ tabs }: { tabs: { id: string; label: string; content: React.ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" className="flex border-b border-line/60">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={active === t.id}
            onClick={() => setActive(t.id)}
            className={`flex-1 py-2 text-sm font-bold ${active === t.id ? 'border-b-2 border-honey text-ink' : 'text-muted hover:text-ink'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" hidden={active !== t.id} className={active === t.id ? 'flex min-h-0 flex-1 flex-col' : ''}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
