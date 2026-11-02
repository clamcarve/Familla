import { useSyncExternalStore } from "react";

export type HostSong = {
  id: number | string;
  name?: string;
  durationMs?: number;
  audioUrl?: string;
  localPath?: string;
};

// 当前歌曲由播放器写入
let state: { song: HostSong | null; playing: boolean } = { song: null, playing: false };
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const setPlaybackSong = (song: HostSong | null, playing: boolean): void => {
  if (state.song?.id === song?.id && state.song?.audioUrl === song?.audioUrl && state.playing === playing) return;
  // 同一首歌只更新地址，分析键不变
  state = { song: state.song?.id === song?.id && state.song ? Object.assign(state.song, song) : song, playing };
  listeners.forEach((listener) => listener());
};

export const selectDisplaySong = (value: typeof state) => value.song;
export const selectDisplayPlayerState = (value: typeof state): unknown => (value.playing ? "PLAYING" : "PAUSED");
export const usePlaybackStore = Object.assign(
  <T,>(selector: (value: typeof state) => T): T => useSyncExternalStore(subscribe, () => selector(state)),
  { subscribe, getState: () => state },
);
