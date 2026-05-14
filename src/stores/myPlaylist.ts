import type { MyPlaylistType, SongType } from "@/types/main";
import { cloneDeep } from "lodash-es";
import localforage from "localforage";

const myPlaylistDB = localforage.createInstance({
  name: "my-playlist-data",
  description: "My playlist data of the application",
  storeName: "my-playlist",
});

const generateMyPlaylistId = (): number => {
  const timestamp = Date.now().toString();
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return parseInt(timestamp + random, 10);
};

const normalizeMyPlaylistId = (value: unknown): number => {
  const text = String(value || "").trim();
  if (/^\d{16}$/.test(text)) {
    return parseInt(text, 10);
  }
  return generateMyPlaylistId();
};

const normalizeMyPlaylist = (playlist: Partial<MyPlaylistType>): MyPlaylistType => {
  const now = Date.now();
  return {
    id: normalizeMyPlaylistId(playlist.id),
    name: String(playlist.name || "未命名歌单").trim() || "未命名歌单",
    description: playlist.description ? String(playlist.description) : undefined,
    cover: playlist.cover ? String(playlist.cover) : undefined,
    songs: Array.isArray(playlist.songs) ? cloneDeep(playlist.songs) : [],
    createTime: Number(playlist.createTime) || now,
    updateTime: Number(playlist.updateTime) || now,
  };
};

const createMyPlaylistStore = () => {
  const myPlaylists = ref<MyPlaylistType[]>([]);
  const isInitialized = ref(false);

  const readMyPlaylists = async (): Promise<MyPlaylistType[]> => {
    try {
      const result = await myPlaylistDB.getItem("my-playlists");
      myPlaylists.value = ((result as MyPlaylistType[]) || []).map((playlist) =>
        normalizeMyPlaylist({
          ...playlist,
          songs: Array.isArray(playlist.songs) ? playlist.songs : [],
        }),
      );
      isInitialized.value = true;
      return myPlaylists.value;
    } catch (error) {
      console.error("Error reading my playlists:", error);
      throw error;
    }
  };

  const saveMyPlaylists = async () => {
    try {
      await myPlaylistDB.setItem("my-playlists", cloneDeep(myPlaylists.value));
    } catch (error) {
      console.error("Error saving my playlists:", error);
      throw error;
    }
  };

  const createMyPlaylist = async (name: string, description?: string): Promise<MyPlaylistType> => {
    const now = Date.now();
    const newPlaylist: MyPlaylistType = {
      id: generateMyPlaylistId(),
      name,
      description,
      songs: [],
      createTime: now,
      updateTime: now,
    };
    myPlaylists.value.push(newPlaylist);
    await saveMyPlaylists();
    return newPlaylist;
  };

  const updateMyPlaylist = async (
    id: number,
    data: Partial<Pick<MyPlaylistType, "name" | "description">>,
  ): Promise<boolean> => {
    const index = myPlaylists.value.findIndex((playlist) => playlist.id === id);
    if (index === -1) return false;
    const playlist = myPlaylists.value[index];
    if (data.name !== undefined) playlist.name = data.name;
    if (data.description !== undefined) playlist.description = data.description;
    playlist.updateTime = Date.now();
    await saveMyPlaylists();
    return true;
  };

  const deleteMyPlaylist = async (id: number): Promise<boolean> => {
    const index = myPlaylists.value.findIndex((playlist) => playlist.id === id);
    if (index === -1) return false;
    myPlaylists.value.splice(index, 1);
    await saveMyPlaylists();
    return true;
  };

  const buildSongKey = (song: SongType): string => {
    const platform = song.platform || "netease";
    const trackId = song.platformSongId || String(song.id || "");
    return `${platform}:${trackId}`;
  };

  const updateMyPlaylistCover = (playlist: MyPlaylistType) => {
    const firstSong = playlist.songs[0];
    playlist.cover = firstSong?.cover || firstSong?.coverSize?.m || "/images/album.jpg?asset";
  };

  const replaceMyPlaylists = async (
    playlists: Partial<MyPlaylistType>[],
  ): Promise<MyPlaylistType[]> => {
    const normalized = (Array.isArray(playlists) ? playlists : []).map(normalizeMyPlaylist);
    normalized.forEach((playlist) => {
      if (!playlist.cover) updateMyPlaylistCover(playlist);
    });
    myPlaylists.value = normalized;
    await saveMyPlaylists();
    isInitialized.value = true;
    return myPlaylists.value;
  };

  const addSongsToMyPlaylist = async (
    playlistId: number,
    songs: SongType[],
  ): Promise<{ success: boolean; addedCount: number }> => {
    const playlist = myPlaylists.value.find((item) => item.id === playlistId);
    if (!playlist) return { success: false, addedCount: 0 };

    const existingKeys = new Set(playlist.songs.map((song) => buildSongKey(song)));
    const newSongs = songs.filter((song) => !existingKeys.has(buildSongKey(song)));
    if (newSongs.length === 0) return { success: true, addedCount: 0 };

    playlist.songs.unshift(...cloneDeep(newSongs));
    playlist.updateTime = Date.now();
    updateMyPlaylistCover(playlist);
    await saveMyPlaylists();
    return { success: true, addedCount: newSongs.length };
  };

  const removeSongsFromMyPlaylist = async (
    playlistId: number,
    songKeys: string[],
  ): Promise<boolean> => {
    const playlist = myPlaylists.value.find((item) => item.id === playlistId);
    if (!playlist) return false;
    const keySet = new Set(songKeys);
    playlist.songs = playlist.songs.filter((song) => !keySet.has(buildSongKey(song)));
    playlist.updateTime = Date.now();
    updateMyPlaylistCover(playlist);
    await saveMyPlaylists();
    return true;
  };

  const reorderSongsInMyPlaylist = async (
    playlistId: number,
    fromIndex: number,
    toIndex: number,
  ): Promise<boolean> => {
    const playlist = myPlaylists.value.find((item) => item.id === playlistId);
    if (!playlist) return false;
    if (fromIndex < 0 || fromIndex >= playlist.songs.length) return false;
    if (toIndex < 0 || toIndex >= playlist.songs.length) return false;
    if (fromIndex === toIndex) return true;

    const [movedSong] = playlist.songs.splice(fromIndex, 1);
    playlist.songs.splice(toIndex, 0, movedSong);
    playlist.updateTime = Date.now();
    updateMyPlaylistCover(playlist);
    await saveMyPlaylists();
    return true;
  };

  const getMyPlaylistDetail = (id: number): MyPlaylistType | null => {
    return myPlaylists.value.find((playlist) => playlist.id === id) || null;
  };

  const isMyPlaylist = (id: number | string | undefined | null): boolean => {
    if (!id) return false;
    const strId = id.toString();
    if (strId.length !== 16) return false;
    return myPlaylists.value.some((playlist) => playlist.id.toString() === strId);
  };

  readMyPlaylists();

  return reactive({
    myPlaylists,
    isInitialized,
    readMyPlaylists,
    createMyPlaylist,
    updateMyPlaylist,
    deleteMyPlaylist,
    replaceMyPlaylists,
    addSongsToMyPlaylist,
    removeSongsFromMyPlaylist,
    reorderSongsInMyPlaylist,
    getMyPlaylistDetail,
    isMyPlaylist,
    buildSongKey,
  });
};

const myPlaylistStoreInstance = createMyPlaylistStore();

export const useMyPlaylistStore = () => {
  return myPlaylistStoreInstance;
};
