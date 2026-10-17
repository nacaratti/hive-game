import type { BugType } from '@hive/engine';
import type { RoomSettings, TimeControl } from '@hive/protocol';
import { TileIcon } from './Tile';

export const TIME_CONTROLS: { label: string; value: TimeControl }[] = [
  { label: 'Sem relógio', value: null },
  { label: '5 min + 5 s', value: { minutes: 5, increment: 5 } },
  { label: '10 min + 10 s', value: { minutes: 10, increment: 10 } },
  { label: '15 min', value: { minutes: 15, increment: 0 } },
  { label: '20 min + 15 s', value: { minutes: 20, increment: 15 } },
];

export const describeTime = (tc: TimeControl) => TIME_CONTROLS.find((t) => JSON.stringify(t.value) === JSON.stringify(tc))?.label ?? (tc ? `${tc.minutes} min + ${tc.increment} s` : 'Sem relógio');

const EXPANSIONS: { key: keyof RoomSettings['expansions']; bug: BugType; label: string; hint: string }[] = [
  { key: 'mosquito', bug: 'M', label: 'Mosquito', hint: 'Copia o movimento das peças vizinhas' },
  { key: 'ladybug', bug: 'L', label: 'Joaninha', hint: 'Dois passos por cima da colmeia e um para descer' },
  { key: 'pillbug', bug: 'P', label: 'Tatuzinho', hint: 'Pode carregar uma peça vizinha por cima de si' },
];

interface Props {
  value: RoomSettings;
  onChange: (v: RoomSettings) => void;
  disabled?: boolean;
  showName?: boolean;
  showPassword?: boolean;
  /** Clock and color options only make sense for online rooms. */
  showClock?: boolean;
}

export function SettingsForm({ value, onChange, disabled, showName = true, showPassword = true, showClock = true }: Props) {
  const set = <K extends keyof RoomSettings>(k: K, v: RoomSettings[K]) => onChange({ ...value, [k]: v });
  return (
    <fieldset disabled={disabled} className="flex flex-col gap-4 disabled:opacity-80">
      {showName && (
        <label className="flex flex-col gap-1">
          <span className="text-sm text-muted">Nome da sala</span>
          <input
            value={value.name}
            maxLength={40}
            onChange={(e) => set('name', e.target.value)}
            className="rounded-md border border-line bg-table-deep px-3 py-2 outline-none focus:border-honey"
          />
        </label>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-sm text-muted">Expansões</span>
        {EXPANSIONS.map((x) => (
          <label key={x.key} className="flex cursor-pointer items-center gap-3 rounded-md px-1 py-1 hover:bg-panel-hi/60">
            <input
              type="checkbox"
              checked={value.expansions[x.key]}
              onChange={(e) => set('expansions', { ...value.expansions, [x.key]: e.target.checked })}
              className="size-4 accent-[#e8a33d]"
            />
            <TileIcon bug={x.bug} color={0} size={30} />
            <span>
              <span className="font-bold">{x.label}</span>
              <span className="block text-xs text-muted">{x.hint}</span>
            </span>
          </label>
        ))}
      </div>

      {showClock && (
      <label className="flex flex-col gap-1">
        <span className="text-sm text-muted">Relógio</span>
        <select
          value={TIME_CONTROLS.findIndex((t) => JSON.stringify(t.value) === JSON.stringify(value.timeControl))}
          onChange={(e) => set('timeControl', TIME_CONTROLS[Number(e.target.value)].value)}
          className="rounded-md border border-line bg-table-deep px-3 py-2 outline-none focus:border-honey"
        >
          {TIME_CONTROLS.map((t, i) => (
            <option key={t.label} value={i}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      )}

      {showClock && (
      <label className="flex cursor-pointer items-center gap-3">
        <input type="checkbox" checked={value.randomColors} onChange={(e) => set('randomColors', e.target.checked)} className="size-4 accent-[#e8a33d]" />
        <span>Sortear quem joga com as brancas</span>
      </label>
      )}

      {showPassword && (
        <label className="flex flex-col gap-1">
          <span className="text-sm text-muted">Senha (opcional)</span>
          <input
            type="password"
            value={value.password ?? ''}
            maxLength={40}
            autoComplete="new-password"
            onChange={(e) => set('password', e.target.value || undefined)}
            className="rounded-md border border-line bg-table-deep px-3 py-2 outline-none focus:border-honey"
          />
          <span className="text-xs text-muted">Recomendado ao compartilhar a sala pela internet.</span>
        </label>
      )}
    </fieldset>
  );
}
