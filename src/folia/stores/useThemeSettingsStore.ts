const state = { staticMode: false };
export const useThemeSettingsStore = <T,>(selector: (value: typeof state) => T): T => selector(state);
