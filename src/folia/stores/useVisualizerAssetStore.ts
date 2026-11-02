const state = { storedCappellaEmojiPack: [] as any[], storedCappellaAvatarPack: [] as any[] } as Record<string, any>;
export const useVisualizerAssetStore = Object.assign(
  <T,>(selector: (value: Record<string, any>) => T): T => selector(state),
  { subscribe: () => () => {}, getState: () => state, setState: (_patch: unknown) => {} },
);
