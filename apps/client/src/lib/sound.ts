let ctx: AudioContext | null = null;
let muted = false;

try {
  muted = localStorage.getItem('hive.muted') === '1';
} catch {
  /* ignore */
}

export const isMuted = () => muted;
export const setMuted = (value: boolean) => {
  muted = value;
  try {
    localStorage.setItem('hive.muted', value ? '1' : '0');
  } catch {
    /* ignore */
  }
};

/** Short wooden "tock" synthesized on the fly (no audio assets needed offline). */
export function playTock(kind: 'place' | 'move' | 'end' = 'place') {
  if (muted) return;
  try {
    ctx ??= new AudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const base = kind === 'end' ? 330 : kind === 'move' ? 520 : 420;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * 0.55, now + 0.09);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.35, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === 'end' ? 0.5 : 0.12));
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.55);
  } catch {
    /* audio unavailable */
  }
}
