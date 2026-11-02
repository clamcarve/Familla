import type { HostSong } from "../stores/usePlaybackStore";
export const getPlaybackSourceRef = (song: HostSong) => ({
  kind: /^https?:/.test(song.audioUrl || "") ? "online" : "local",
});
