import { create } from 'zustand';

interface AppState {
  mode: 'online' | 'local' | 'link';
  /** Which opponent the local setup starts with. */
  localPreset: 'human' | 'bot';
  startLocal: (preset?: 'human' | 'bot') => void;
  exitLocal: () => void;
  startLink: () => void;
  exitLink: () => void;
}

const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
/** Opened from a match link (?p=) or the host reloading its page (?anfitriao=). */
const openedLink = params.has('p') || params.has('anfitriao');

export const useApp = create<AppState>((set) => ({
  mode: openedLink ? 'link' : 'online',
  localPreset: 'human',
  startLocal: (preset = 'human') => set({ mode: 'local', localPreset: preset }),
  exitLocal: () => set({ mode: 'online' }),
  startLink: () => set({ mode: 'link' }),
  exitLink: () => {
    history.replaceState(null, '', location.pathname);
    set({ mode: 'online' });
  },
}));
