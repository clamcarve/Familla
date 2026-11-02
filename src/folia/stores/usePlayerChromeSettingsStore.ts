const state = { hidePlayerProgressBar: true } as Record<string, any>;
export const usePlayerChromeSettingsStore = Object.assign(
  <T,>(selector: (value: Record<string, any>) => T): T => selector(state),
  { subscribe: () => () => {}, getState: () => state },
);
