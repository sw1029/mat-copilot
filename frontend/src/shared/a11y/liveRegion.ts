import { create } from 'zustand';

// TRD/front.md §9.4 — aria-live 공지. polite/assertive 이중 영역.

interface LiveRegionState {
  politeMessage: string;
  assertiveMessage: string;
  announce(message: string, politeness?: 'polite' | 'assertive'): void;
}

export const useLiveRegionStore = create<LiveRegionState>((set) => ({
  politeMessage: '',
  assertiveMessage: '',
  announce(message, politeness = 'polite') {
    if (politeness === 'assertive') {
      set({ assertiveMessage: '' });
      requestAnimationFrame(() => set({ assertiveMessage: message }));
    } else {
      set({ politeMessage: '' });
      requestAnimationFrame(() => set({ politeMessage: message }));
    }
  },
}));

export function announce(message: string, politeness: 'polite' | 'assertive' = 'polite'): void {
  useLiveRegionStore.getState().announce(message, politeness);
}
