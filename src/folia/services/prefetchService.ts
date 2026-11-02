import type { HostSong } from "../stores/usePlaybackStore";
// 播放地址由播放器提供
export const getPrefetchedData = (song: HostSong) =>
  song.audioUrl ? { audioUrl: song.audioUrl, audioUrlFetchedAt: Date.now() } : null;
export const isUrlValid = (_fetchedAt: number): boolean => true;
