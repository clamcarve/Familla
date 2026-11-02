import { useSyncExternalStore } from "react";
import { DEFAULT_LYRIC_RENDER_QUALITY } from "../utils/lyricRenderQuality";
import { DEFAULT_SMART_BEAT_SETTINGS } from "../types";

// 智能节拍和当前样式由播放器写入
let state = {
  smartBeat: DEFAULT_SMART_BEAT_SETTINGS,
  lyricRenderQuality: DEFAULT_LYRIC_RENDER_QUALITY,
  visualizerMode: "classic",
  visualizerBackgroundMode: "common",
} as Record<string, any>;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const setVisualizerSettings = (patch: Record<string, unknown>): void => {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
};

export const useVisualizerSettingsStore = Object.assign(
  <T,>(selector: (value: Record<string, any>) => T): T =>
    useSyncExternalStore(subscribe, () => selector(state)),
  { subscribe, getState: () => state },
);
