import {
  PaidApiError,
  parsePlatformSong,
  searchPlatformSongs,
  getThirdPartyTrackIds,
  type ThirdPartyQualityLevel,
} from "@/api/tunefree";
import { useCloudSyncStore } from "@/stores";
import type { MusicPlatformType, SongType } from "@/types/main";

const IGNORED_CHARACTERS = /[\s\p{P}\p{S}]/gu;
const BRACKETED_NOTE = /[(（[【《<〈{][^)）\]】》>〉}]*[)）\]】》>〉}]/g;
const ARTIST_SEPARATOR = /\s*(?:[,，/／、&＆;；|]|\bfeat\.?\b|\bft\.?\b)\s*/i;
const ARTIST_ALIAS = /[(（]([^)）]+)[)）]/;
const VERSION_TAGS = [
  "live",
  "remix",
  "dj",
  "inst",
  "cover",
  "acoustic",
  "demo",
  "伴奏",
  "翻唱",
  "现场",
  "纯音乐",
  "片段",
  "铃声",
  "翻自",
];
const CLOSE_MATCH_DURATION_TOLERANCE = 15000;
const SWITCH_PLATFORMS: MusicPlatformType[] = ["netease", "kuwo", "qq"];
const SEARCH_LIMIT = 15;

type MatchLevel = "none" | "close" | "exact";

export type SwitchedSource = {
  song: SongType;
  platform: MusicPlatformType;
  url: string;
  actualQuality: ThirdPartyQualityLevel;
};

const normalizeText = (value: string) =>
  value
    .replace(/[！-～]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .toLowerCase()
    .replace(IGNORED_CHARACTERS, "");

const withoutNotes = (title: string) => title.replace(BRACKETED_NOTE, " ").trim() || title;

const getVersionTags = (title: string) => {
  const normalized = normalizeText(title);
  return new Set(VERSION_TAGS.filter((tag) => normalized.includes(tag)));
};

const getArtists = (song: SongType): string[] => {
  if (Array.isArray(song.artists)) return song.artists.map((artist) => artist.name);
  return song.artists ? [song.artists] : [];
};

const getArtistNames = (artists: string[]) =>
  new Set(
    artists
      .flatMap((artist) => artist.split(ARTIST_SEPARATOR))
      .map(normalizeText)
      .filter(Boolean),
  );

// 同时计入别名和本名
const getArtistNamesWithAliases = (artists: string[]) => {
  const names = new Set<string>();
  for (const part of artists.flatMap((artist) => artist.split(ARTIST_SEPARATOR))) {
    const alias = part.match(ARTIST_ALIAS)?.[1];
    for (const name of [part, part.replace(ARTIST_ALIAS, ""), alias]) {
      const normalized = normalizeText(name || "");
      if (normalized) names.add(normalized);
    }
  }
  return names;
};

const isSameSet = (a: Set<string>, b: Set<string>) =>
  a.size === b.size && [...a].every((item) => b.has(item));

const getMatchLevel = (original: SongType, candidate: SongType): MatchLevel => {
  const title = normalizeText(original.name);
  const candidateTitle = normalizeText(candidate.name);
  const artists = getArtists(original);
  const candidateArtists = getArtists(candidate);
  const wanted = getArtistNames(artists);
  const offered = getArtistNames(candidateArtists);
  if (!title || !candidateTitle || !wanted.size || !offered.size) return "none";
  if (title === candidateTitle && isSameSet(wanted, offered)) return "exact";

  if (normalizeText(withoutNotes(original.name)) !== normalizeText(withoutNotes(candidate.name))) {
    return "none";
  }
  if (!isSameSet(getVersionTags(original.name), getVersionTags(candidate.name))) return "none";
  const aliases = getArtistNamesWithAliases(candidateArtists);
  if (![...getArtistNamesWithAliases(artists)].some((name) => aliases.has(name))) return "none";
  if (
    original.duration > 0 &&
    candidate.duration > 0 &&
    Math.abs(original.duration - candidate.duration) > CLOSE_MATCH_DURATION_TOLERANCE
  ) {
    return "none";
  }
  return "close";
};

/**
 * 在其他平台查找同名同作者歌曲并解析
 * @param original 原歌曲
 * @param quality 目标音质
 * @returns 可播放的替代音源，没有时返回 null
 */
export const findAlternativeSource = async (
  original: SongType,
  quality: ThirdPartyQualityLevel,
): Promise<SwitchedSource | null> => {
  const { token } = useCloudSyncStore();
  const artistText = getArtists(original).join(" ");
  if (!token || !original.name || !artistText) return null;

  const searches = await Promise.allSettled(
    SWITCH_PLATFORMS.map((platform) =>
      searchPlatformSongs(platform, `${original.name} ${artistText}`, 1, SEARCH_LIMIT),
    ),
  );
  // 每个平台取最佳一首，精确匹配优先
  const exact: SongType[] = [];
  const close: SongType[] = [];
  for (const search of searches) {
    if (search.status !== "fulfilled") continue;
    let bestClose: SongType | undefined;
    let bestExact: SongType | undefined;
    for (const song of search.value.list) {
      const level = getMatchLevel(original, song);
      if (level === "exact") {
        bestExact = song;
        break;
      }
      if (level === "close") bestClose ||= song;
    }
    if (bestExact) exact.push(bestExact);
    else if (bestClose) close.push(bestClose);
  }

  for (const song of [...exact, ...close]) {
    const platform = song.platform || "netease";
    const trackId = getThirdPartyTrackIds(song)[0];
    if (!trackId) continue;
    try {
      const result = await parsePlatformSong(token, platform, trackId, quality);
      return { song, platform, url: result.url, actualQuality: result.actualQuality };
    } catch (error) {
      // 账号和额度问题换平台也无法解决
      if (error instanceof PaidApiError && [401, 403, 429].includes(error.status)) return null;
    }
  }
  return null;
};
