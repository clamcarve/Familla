import axios, { AxiosError } from "axios";
import type { MusicPlatformType, MyPlaylistType, SongType } from "@/types/main";
import { CLOUD_API_BASE_URL } from "./base";

const THIRD_PARTY_ID_SEED = 2000000000;
const SUPPORTED_PLATFORMS = new Set<MusicPlatformType>(["netease", "qq", "kuwo", "kugou"]);
const FILTERED_SOURCES = new Set(["bili", "bilibili", "bili_fav", "local", "local_music"]);

export type CloudUserInfo = {
  id: number;
  email: string;
  iswap: number;
  created_at: string;
};

export type CloudLoginResponse = {
  access_token: string;
  token_type: string;
  user?: CloudUserInfo | null;
};

export type CloudPlaylistSnapshot = {
  playlists: MyPlaylistType[];
};

export type CloudPopup = {
  id: number;
  title?: string | null;
  content_md: string;
  enabled: boolean;
  updated_at: string;
};

type CloudTrackPayload = {
  id: string;
  source: string;
  title: string;
  artist: string;
  album: string;
  coverUrl: string;
  durationMs: number;
  extra?: Record<string, any> | null;
  md5?: string | null;
  addedAtMs?: number | null;
  lyrics?: string | null;
  streamUrl?: string | null;
  downloadQuality?: string | null;
};

type CloudPlaylistPayload = {
  id: string;
  name: string;
  description?: string | null;
  coverUrl?: string | null;
  displayCoverUrl?: string | null;
  source?: string | null;
  trackSortMode?: string;
  tracks: CloudTrackPayload[];
};

const cloudRequest = axios.create({
  baseURL: CLOUD_API_BASE_URL,
  timeout: 15000,
});

const stableHash = (text: string): number => {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash;
};

const buildThirdPartyNumericId = (
  platform: MusicPlatformType,
  trackId: string,
  fallbackText: string,
): number => {
  const base = trackId || fallbackText || `${platform}-${Date.now()}`;
  return THIRD_PARTY_ID_SEED + (stableHash(`${platform}:${base}`) % 900000000);
};

const normalizeSource = (value: unknown): MusicPlatformType | null => {
  const source = String(value || "")
    .trim()
    .toLowerCase();
  switch (source) {
    case "wy":
      return "netease";
    case "tx":
    case "yqq":
      return "qq";
    case "kw":
      return "kuwo";
    case "kg":
      return "kugou";
    case "netease":
    case "qq":
    case "kuwo":
    case "kugou":
      return source;
    default:
      return null;
  }
};

const shouldFilterSource = (value: unknown): boolean => {
  const source = String(value || "")
    .trim()
    .toLowerCase();
  return FILTERED_SOURCES.has(source);
};

const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string" && detail.trim()) return detail.trim();
    if (typeof error.message === "string" && error.message.trim()) return error.message.trim();
  }
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return "请求失败，请稍后重试";
};

const getAuthHeaders = (token?: string) => {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) return undefined;
  return {
    Authorization: `Bearer ${normalizedToken}`,
  };
};

const isUnauthorizedError = (error: unknown): boolean => {
  return error instanceof AxiosError && error.response?.status === 401;
};

const toCoverSize = (cover: string) => ({
  s: cover || "/images/song.jpg?asset",
  m: cover || "/images/song.jpg?asset",
  l: cover || "/images/song.jpg?asset",
  xl: cover || "/images/song.jpg?asset",
});

const toArtistText = (artists: SongType["artists"]): string => {
  if (Array.isArray(artists)) {
    return artists
      .map((artist) => String(artist?.name || "").trim())
      .filter(Boolean)
      .join(" / ");
  }
  return String(artists || "").trim();
};

const toAlbumText = (album: SongType["album"]): string => {
  if (typeof album === "string") return album.trim();
  if (album && typeof album === "object") {
    return String(album.name || "").trim();
  }
  return "";
};

const toRecord = (value: unknown): Record<string, any> => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, any>;
  }
  return {};
};

const toDuration = (value: unknown): number => {
  if (typeof value === "number") return Math.max(0, Math.floor(value));
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
};

const getFamillaSongSource = (song: SongType): MusicPlatformType | null => {
  if (song.path || song.type === "streaming") return null;
  if (
    String(song.source || "")
      .trim()
      .toLowerCase() === "local"
  )
    return null;
  const platform = normalizeSource(song.platform || song.source);
  if (platform) return platform;
  return "netease";
};

const mapFamillaSongToCloudTrack = (
  song: SongType,
  index: number,
  playlist: MyPlaylistType,
): CloudTrackPayload | null => {
  const source = getFamillaSongSource(song);
  if (!source || !SUPPORTED_PLATFORMS.has(source)) return null;

  const artist = toArtistText(song.artists);
  const album = toAlbumText(song.album);
  const rawTrackId = String(
    song.platformSongId ||
      song.id ||
      song.thirdPartyMeta?.songmid ||
      song.thirdPartyMeta?.audioId ||
      song.thirdPartyMeta?.id ||
      "",
  ).trim();
  if (!rawTrackId || !String(song.name || "").trim()) return null;

  const extra = {
    ...toRecord(song.thirdPartyMeta),
    platformSongId: rawTrackId,
    platform: source,
    ...(song.platformAlbumId ? { platformAlbumId: song.platformAlbumId } : {}),
  };

  return {
    id: rawTrackId,
    source,
    title: song.name,
    artist,
    album,
    coverUrl: String(song.cover || song.coverSize?.m || "").trim(),
    durationMs: toDuration(song.duration),
    extra,
    addedAtMs:
      Number(song.createTime) || Number(song.updateTime) || Number(playlist.createTime) + index,
    lyrics: song.lyricsRaw || null,
    streamUrl: song.streamUrl || null,
  };
};

const mapFamillaPlaylistToCloud = (playlist: MyPlaylistType): CloudPlaylistPayload => {
  const tracks = playlist.songs
    .map((song, index) => mapFamillaSongToCloudTrack(song, index, playlist))
    .filter((song): song is CloudTrackPayload => song !== null);
  const coverUrl = String(playlist.cover || tracks[0]?.coverUrl || "").trim() || null;
  return {
    id: String(playlist.id),
    name: String(playlist.name || "").trim() || "未命名歌单",
    description: playlist.description || null,
    coverUrl,
    displayCoverUrl: coverUrl,
    source: null,
    trackSortMode: "manual",
    tracks,
  };
};

const mapCloudTrackToFamillaSong = (rawTrack: Record<string, any>): SongType | null => {
  const sourceText = rawTrack["source"] || rawTrack["platform"];
  if (shouldFilterSource(sourceText)) return null;

  const source = normalizeSource(sourceText);
  if (!source || !SUPPORTED_PLATFORMS.has(source)) return null;

  const extra = toRecord(rawTrack["extra"] ?? rawTrack["meta"] ?? rawTrack["lxMeta"]);
  const rawTrackId = String(
    rawTrack["platformSongId"] ||
      rawTrack["id"] ||
      extra["platformSongId"] ||
      extra["songmid"] ||
      extra["audioId"] ||
      extra["songId"] ||
      extra["id"] ||
      extra["hash"] ||
      "",
  ).trim();
  const title = String(rawTrack["title"] || rawTrack["name"] || "").trim();
  if (!rawTrackId || !title) return null;

  const cover = String(rawTrack["coverUrl"] || rawTrack["cover"] || rawTrack["pic"] || "").trim();
  const artist = String(rawTrack["artist"] || "").trim();
  const album = String(rawTrack["album"] || "").trim();
  const duration = toDuration(rawTrack["durationMs"] ?? rawTrack["duration"]);

  const songId =
    source === "netease" && /^\d+$/.test(rawTrackId)
      ? Number(rawTrackId)
      : buildThirdPartyNumericId(source, rawTrackId, `${title}-${artist}`);

  return {
    id: songId,
    name: title,
    artists: artist,
    album,
    cover: cover || "/images/song.jpg?asset",
    coverSize: toCoverSize(cover || "/images/song.jpg?asset"),
    duration,
    free: 0,
    mv: null,
    type: "song",
    platform: source,
    platformSongId: rawTrackId,
    platformAlbumId: String(
      extra["platformAlbumId"] || extra["albumId"] || extra["albumMid"] || "",
    ).trim(),
    source,
    lyricsRaw: String(rawTrack["lyrics"] || rawTrack["lyric"] || "").trim() || undefined,
    streamUrl: String(rawTrack["streamUrl"] || rawTrack["url"] || "").trim() || undefined,
    thirdPartyMeta: Object.keys(extra).length
      ? {
          ...extra,
          id: rawTrackId,
        }
      : source === "netease"
        ? undefined
        : { id: rawTrackId },
  };
};

const mapFamillaLikeSongForRestore = (rawSong: Record<string, any>): SongType | null => {
  if (rawSong["path"] || shouldFilterSource(rawSong["source"] || rawSong["platform"])) {
    return null;
  }

  const source = normalizeSource(rawSong["platform"] || rawSong["source"]) || "netease";
  if (!SUPPORTED_PLATFORMS.has(source)) return null;

  const rawTrackId = String(
    rawSong["platformSongId"] ||
      rawSong["id"] ||
      toRecord(rawSong["thirdPartyMeta"])["songmid"] ||
      toRecord(rawSong["thirdPartyMeta"])["audioId"] ||
      "",
  ).trim();
  const title = String(rawSong["name"] || rawSong["title"] || "").trim();
  if (!title) return null;

  const fallbackTrackId =
    source === "netease" && /^\d+$/.test(rawTrackId)
      ? rawTrackId
      : rawTrackId || String(rawSong["id"] || "").trim();
  if (!fallbackTrackId) return null;

  const cover = String(
    rawSong["cover"] ||
      toRecord(rawSong["coverSize"])["m"] ||
      toRecord(rawSong["coverSize"])["s"] ||
      "",
  ).trim();
  const artistValue = rawSong["artists"];
  const albumValue = rawSong["album"];
  const artist =
    typeof artistValue === "string"
      ? artistValue.trim()
      : Array.isArray(artistValue)
        ? artistValue
            .map((item) => String(toRecord(item)["name"] || "").trim())
            .filter(Boolean)
            .join(" / ")
        : "";
  const album =
    typeof albumValue === "string"
      ? albumValue.trim()
      : String(toRecord(albumValue)["name"] || "").trim();

  const songId =
    source === "netease" && /^\d+$/.test(fallbackTrackId)
      ? Number(fallbackTrackId)
      : buildThirdPartyNumericId(source, fallbackTrackId, `${title}-${artist}`);

  return {
    id: songId,
    name: title,
    artists: artist,
    album,
    cover: cover || "/images/song.jpg?asset",
    coverSize: toCoverSize(cover || "/images/song.jpg?asset"),
    duration: toDuration(rawSong["duration"]),
    free: Number(rawSong["free"] || 0) as 0 | 1 | 4 | 8,
    mv: Number(rawSong["mv"] || 0) || null,
    type: "song",
    platform: source,
    platformSongId: fallbackTrackId,
    platformAlbumId: String(rawSong["platformAlbumId"] || "").trim() || undefined,
    source,
    lyricsRaw: String(rawSong["lyricsRaw"] || "").trim() || undefined,
    streamUrl: String(rawSong["streamUrl"] || "").trim() || undefined,
    thirdPartyMeta: Object.keys(toRecord(rawSong["thirdPartyMeta"])).length
      ? toRecord(rawSong["thirdPartyMeta"])
      : undefined,
  };
};

const mapCloudPlaylistToFamilla = (rawPlaylist: Record<string, any>): MyPlaylistType => {
  const cloudTracks = Array.isArray(rawPlaylist["tracks"])
    ? rawPlaylist["tracks"]
    : Array.isArray(rawPlaylist["songs"])
      ? rawPlaylist["songs"]
      : [];

  const songs = cloudTracks
    .map((track) => {
      const record = toRecord(track);
      if (Array.isArray(rawPlaylist["tracks"])) {
        return mapCloudTrackToFamillaSong(record);
      }
      return mapFamillaLikeSongForRestore(record);
    })
    .filter((song): song is SongType => song !== null);

  const cover = String(
    rawPlaylist["cover"] ||
      rawPlaylist["coverUrl"] ||
      rawPlaylist["displayCoverUrl"] ||
      songs[0]?.cover ||
      "",
  ).trim();

  return {
    id: Number(rawPlaylist["id"]) || 0,
    name: String(rawPlaylist["name"] || "").trim() || "未命名歌单",
    description: String(rawPlaylist["description"] || "").trim() || undefined,
    cover: cover || undefined,
    songs,
    createTime: Number(rawPlaylist["createTime"] || rawPlaylist["createdAt"] || Date.now()),
    updateTime: Number(rawPlaylist["updateTime"] || rawPlaylist["updatedAt"] || Date.now()),
  };
};

const mapCloudPlaylistsToFamilla = (playlists: unknown): MyPlaylistType[] => {
  if (!Array.isArray(playlists)) return [];
  return playlists.map((playlist) => mapCloudPlaylistToFamilla(toRecord(playlist)));
};

export const sendRegisterCode = async (email: string): Promise<void> => {
  try {
    await cloudRequest.post("/auth/send-code", { email });
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const registerCloudAccount = async (
  email: string,
  password: string,
  code: string,
): Promise<CloudUserInfo> => {
  try {
    const { data } = await cloudRequest.post<CloudUserInfo>("/auth/register", {
      email,
      password,
      code,
    });
    return data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const loginCloudAccount = async (
  email: string,
  password: string,
): Promise<CloudLoginResponse> => {
  try {
    const { data } = await cloudRequest.post<CloudLoginResponse>("/auth/login", {
      email,
      password,
    });
    return data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const backupCloudPlaylists = async (
  token: string,
  playlists: MyPlaylistType[],
): Promise<void> => {
  const payload = playlists.map(mapFamillaPlaylistToCloud);
  try {
    await cloudRequest.post(
      "/playlists/backup",
      { playlists: payload },
      { headers: getAuthHeaders(token) },
    );
  } catch (error) {
    if (isUnauthorizedError(error)) {
      throw new Error("登录状态已失效，请重新登录");
    }
    throw new Error(getErrorMessage(error));
  }
};

export const syncCloudPlaylists = async (token: string): Promise<CloudPlaylistSnapshot> => {
  try {
    const { data } = await cloudRequest.get<{ playlists?: unknown[] }>("/playlists/sync", {
      headers: getAuthHeaders(token),
    });
    return {
      playlists: mapCloudPlaylistsToFamilla(data?.playlists || []),
    };
  } catch (error) {
    if (isUnauthorizedError(error)) {
      throw new Error("登录状态已失效，请重新登录");
    }
    throw new Error(getErrorMessage(error));
  }
};

export const getActiveCloudPopup = async (): Promise<CloudPopup | null> => {
  try {
    const { data } = await cloudRequest.get<{ popup?: CloudPopup | null }>("/app/popup/active");
    return data?.popup || null;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const reportCloudAppLaunch = async (token?: string): Promise<void> => {
  try {
    await cloudRequest.post("/app/launch", null, {
      headers: getAuthHeaders(token),
    });
  } catch {
    // 启动上报失败不影响主流程
  }
};
