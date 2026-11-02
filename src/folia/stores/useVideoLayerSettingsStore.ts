// 不接入视频图层
const state = { enabled: false, url: "", opacity: 1, fit: "cover", localFileUrl: null } as Record<string, any>;
export const ensureVideoLayerFileRestored = (): void => {};
export const useVideoLayerSettingsStore = Object.assign(
  <T,>(selector: (value: Record<string, any>) => T): T => selector(state),
  { subscribe: () => () => {}, getState: () => state },
);
