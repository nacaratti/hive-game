import { useState } from 'react';
import { useNet } from '../net/store';
import { scanQr } from '../lib/scan';
import { btn, input } from '../lib/ui';

interface Props {
  value: string;
  onChange: (value: string) => void;
}

/** Mobile app: which computer to connect to (typed, scanned or picked from recent hosts). */
export function ServerField({ value, onChange }: Props) {
  const { recentServers, toast } = useNet();
  const [scanning, setScanning] = useState(false);

  const scan = async () => {
    setScanning(true);
    try {
      const text = await scanQr();
      if (text) onChange(text);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-sm text-muted">Computador de quem hospeda</span>
        <div className="flex gap-2">
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="192.168.0.12 ou link recebido"
            className={`${input} min-w-0 flex-1`}
          />
          <button type="button" onClick={scan} disabled={scanning} className={`${btn.secondary} shrink-0 px-3`}>
            {scanning ? 'Lendo…' : 'Ler QR'}
          </button>
        </div>
      </label>
      {recentServers.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {recentServers.map((r) => (
            <button
              key={r.origin}
              type="button"
              onClick={() => onChange(r.origin)}
              className={`rounded-full border px-3 py-1.5 text-xs ${value === r.origin ? 'border-honey text-ink' : 'border-line text-muted'}`}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
