import { QualityType, type CoverType, type MusicPlatformType, type SongType } from "@/types/main";
import axios from "axios";
import request from "@/utils/request";
import { CLOUD_API_BASE_URL } from "./base";

export interface TunefreeListResult<T> {
  list: T[];
  total?: number;
  info?: Record<string, any>;
}

type PlatformApiResult<T> = {
  code?: number;
  data?: T;
  list?: T extends Array<any> ? T : never;
  total?: number;
  detail?: CoverType | null;
  songs?: SongType[];
  [key: string]: any;
};

const THIRD_PARTY_ID_SEED = 2000000000;
const THIRD_PARTY_QUALITY_FALLBACK = "128k";
const PARSE_CACHE_TTL = 10 * 60 * 1000;

type PlatformParseResult = {
  url: string;
  remainingToday?: number;
  /** 实际音质 */
  actualQuality: ThirdPartyQualityLevel;
  /** 文件扩展名 */
  fileType: string;
};

type CachedParseResult = PlatformParseResult & {
  expiresAt: number;
};

const platformParseCache = new Map<string, CachedParseResult>();
const platformParseRequests = new Map<string, Promise<PlatformParseResult>>();

export class PaidApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "PaidApiError";
  }
}

export type ThirdPartyQualityLevel = "128k" | "320k" | "flac" | "flac24bit";

type ThirdPartyQualityOption = {
  name: string;
  level: ThirdPartyQualityLevel;
  value: "l" | "h" | "sq" | "hr";
  br: number;
};

export const thirdPartyQualityOptions: ThirdPartyQualityOption[] = [
  {
    name: "标准音质",
    level: "128k",
    value: "l",
    br: 128000,
  },
  {
    name: "极高音质",
    level: "320k",
    value: "h",
    br: 320000,
  },
  {
    name: "无损音质",
    level: "flac",
    value: "sq",
    br: 999000,
  },
  {
    name: "Hi-Res",
    level: "flac24bit",
    value: "hr",
    br: 1999000,
  },
];

const stableHash = (text: string): number => {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash;
};

const normalizePlatformSongId = (
  platform: MusicPlatformType,
  item: Record<string, any>,
): string => {
  const normalizedId = String(item["platformSongId"] || item["platform_song_id"] || "").trim();
  if (normalizedId) return normalizedId;
  switch (platform) {
    case "qq":
      return (
        String(item["mid"] || item["songmid"] || item["id"] || item["songId"] || "").trim() ||
        String(item["songId"] || "").trim()
      );
    case "kuwo": {
      const rawId = String(
        item["id"] || item["rid"] || item["musicrid"] || item["MUSICRID"] || "",
      ).trim();
      if (rawId.startsWith("MUSIC_")) return rawId.slice(6);
      return rawId;
    }
    case "kugou":
      return String(item["hash"] || item["audioId"] || item["id"] || item["songid"] || "").trim();
    case "netease":
    default:
      return String(item["id"] || item["songId"] || "").trim();
  }
};

const buildThirdPartyNumericId = (
  platform: MusicPlatformType,
  platformSongId: string,
  fallbackText: string,
): number => {
  const base = platformSongId || fallbackText || `${platform}-${Date.now()}`;
  return THIRD_PARTY_ID_SEED + (stableHash(`${platform}:${base}`) % 900000000);
};

const toArtistMeta = (names: string, baseId: string) =>
  names
    .split(/\/|&|、|,/)
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name, index) => ({
      id: buildThirdPartyNumericId("netease", `${baseId}-artist-${index}`, name),
      name,
      cover: "",
    }));

const getArtistText = (item: Record<string, any>): string => {
  if (typeof item["artist"] === "string" && item["artist"].trim()) return item["artist"].trim();
  if (typeof item["ARTIST"] === "string" && item["ARTIST"].trim()) return item["ARTIST"].trim();
  if (typeof item["singerName"] === "string" && item["singerName"].trim()) {
    return item["singerName"].trim();
  }
  if (typeof item["artistName"] === "string" && item["artistName"].trim()) {
    return item["artistName"].trim();
  }
  if (Array.isArray(item["singer"])) {
    return item["singer"]
      .map((singer: any) => String(singer?.name || singer?.title || "").trim())
      .filter(Boolean)
      .join(" / ");
  }
  if (Array.isArray(item["artists"])) {
    return item["artists"]
      .map((artist: any) => String(artist?.name || artist?.title || "").trim())
      .filter(Boolean)
      .join(" / ");
  }
  return "";
};

const getAlbumText = (item: Record<string, any>): string => {
  const album = item["album"];
  if (typeof album === "string" && album.trim()) return album.trim();
  if (album && typeof album === "object") {
    return String(album["name"] || album["title"] || album["albumName"] || "").trim();
  }
  return String(item["albumName"] || item["ALBUM"] || "").trim();
};

const getCoverUrl = (item: Record<string, any>): string => {
  const cover = String(
    item["cover"] ||
      item["pic"] ||
      item["coverUrl"] ||
      item["img"] ||
      item["album_sizable_cover"] ||
      item["imgurl"] ||
      item["albumpic"] ||
      "",
  ).trim();
  if (/^https?:\/\/img\d+\.(?:kwcdn\.)?kuwo\.cn\//i.test(cover)) {
    return cover;
  }
  if (
    "ARTIST" in item ||
    "MUSICRID" in item ||
    "web_albumpic_short" in item ||
    "web_artistpic_short" in item
  ) {
    return cover;
  }
  return cover.replace(/^http:/, "https:");
};

const getNestedObject = (item: Record<string, any>, keys: string[]) => {
  for (const key of keys) {
    const value = item[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, any>;
    }
  }
  return null;
};

const getNestedList = (item: Record<string, any>, keys: string[]) => {
  for (const key of keys) {
    const value = item[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      const record = value as Record<string, any>;
      for (const childKey of ["list", "songlist", "songList", "tracks"]) {
        if (Array.isArray(record[childKey])) {
          return record[childKey] as Record<string, any>[];
        }
      }
    }
  }
  return [];
};

const toCoverSize = (cover: string) => ({
  s: cover || "/images/song.jpg?asset",
  m: cover || "/images/song.jpg?asset",
  l: cover || "/images/song.jpg?asset",
  xl: cover || "/images/song.jpg?asset",
});

const LOCAL_PLATFORM_API_BASE = "/api/platform-music";

const unwrapResult = <T>(
  result: PlatformApiResult<T> | null | undefined,
): T | Record<string, any> => {
  if (!result) return {};
  if (result.data && typeof result.data === "object") return result.data as T;
  return result as unknown as T;
};

// 后端最高到 Hi-Res，旧设置中的更高音质统一回落
const normalizeThirdPartyQuality = (quality?: string | null): ThirdPartyQualityLevel => {
  const value = String(quality || "")
    .trim()
    .toLowerCase();
  switch (value) {
    case "128k":
    case "standard":
      return "128k";
    case "320k":
    case "exhigh":
    case "higher":
      return "320k";
    case "flac":
    case "lossless":
      return "flac";
    case "flac24bit":
    case "hires":
    case "jyeffect":
    case "sky":
    case "dolby":
    case "vivid":
    case "jymaster":
      return "flac24bit";
    default:
      return THIRD_PARTY_QUALITY_FALLBACK;
  }
};

export const mapThirdPartySettingQuality = (level?: string | null): ThirdPartyQualityLevel => {
  return normalizeThirdPartyQuality(level);
};

export const getThirdPartyQualityByLevel = (level?: string | null) => {
  const normalized = normalizeThirdPartyQuality(level);
  return (
    thirdPartyQualityOptions.find((item) => item.level === normalized) ||
    thirdPartyQualityOptions[0]
  );
};

export const mapThirdPartyQualityToType = (level?: string | null): QualityType => {
  const normalized = normalizeThirdPartyQuality(level);
  switch (normalized) {
    case "flac24bit":
      return QualityType.HiRes;
    case "flac":
      return QualityType.SQ;
    case "320k":
      return QualityType.HQ;
    case "128k":
    default:
      return QualityType.LQ;
  }
};

export const getThirdPartyTrackIds = (
  song: Pick<SongType, "platform" | "platformSongId" | "thirdPartyMeta" | "id">,
): string[] => {
  const primary = String(song.platformSongId || song.id || "").trim();
  const meta = song.thirdPartyMeta || {};
  const candidates = [
    primary,
    String(meta["songmid"] || "").trim(),
    String(meta["mid"] || "").trim(),
    String(meta["songId"] || meta["songid"] || meta["id"] || "").trim(),
  ];
  return Array.from(new Set(candidates.filter(Boolean)));
};

type ParsedAudioItem = {
  url: string;
  record: Record<string, unknown>;
};

const extractAudioItem = (value: unknown, depth = 0): ParsedAudioItem | null => {
  if (depth > 6 || value === null || value === undefined) return null;
  if (typeof value === "string") {
    return /^https?:\/\//i.test(value.trim()) ? { url: value.trim(), record: {} } : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractAudioItem(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of ["url", "play_url", "playUrl", "music_url", "musicUrl"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && /^https?:\/\//i.test(candidate.trim())) {
      return { url: candidate.trim(), record };
    }
  }
  for (const key of ["data", "list", "songs", "result", "response"]) {
    const found = extractAudioItem(record[key], depth + 1);
    if (found) return found;
  }
  return null;
};

const AUDIO_FILE_TYPES = ["flac", "mp3", "m4a", "aac", "ogg", "opus", "wav"];
const QUALITY_DOWNGRADE_ORDER: ThirdPartyQualityLevel[] = ["flac24bit", "flac", "320k", "128k"];

export const getUrlFileType = (url: string): string => {
  try {
    const extension = new URL(url).pathname.split(".").pop()?.toLowerCase() || "";
    return AUDIO_FILE_TYPES.includes(extension) ? extension : "";
  } catch {
    return "";
  }
};

// 后端标注可能与文件不符，以链接扩展名校正
const resolveParsedAudio = (item: ParsedAudioItem, requested: ThirdPartyQualityLevel) => {
  const reported = item.record["actualQuality"] || item.record["quality"] || requested;
  let actualQuality = normalizeThirdPartyQuality(String(reported));
  const isLossless = actualQuality === "flac" || actualQuality === "flac24bit";
  const urlFileType = getUrlFileType(item.url);
  if (isLossless && urlFileType && urlFileType !== "flac" && urlFileType !== "wav") {
    actualQuality = "320k";
  }
  return { actualQuality, fileType: urlFileType || (isLossless ? "flac" : "mp3") };
};

const getPaidApiErrorMessage = (status: number, detail: unknown): string => {
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  switch (status) {
    case 401:
      return "mobi 登录状态已失效，请重新登录";
    case 403:
      return "需要有效 VIP 会员才能解析歌曲";
    case 429:
      return "今日解析次数已用完，将在 UTC 次日重置";
    case 502:
    case 503:
      return "歌曲解析服务暂时不可用，请稍后重试";
    default:
      return "歌曲解析失败，请稍后重试";
  }
};

export const parsePlatformSong = async (
  token: string,
  platform: MusicPlatformType,
  id: string,
  quality: string = THIRD_PARTY_QUALITY_FALLBACK,
): Promise<PlatformParseResult> => {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) throw new PaidApiError(401, "请先登录 mobi 账号后播放歌曲");
  const normalizedQuality = normalizeThirdPartyQuality(quality);
  const cacheKey = `${normalizedToken.slice(-16)}:${platform}:${id}:${normalizedQuality}`;
  const cached = platformParseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    const { expiresAt: _expiresAt, ...result } = cached;
    return result;
  }
  const pending = platformParseRequests.get(cacheKey);
  if (pending) return pending;

  const requestParse = async (requested: ThirdPartyQualityLevel) => {
    const response = await axios.post(
      `${CLOUD_API_BASE_URL}/tunefree/parse`,
      { platform, ids: id, quality: requested },
      {
        timeout: 30000,
        headers: {
          Authorization: `Bearer ${normalizedToken}`,
          "X-Idempotency-Key":
            typeof crypto.randomUUID === "function"
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        },
      },
    );
    const item = extractAudioItem(response.data);
    if (!item) throw new PaidApiError(502, "解析服务未返回可用的歌曲地址");
    const remaining = Number(response.headers["x-daily-parse-remaining"]);
    const result: PlatformParseResult = {
      url: item.url,
      ...resolveParsedAudio(item, requested),
      ...(Number.isFinite(remaining) ? { remainingToday: remaining } : {}),
    };
    return result;
  };

  const requestPromise = (async () => {
    try {
      // 该音质无资源时逐级降级
      const candidates = QUALITY_DOWNGRADE_ORDER.slice(
        QUALITY_DOWNGRADE_ORDER.indexOf(normalizedQuality),
      );
      for (const [index, candidate] of candidates.entries()) {
        try {
          const result = await requestParse(candidate);
          platformParseCache.set(cacheKey, { ...result, expiresAt: Date.now() + PARSE_CACHE_TTL });
          return result;
        } catch (error) {
          const status =
            error instanceof PaidApiError
              ? error.status
              : axios.isAxiosError(error)
                ? error.response?.status
                : undefined;
          if (status !== 502 || index === candidates.length - 1) throw error;
        }
      }
      throw new PaidApiError(502, "解析服务未返回可用的歌曲地址");
    } catch (error) {
      if (error instanceof PaidApiError) throw error;
      if (axios.isAxiosError(error)) {
        const status = error.response?.status || 503;
        throw new PaidApiError(
          status,
          getPaidApiErrorMessage(status, error.response?.data?.detail),
        );
      }
      throw new PaidApiError(503, "歌曲解析服务连接失败，请稍后重试");
    } finally {
      platformParseRequests.delete(cacheKey);
    }
  })();
  platformParseRequests.set(cacheKey, requestPromise);
  return requestPromise;
};

const normalizeThirdPartyTitle = (item: Record<string, any>) =>
  String(item["name"] || item["title"] || item["SONGNAME"] || item["songname"] || "").trim();

const extractPlatformArtist = (song: SongType) => {
  if (Array.isArray(song.artists)) {
    return song.artists
      .map((artist) => artist.name)
      .filter(Boolean)
      .join(" / ");
  }
  return String(song.artists || "").trim();
};

export const getPlatformLyric = async (
  platform: Exclude<MusicPlatformType, "netease">,
  song: SongType,
): Promise<{ lrc?: string; trans?: string; roma?: string; qrc?: string }> => {
  return request({
    baseURL: LOCAL_PLATFORM_API_BASE,
    url: "/lyric",
    method: "post",
    data: { platform, song },
  });
};

export const getPlatformCover = async (
  platform: Exclude<MusicPlatformType, "netease">,
  song: SongType,
): Promise<string> => {
  const result = await request<{ cover?: string }>({
    baseURL: LOCAL_PLATFORM_API_BASE,
    url: "/cover",
    method: "post",
    data: { platform, song },
  });
  return String(result?.cover || "").trim();
};

export const searchPlatformSongs = async (
  platform: MusicPlatformType,
  keyword: string,
  page = 1,
  pageSize = 50,
): Promise<TunefreeListResult<SongType>> => {
  if (platform === "netease") {
    const result = await request<any>({
      baseURL: CLOUD_API_BASE_URL,
      url: "/tunefree/search",
      params: {
        platform,
        keyword,
        page,
        pageSize,
      },
    });
    const data = unwrapResult<any>(result);
    const list = normalizeSearchSongs(platform, data);
    return {
      list,
      total:
        Number((data as any)?.total) ||
        Number((data as any)?.songCount) ||
        Number((data as any)?.TOTAL) ||
        Number((data as any)?.meta?.sum) ||
        list.length,
    };
  }

  const result = await request<PlatformApiResult<SongType[]>>({
    baseURL: LOCAL_PLATFORM_API_BASE,
    url: "/search",
    params: {
      platform,
      keyword,
      page,
      pageSize,
    },
  });
  const list = Array.isArray(result?.list) ? result.list : [];
  return {
    list,
    total: Number(result?.total) || list.length,
    info: result,
  };
};

export const getPlatformToplists = async (
  platform: MusicPlatformType,
): Promise<TunefreeListResult<CoverType>> => {
  if (platform === "netease") {
    const result = await request<any>({
      baseURL: CLOUD_API_BASE_URL,
      url: "/tunefree/toplists",
      params: { platform },
    });
    const data = unwrapResult<any>(result);
    return {
      list: normalizeToplists(platform, data),
      info: data,
    };
  }

  const result = await request<PlatformApiResult<CoverType[]>>({
    baseURL: LOCAL_PLATFORM_API_BASE,
    url: "/toplists",
    params: { platform },
  });
  return {
    list: Array.isArray(result?.list) ? result.list : [],
    info: result,
  };
};

export const getPlatformToplist = async (
  platform: MusicPlatformType,
  id: string,
): Promise<{ detail: CoverType | null; songs: SongType[] }> => {
  if (platform === "netease") {
    const result = await request<any>({
      baseURL: CLOUD_API_BASE_URL,
      url: "/tunefree/toplist",
      params: { platform, id },
    });
    const data = unwrapResult<any>(result);
    return normalizeToplistDetail(platform, id, data);
  }

  const result = await request<PlatformApiResult<any>>({
    baseURL: LOCAL_PLATFORM_API_BASE,
    url: "/toplist",
    params: { platform, id },
  });
  return {
    detail: result?.detail || null,
    songs: Array.isArray(result?.songs) ? result.songs : [],
  };
};

export const getPlatformPlaylist = async (
  platform: MusicPlatformType,
  id: string,
  limit?: number,
  offset?: number,
): Promise<{ detail: CoverType | null; songs: SongType[] }> => {
  const result = await request<any>({
    baseURL: CLOUD_API_BASE_URL,
    url: "/tunefree/playlist",
    params: {
      platform,
      id,
      ...(limit !== undefined ? { limit } : {}),
      ...(offset !== undefined ? { offset } : {}),
    },
  });
  const data = unwrapResult<any>(result);
  return normalizePlaylistDetail(platform, id, data);
};

const normalizeSearchSongs = (platform: MusicPlatformType, raw: any): SongType[] => {
  if (Array.isArray(raw?.list)) {
    return mapThirdPartySongs(platform, raw.list);
  }
  switch (platform) {
    case "qq": {
      const list = raw?.req?.data?.body?.song?.list || raw?.song?.list || [];
      return mapThirdPartySongs(platform, Array.isArray(list) ? list : []);
    }
    case "kuwo":
      return mapThirdPartySongs(platform, Array.isArray(raw?.abslist) ? raw.abslist : []);
    case "kugou": {
      const list = raw?.data?.lists || raw?.lists || [];
      return mapThirdPartySongs(platform, Array.isArray(list) ? list : []);
    }
    case "netease":
    default: {
      const list = raw?.result?.songs || raw?.songs || [];
      return mapThirdPartySongs(platform, Array.isArray(list) ? list : []);
    }
  }
};

const mapThirdPartySongs = (
  platform: MusicPlatformType,
  list: Record<string, any>[],
): SongType[] => {
  return list
    .map((item) => {
      const platformSongId = normalizePlatformSongId(platform, item);
      const artist = getArtistText(item);
      const album = getAlbumText(item);
      const cover = getCoverUrl(item);
      const title = normalizeThirdPartyTitle(item);
      if (!platformSongId || !title) return null;

      const id = buildThirdPartyNumericId(platform, platformSongId, `${title}-${artist}`);
      const durationMs =
        Number(item["duration"]) ||
        Number(item["interval"]) * 1000 ||
        Number(item["DURATION"]) * 1000 ||
        Number(item["songTimeMinutes"]) * 1000 ||
        0;

      return {
        id,
        name: title,
        artists: artist ? toArtistMeta(artist, platformSongId) : "",
        album: album
          ? {
              id: buildThirdPartyNumericId(platform, `${platformSongId}-album`, album),
              name: album,
              cover,
            }
          : "",
        cover: cover || "/images/song.jpg?asset",
        coverSize: toCoverSize(cover || "/images/song.jpg?asset"),
        duration: durationMs,
        free: 0,
        mv: Number(item["mv"] || item["mvid"] || 0) || null,
        playCount: Number(item["playCount"] || item["listenNum"] || 0),
        platform,
        platformSongId,
        platformAlbumId: String(
          item["albumMid"] || item["albumId"] || item["ALBUMID"] || item["albumid"] || "",
        ).trim(),
        type: "song",
        source: platform,
        thirdPartyMeta: {
          ...item,
          artist: extractPlatformArtist({
            id,
            name: title,
            artists: artist ? toArtistMeta(artist, platformSongId) : "",
            album: album || "",
            cover,
            duration: durationMs,
            free: 0,
            mv: Number(item["mv"] || item["mvid"] || 0) || null,
            type: "song",
          } as SongType),
        },
      } as SongType;
    })
    .filter((song): song is SongType => song !== null);
};

const normalizeToplists = (platform: MusicPlatformType, raw: any): CoverType[] => {
  switch (platform) {
    case "qq": {
      const groups = raw?.toplist?.data?.group || [];
      if (!Array.isArray(groups)) return [];
      return groups.flatMap((group: any) =>
        Array.isArray(group?.toplist)
          ? group.toplist.map((item: any) => ({
              id: String(item["topId"] || item["id"] || ""),
              name: String(item["title"] || item["name"] || "").trim(),
              cover: getCoverUrl(item) || "/images/album.jpg?asset",
              coverSize: toCoverSize(getCoverUrl(item) || "/images/album.jpg?asset"),
              description: String(item["intro"] || "")
                .replace(/<br>/g, " ")
                .trim(),
              updateTip: String(item["updateTime"] || item["period"] || "").trim(),
              count: Number(item["totalNum"] || 0),
              platform,
              sourceType: "toplist",
              thirdPartyId: String(item["topId"] || item["id"] || "").trim(),
              tracks: Array.isArray(item["song"])
                ? item.song.slice(0, 3).map((song: any) => ({
                    first: String(song["title"] || "").trim(),
                    second: String(song["singerName"] || "").trim(),
                  }))
                : undefined,
            }))
          : [],
      );
    }
    case "kuwo": {
      const groups = Array.isArray(raw?.child) ? raw.child : [];
      return groups.map((item: any) => ({
        id: String(item["sourceid"] || item["id"] || "").trim(),
        name: String(item["name"] || item["disname"] || "").trim(),
        cover: getCoverUrl(item) || "/images/album.jpg?asset",
        coverSize: toCoverSize(getCoverUrl(item) || "/images/album.jpg?asset"),
        description: String(item["disname"] || "").trim(),
        updateTip: String(item["info"] || "").trim(),
        platform,
        sourceType: "toplist",
        thirdPartyId: String(item["sourceid"] || item["id"] || "").trim(),
      }));
    }
    case "kugou":
      return [];
    case "netease":
    default:
      return [];
  }
};

const normalizeToplistDetail = (
  platform: MusicPlatformType,
  id: string,
  raw: any,
): { detail: CoverType | null; songs: SongType[] } => {
  switch (platform) {
    case "qq": {
      const data = raw?.toplist?.data?.data || {};
      const songs = mapThirdPartySongs(
        platform,
        Array.isArray(raw?.toplist?.data?.songInfoList) ? raw.toplist.data.songInfoList : [],
      );
      const cover = getCoverUrl(data) || "/images/album.jpg?asset";
      return {
        detail: {
          id,
          name: String(data["title"] || "QQ 榜单").trim(),
          cover,
          coverSize: toCoverSize(cover),
          description: String(data["intro"] || "").trim(),
          updateTip: String(data["updateTime"] || data["period"] || "").trim(),
          count: songs.length,
          platform,
          sourceType: "toplist",
          thirdPartyId: id,
        },
        songs,
      };
    }
    default:
      return normalizePlaylistDetail(platform, id, raw);
  }
};

const normalizePlaylistDetail = (
  platform: MusicPlatformType,
  id: string,
  raw: any,
): { detail: CoverType | null; songs: SongType[] } => {
  if (platform === "qq") {
    const root = raw && typeof raw === "object" ? raw : {};
    const data = getNestedObject(root, ["data"]) || root;
    const cdList = Array.isArray(data?.["cdlist"]) ? data["cdlist"] : [];
    const cdInfo =
      cdList[0] && typeof cdList[0] === "object" ? (cdList[0] as Record<string, any>) : null;
    const songs = mapThirdPartySongs(
      platform,
      getNestedList(cdInfo || root, ["songlist", "songList", "list", "tracks"]),
    );
    const info = cdInfo || getNestedObject(root, ["info", "playlist", "result"]) || root;
    const cover =
      getCoverUrl(info) ||
      getCoverUrl(cdInfo || {}) ||
      (songs[0]?.cover ?? "/images/album.jpg?asset");
    return {
      detail: {
        id,
        name: String(
          info?.["dissname"] || info?.["name"] || info?.["title"] || root?.["name"] || "QQ 歌单",
        ).trim(),
        cover,
        coverSize: toCoverSize(cover),
        description: String(info?.["desc"] || info?.["description"] || "").trim(),
        updateTip: String(info?.["updateTime"] || info?.["period"] || "").trim(),
        count:
          Number(info?.["total_song_num"] || info?.["songnum"] || info?.["songNum"]) ||
          songs.length,
        platform,
        sourceType: "playlist",
        thirdPartyId: String(info?.["disstid"] || info?.["dissid"] || info?.["id"] || id).trim(),
      },
      songs,
    };
  }

  if (platform === "kuwo") {
    const songs = mapThirdPartySongs(platform, Array.isArray(raw?.musicList) ? raw.musicList : []);
    const cover = getCoverUrl(raw) || (songs[0]?.cover ?? "/images/album.jpg?asset");
    return {
      detail: {
        id,
        name: String(raw?.name || raw?.disname || "酷我榜单").trim(),
        cover,
        coverSize: toCoverSize(cover),
        description: String(raw?.info || "").trim(),
        updateTip: String(raw?.tips || "").trim(),
        count: songs.length,
        platform,
        sourceType: "playlist",
        thirdPartyId: id,
      },
      songs,
    };
  }

  const songs = mapThirdPartySongs(platform, Array.isArray(raw?.list) ? raw.list : []);
  const info = raw?.info || raw?.playlist || raw?.result || {};
  const cover = getCoverUrl(info) || (songs[0]?.cover ?? "/images/album.jpg?asset");
  return {
    detail: {
      id,
      name: String(info?.name || raw?.name || `${platform} 歌单`).trim(),
      cover,
      coverSize: toCoverSize(cover),
      description: String(info?.desc || info?.description || raw?.desc || "").trim(),
      updateTip: String(info?.updateTime || "").trim(),
      count: songs.length,
      platform,
      sourceType: "playlist",
      thirdPartyId: id,
    },
    songs,
  };
};
