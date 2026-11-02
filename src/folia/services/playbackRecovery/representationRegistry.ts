const songKey = (song: { id?: unknown }) => `song-${song.id}`;
export const getPlaybackAnalysisKey = (song: { id?: unknown }): string => songKey(song);
export const getPlaybackAnalysisTarget = (song: { id?: unknown }) => ({
  key: songKey(song),
  representation: null,
});
