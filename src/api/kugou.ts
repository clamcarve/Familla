import type { SongType } from "@/types/main";
import axios from "axios";
import request from "@/utils/request";
import { getUrlFileType, type ThirdPartyQualityLevel } from "./tunefree";

const KUGOU_API_BASE = "/api/platform-music/kugou";
const URL_CACHE_TTL = 20 * 60 * 1000;
const KUGOU_HASH_PATTERN = /^[0-9a-f]{32}$/i;

const REQUEST_QUALITY: Record<ThirdPartyQualityLevel, string> = {
  "128k": "128",
  "320k": "320",
  flac: "flac",
  flac24bit: "high",
};

const ACTUAL_QUALITY: Record<string, ThirdPartyQualityLevel> = {
  "128": "128k",
  "320": "320k",
  flac: "flac",
};

export type KugouSongResult = {
  url: string;
  actualQuality: ThirdPartyQualityLevel;
  fileType: string;
};

const urlCache = new Map<string, KugouSongResult & { expiresAt: number }>();

export class KugouLoginRequiredError extends Error {
  constructor(public readonly expired: boolean) {
    super(expired ? "酷狗登录已失效，请重新扫码" : "请先扫码登录酷狗概念版");
    this.name = "KugouLoginRequiredError";
  }
}

export const clearKugouUrlCache = () => urlCache.clear();

export const createKugouQrLogin = () =>
  request<{ key: string; content: string }>({
    baseURL: KUGOU_API_BASE,
    url: "/qr/key",
    method: "post",
  });

export const checkKugouQrLogin = (key: string) =>
  request<{ status: number; message: string; nickname?: string; cookie?: string }>({
    baseURL: KUGOU_API_BASE,
    url: "/qr/check",
    method: "post",
    data: { key },
  });

export const claimKugouDailyVip = (cookie: string, receiveDay: string) =>
  request<{ claimed: boolean; detail: string }>({
    baseURL: KUGOU_API_BASE,
    url: "/checkin",
    method: "post",
    data: { cookie, receiveDay },
    timeout: 60000,
  });

// 优先元数据中的 hash，兼容旧版以 audioId 保存的歌曲
const getKugouHash = (song: SongType): string => {
  const meta = song.thirdPartyMeta || {};
  const candidates = [meta["hash"], meta["FileHash"], meta["Hash"], song.platformSongId];
  return candidates
    .map((item) => String(item || "").trim())
    .find((item) => {
      return KUGOU_HASH_PATTERN.test(item);
    }) as string;
};

export const resolveKugouSong = async (
  cookie: string,
  song: SongType,
  quality: ThirdPartyQualityLevel,
): Promise<KugouSongResult> => {
  if (!cookie) throw new KugouLoginRequiredError(false);
  const hash = getKugouHash(song);
  if (!hash) throw new Error("该酷狗歌曲缺少 hash，请重新搜索后播放");
  const cacheKey = `${hash}:${quality}`;
  const cached = urlCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached;

  const meta = song.thirdPartyMeta || {};
  try {
    const result = await request<{ url?: string; quality?: string }>({
      baseURL: KUGOU_API_BASE,
      url: "/url",
      method: "post",
      timeout: 60000,
      data: {
        cookie,
        hash,
        albumId: song.platformAlbumId || meta["albumId"] || meta["AlbumID"] || meta["album_id"],
        albumAudioId: meta["album_audio_id"] || meta["MixSongID"] || meta["mixsongid"],
        quality: REQUEST_QUALITY[quality],
      },
    });
    const url = String(result?.url || "");
    if (!url) throw new Error("酷狗未返回可播放地址");
    const actualQuality = ACTUAL_QUALITY[String(result?.quality)] || "flac24bit";
    const isLossless = actualQuality === "flac" || actualQuality === "flac24bit";
    const parsed: KugouSongResult = {
      url,
      actualQuality,
      fileType: getUrlFileType(url) || (isLossless ? "flac" : "mp3"),
    };
    urlCache.set(cacheKey, { ...parsed, expiresAt: Date.now() + URL_CACHE_TTL });
    return parsed;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) throw new KugouLoginRequiredError(true);
      throw new Error(error.response?.data?.message || "酷狗播放地址获取失败");
    }
    throw error;
  }
};
