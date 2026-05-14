import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import axios from "axios";
import { inflateSync } from "zlib";
import { serverLog } from "../../main/logger";
import { decryptQrc } from "../qqmusic/qrc";

type PlatformType = "qq" | "kuwo" | "kugou";

const THIRD_PARTY_ID_SEED = 2000000000;
const DEFAULT_COVER = "/images/song.jpg?asset";
const DEFAULT_ALBUM_COVER = "/images/album.jpg?asset";
const RANDOM_KUGOU_TOPLIST_COVER_API = "https://api.yppp.net/api.php";

const kugouToplistPresets = [
  { id: "8888", name: "TOP500" },
  { id: "6666", name: "飙升榜" },
  { id: "59703", name: "蜂鸟流行音乐榜" },
  { id: "52144", name: "抖音热歌榜" },
  { id: "52767", name: "快手热歌榜" },
  { id: "24971", name: "DJ热歌榜" },
  { id: "23784", name: "网络红歌榜" },
  { id: "44412", name: "说唱先锋榜" },
  { id: "31308", name: "内地榜" },
  { id: "33160", name: "电音榜" },
  { id: "31313", name: "香港地区榜" },
  { id: "51341", name: "民谣榜" },
  { id: "54848", name: "台湾地区榜" },
  { id: "31310", name: "欧美榜" },
  { id: "33162", name: "ACG新歌榜" },
  { id: "31311", name: "韩国榜" },
  { id: "31312", name: "日本榜" },
  { id: "49225", name: "80后热歌榜" },
  { id: "49223", name: "90后热歌榜" },
  { id: "49224", name: "00后热歌榜" },
];

const kugouToplistCoverCache = new Map<string, string>();

const stableHash = (text: string): number => {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash;
};

const buildNumericId = (platform: PlatformType, platformSongId: string, fallbackText: string) => {
  const base = platformSongId || fallbackText || `${platform}-${Date.now()}`;
  return THIRD_PARTY_ID_SEED + (stableHash(`${platform}:${base}`) % 900000000);
};

const normalizeHttpUrl = (url: string) => url.replace(/^http:/, "https:");

const normalizeKuwoCoverUrl = (url: string) => {
  const value = String(url || "").trim();
  if (!value) return "";
  if (/^https?:\/\/img\d+\.(?:kwcdn\.)?kuwo\.cn\//i.test(value)) {
    return value;
  }
  return normalizeHttpUrl(value);
};

const toCoverSize = (cover: string) => ({
  s: cover || DEFAULT_COVER,
  m: cover || DEFAULT_COVER,
  l: cover || DEFAULT_COVER,
  xl: cover || DEFAULT_COVER,
});

const parseJson = (raw: unknown): Record<string, any> | null => {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, any>;
  }
  const text = String(raw || "").trim();
  if (!text) return null;
  let normalized = text;
  if (normalized.startsWith("try{")) {
    normalized = normalized.replace(/^\s*try\{/, "");
    normalized = normalized.replace(/\}\s*catch\s*\(.*\)\s*\{\s*\}\s*$/, "");
  }
  const jsonp = normalized.match(/^[a-zA-Z0-9_]+\((\{.*\})\)\s*;?$/s);
  if (jsonp?.[1]) normalized = jsonp[1].trim();
  try {
    const data = JSON.parse(normalized);
    if (data && typeof data === "object" && !Array.isArray(data)) {
      return data as Record<string, any>;
    }
  } catch {
    const start = normalized.indexOf("{");
    const end = normalized.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const data = JSON.parse(normalized.slice(start, end + 1));
        if (data && typeof data === "object" && !Array.isArray(data)) {
          return data as Record<string, any>;
        }
      } catch {
        return null;
      }
    }
  }
  return null;
};

const decodeBase64Text = (value: unknown) => {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    return Buffer.from(text, "base64").toString("utf8").trim();
  } catch {
    return "";
  }
};

const decodeQqQrcField = (value: unknown) => {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    return decryptQrc(text).trim();
  } catch {
    return "";
  }
};

const decodeHtmlEntities = (text: string) => {
  return text
    .replaceAll("&apos;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
};

const cleanKugouText = (raw: string) => {
  return decodeHtmlEntities(raw)
    .replace(/<[^>]*>/g, "")
    .trim();
};

const qqCoverFromAlbumMid = (albumMid: string) => {
  const mid = albumMid.trim();
  if (!mid) return "";
  return `https://y.gtimg.cn/music/photo_new/T002R300x300M000${mid}.jpg`;
};

const kuwoCoverFromSongId = (songId: string) => {
  const id = songId.trim();
  if (!id) return "";
  return `http://artistpicserver.kuwo.cn/pic.web?corp=kuwo&type=rid_pic&pictype=500&size=500&rid=${id}`;
};

const kugouHeaders = {
  Referer: "https://www.kugou.com/",
  "User-Agent": "Mozilla/5.0",
};

const normalizePlatformSongId = (platform: PlatformType, item: Record<string, any>): string => {
  switch (platform) {
    case "qq":
      return String(item["mid"] || item["songmid"] || item["songId"] || item["id"] || "").trim();
    case "kuwo": {
      const rawId = String(
        item["id"] || item["rid"] || item["musicrid"] || item["MUSICRID"] || "",
      ).trim();
      return rawId.startsWith("MUSIC_") ? rawId.slice(6) : rawId;
    }
    case "kugou":
      return String(
        item["audioId"] || item["audio_id"] || item["id"] || item["songid"] || item["hash"] || "",
      ).trim();
  }
};

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
  if (Array.isArray(item["singerList"])) {
    return item["singerList"]
      .map((singer: any) => String(singer?.name || "").trim())
      .filter(Boolean)
      .join(" / ");
  }
  if (Array.isArray(item["artists"])) {
    return item["artists"]
      .map((artist: any) => String(artist?.name || artist?.title || "").trim())
      .filter(Boolean)
      .join(" / ");
  }
  if (Array.isArray(item["authors"])) {
    return item["authors"]
      .map((artist: any) => String(artist?.author_name || artist?.name || "").trim())
      .filter(Boolean)
      .join(" / ");
  }
  return "";
};

const getAlbumText = (item: Record<string, any>): string => {
  if (typeof item["album"] === "string" && item["album"].trim()) return item["album"].trim();
  if (item["album"] && typeof item["album"] === "object") {
    return String(item["album"]["name"] || item["album"]["title"] || "").trim();
  }
  return String(item["albumName"] || item["album_name"] || item["ALBUM"] || "").trim();
};

const getCoverUrl = (item: Record<string, any>): string => {
  let cover = String(
    item["cover"] ||
      item["pic"] ||
      item["coverUrl"] ||
      item["img"] ||
      item["headPicUrl"] ||
      item["frontPicUrl"] ||
      item["album_sizable_cover"] ||
      item["imgurl"] ||
      item["albumpic"] ||
      "",
  ).trim();
  if (cover.includes("{size}")) {
    cover = cover.replace("{size}", "400");
  }
  if (!cover) return "";
  if (/^https?:\/\/img\d+\.(?:kwcdn\.)?kuwo\.cn\//i.test(cover)) {
    return normalizeKuwoCoverUrl(cover);
  }
  if (
    "ARTIST" in item ||
    "MUSICRID" in item ||
    "web_albumpic_short" in item ||
    "web_artistpic_short" in item
  ) {
    return normalizeKuwoCoverUrl(cover);
  }
  return normalizeHttpUrl(cover);
};

const getSongText = (song: Record<string, any>, key: "name" | "artist") => {
  if (key === "name") return cleanKugouText(String(song["name"] || song["title"] || "").trim());
  if (Array.isArray(song["artists"])) {
    return song["artists"]
      .map((artist: any) => String(artist?.name || "").trim())
      .filter(Boolean)
      .join(" / ");
  }
  return cleanKugouText(String(song["artists"] || song["artist"] || "").trim());
};

const buildSong = (platform: PlatformType, item: Record<string, any>) => {
  const platformSongId = normalizePlatformSongId(platform, item);
  const artist = getArtistText(item);
  const album = getAlbumText(item);
  const title = String(
    item["name"] || item["title"] || item["songname"] || item["SONGNAME"] || "",
  ).trim();
  if (!platformSongId || !title) return null;

  let cover = getCoverUrl(item);
  if (!cover && platform === "qq") {
    cover = qqCoverFromAlbumMid(
      String(item["albumMid"] || item["albumId"] || item["album_id"] || "").trim(),
    );
  }
  const durationMs =
    Number(item["duration"]) ||
    Number(item["dt"]) ||
    Number(item["interval"]) * 1000 ||
    Number(item["DURATION"]) * 1000 ||
    0;

  const id = buildNumericId(platform, platformSongId, `${title}-${artist}`);
  return {
    id,
    name: title,
    artists: artist || "未知歌手",
    album: album
      ? {
          id: buildNumericId(platform, `${platformSongId}-album`, album),
          name: album,
          cover: cover || DEFAULT_COVER,
        }
      : "未知专辑",
    cover: cover || DEFAULT_COVER,
    coverSize: toCoverSize(cover || DEFAULT_COVER),
    duration: durationMs,
    free: 0,
    mv: Number(item["mv"] || item["mvid"] || 0) || null,
    playCount: Number(item["playCount"] || item["listenNum"] || 0),
    platform,
    platformSongId,
    platformAlbumId: String(
      item["albumMid"] || item["albumId"] || item["album_id"] || item["albumid"] || "",
    ).trim(),
    type: "song",
    source: platform,
    thirdPartyMeta: {
      ...item,
    },
  };
};

const formatKuwoTime = (raw: string) => {
  const value = raw.trim();
  if (!value) return value;
  if (value.includes(":")) return value;
  const secondsRaw = Number(value);
  if (Number.isNaN(secondsRaw)) return value;
  let minutes = Math.floor(secondsRaw / 60);
  const remain = secondsRaw - minutes * 60;
  let seconds = Math.floor(remain);
  let hundredths = Math.round((remain - seconds) * 100);
  if (hundredths >= 100) {
    hundredths -= 100;
    seconds += 1;
  }
  if (seconds >= 60) {
    seconds -= 60;
    minutes += 1;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
};

const formatKrcTime = (ms: number) => {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milli = ms % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milli).padStart(3, "0")}`;
};

const readKrcTranslation = (content: unknown) => {
  if (!Array.isArray(content)) return null;
  return content.map((line) => {
    if (Array.isArray(line)) return line.map((item) => String(item ?? "")).join("");
    return String(line ?? "");
  });
};

const parseKrcToLrc = (raw: string) => {
  let source = raw.replaceAll("\r", "");
  source = source.replace(/^.*\[id:\$\w+\]\n/, "");

  let translated: string[] | null = null;
  let roman: string[] | null = null;

  const languageMatch = source.match(/\[language:([\w=+/]+)\]/);
  if (languageMatch?.[1]) {
    source = source.replace(/\[language:[\w=+/]+\]/, "");
    try {
      const decoded = JSON.parse(Buffer.from(languageMatch[1], "base64").toString("utf8"));
      const content = Array.isArray(decoded?.content) ? decoded.content : [];
      for (const item of content) {
        if (!item || typeof item !== "object") continue;
        const type = Number((item as Record<string, any>)["type"] || -1);
        if (type === 0) roman = readKrcTranslation((item as Record<string, any>)["lyricContent"]);
        if (type === 1)
          translated = readKrcTranslation((item as Record<string, any>)["lyricContent"]);
      }
    } catch {
      // 忽略翻译解析失败
    }
  }

  const lines: string[] = [];
  const regex = /^\[(\d+),(\d+)\](.*)$/;
  let index = 0;
  for (const line of source.split("\n")) {
    const match = line.trim().match(regex);
    if (!match) continue;
    const timeTag = formatKrcTime(Number(match[1] || 0));
    const text = String(match[3] || "")
      .replace(/<\d+,\d+>/g, "")
      .replace(/<\d+,\d+,\d+>/g, "")
      .trim();
    if (text) lines.push(`[${timeTag}]${text}`);
    const translatedText = translated?.[index]?.trim();
    if (translatedText) lines.push(`[${timeTag}]${translatedText}`);
    const romanText = roman?.[index]?.trim();
    if (romanText) lines.push(`[${timeTag}]${romanText}`);
    index += 1;
  }
  return lines.join("\n").trim();
};

const fetchQQSearch = async (keyword: string, page: number, pageSize: number) => {
  const response = await axios.post(
    "https://u.y.qq.com/cgi-bin/musicu.fcg",
    {
      comm: {
        ct: "11",
        cv: "14090508",
        v: "14090508",
        tmeAppID: "qqmusic",
        phonetype: "EBG-AN10",
        deviceScore: "553.47",
        devicelevel: "50",
        newdevicelevel: "20",
        rom: "HuaWei/EMOTION/EmotionUI_14.2.0",
        os_ver: "12",
        OpenUDID: "0",
        OpenUDID2: "0",
        QIMEI36: "0",
        udid: "0",
        chid: "0",
        aid: "0",
        oaid: "0",
        taid: "0",
        tid: "0",
        wid: "0",
        uid: "0",
        sid: "0",
        modeSwitch: "6",
        teenMode: "0",
        ui_mode: "2",
        nettype: "1020",
        v4ip: "",
      },
      req: {
        module: "music.search.SearchCgiService",
        method: "DoSearchForQQMusicMobile",
        param: {
          search_type: 0,
          query: keyword,
          page_num: page,
          num_per_page: pageSize,
          highlight: 0,
          nqc_flag: 0,
          multi_zhida: 0,
          cat: 2,
          grp: 1,
          sin: 0,
          sem: 0,
        },
      },
    },
    {
      headers: {
        "User-Agent": "QQMusic 14090508(android 12)",
        Referer: "https://y.qq.com/",
        "Content-Type": "application/json",
      },
      timeout: 15000,
    },
  );

  const decoded = parseJson(response.data);
  const req = decoded?.["req"] as Record<string, any> | undefined;
  const data = req?.["data"] as Record<string, any> | undefined;
  const body = data?.["body"] as Record<string, any> | undefined;
  const list = Array.isArray(body?.["item_song"])
    ? body?.["item_song"]
    : Array.isArray(body?.["song"]?.["list"])
      ? body?.["song"]?.["list"]
      : [];

  return {
    list: list
      .map((item) =>
        buildSong("qq", {
          ...item,
          name: item?.["name"] || item?.["title"],
          albumName: item?.["album"]?.["name"] || item?.["albumName"],
          albumMid: item?.["album"]?.["mid"] || item?.["album"]?.["pmid"] || item?.["albumMid"],
          duration: Number(item?.["interval"] || 0) * 1000,
          artist: Array.isArray(item?.["singer"])
            ? item.singer
                .map((s: any) => s?.name)
                .filter(Boolean)
                .join(" / ")
            : "",
        }),
      )
      .filter(Boolean),
    total: Number(data?.["meta"]?.["sum"] || data?.["total"] || list.length) || list.length,
  };
};

const fetchKuwoSearch = async (keyword: string, pageSize: number) => {
  const response = await axios.get("http://search.kuwo.cn/r.s", {
    params: {
      client: "kt",
      all: keyword,
      pn: 0,
      rn: Math.max(1, Math.min(pageSize, 150)),
      uid: 794762570,
      ver: "kwplayer_ar_9.2.2.1",
      vipver: 1,
      show_copyright_off: 1,
      newver: 1,
      ft: "music",
      cluster: 0,
      strategy: 2012,
      encoding: "utf8",
      rformat: "json",
      vermerge: 1,
      mobi: 1,
      issubtitle: 1,
    },
    headers: { "User-Agent": "Mozilla/5.0" },
    responseType: "text",
    timeout: 15000,
  });
  const decoded = parseJson(response.data);
  const list = Array.isArray(decoded?.["abslist"]) ? decoded?.["abslist"] : [];
  return {
    list: list
      .map((item) =>
        buildSong("kuwo", {
          ...item,
          id: String(item?.["MUSICRID"] || item?.["id"] || "").replace(/^MUSIC_/, ""),
          name: item?.["SONGNAME"],
          artist: item?.["ARTIST"],
          albumName: item?.["ALBUM"],
          duration: Number(item?.["DURATION"] || 0) * 1000,
        }),
      )
      .filter(Boolean),
    total: Number(decoded?.["TOTAL"] || list.length) || list.length,
  };
};

const fetchKugouSearch = async (keyword: string, page: number, pageSize: number) => {
  const response = await axios.get("https://songsearch.kugou.com/song_search_v2", {
    params: {
      keyword,
      page,
      pagesize: Math.max(1, Math.min(pageSize, 150)),
      userid: 0,
      clientver: "",
      platform: "WebFilter",
      filter: 2,
      iscorrection: 1,
      privilege_filter: 0,
      area_code: 1,
    },
    headers: kugouHeaders,
    responseType: "text",
    timeout: 15000,
  });
  const decoded = parseJson(response.data);
  const data = decoded?.["data"] as Record<string, any> | undefined;
  const list = Array.isArray(data?.["lists"]) ? data?.["lists"] : [];
  return {
    list: list
      .map((item) =>
        buildSong("kugou", {
          ...item,
          audioId: item?.["Audioid"],
          hash: item?.["FileHash"],
          name: cleanKugouText(String(item?.["SongName"] || "")),
          artist: cleanKugouText(String(item?.["SingerName"] || "")),
          albumName: cleanKugouText(String(item?.["AlbumName"] || "")),
          duration: Number(item?.["Duration"] || 0) * 1000,
          albumId: item?.["AlbumID"],
        }),
      )
      .filter(Boolean),
    total: Number(data?.["total"] || list.length) || list.length,
  };
};

const fetchQqToplists = async () => {
  const response = await axios.post(
    "https://u.y.qq.com/cgi-bin/musicu.fcg",
    {
      comm: {
        cv: 4747474,
        ct: 24,
        format: "json",
        inCharset: "utf-8",
        outCharset: "utf-8",
        uin: 0,
      },
      toplist: {
        module: "musicToplist.ToplistInfoServer",
        method: "GetAll",
        param: {},
      },
    },
    {
      headers: {
        "Content-Type": "application/json",
        Referer: "https://y.qq.com/",
      },
      timeout: 15000,
    },
  );
  const decoded = parseJson(response.data);
  const data = decoded?.["toplist"]?.["data"] as Record<string, any> | undefined;
  const groups = Array.isArray(data?.["group"]) ? data?.["group"] : [];
  return groups.flatMap((group: any) =>
    Array.isArray(group?.["toplist"])
      ? group.toplist.map((item: any) => {
          const cover = normalizeHttpUrl(
            String(item?.["headPicUrl"] || item?.["frontPicUrl"] || ""),
          );
          return {
            id: String(item?.["topId"] || item?.["id"] || "").trim(),
            name: String(item?.["title"] || item?.["name"] || "").trim(),
            cover: cover || DEFAULT_ALBUM_COVER,
            coverSize: toCoverSize(cover || DEFAULT_ALBUM_COVER),
            description: String(item?.["intro"] || "")
              .replace(/<br>/g, " ")
              .trim(),
            updateTip: String(item?.["updateTime"] || item?.["period"] || "").trim(),
            count: Number(item?.["totalNum"] || 0),
            platform: "qq",
            sourceType: "toplist",
            thirdPartyId: String(item?.["topId"] || item?.["id"] || "").trim(),
            tracks: Array.isArray(item?.["song"])
              ? item.song.slice(0, 3).map((song: any) => ({
                  first: String(song?.["title"] || "").trim(),
                  second: String(song?.["singerName"] || "").trim(),
                }))
              : undefined,
          };
        })
      : [],
  );
};

const fetchKuwoToplists = async () => {
  const response = await axios.get("http://qukudata.kuwo.cn/q.k", {
    params: {
      op: "query",
      cont: "tree",
      node: 2,
      pn: 0,
      rn: 1000,
      fmt: "json",
      level: 2,
    },
    headers: { "User-Agent": "Mozilla/5.0" },
    responseType: "text",
    timeout: 15000,
  });
  const decoded = parseJson(response.data);
  const child = Array.isArray(decoded?.["child"]) ? decoded?.["child"] : [];
  return child
    .filter((item: any) => String(item?.["source"] || "") === "1")
    .map((item: any) => {
      const cover = getCoverUrl(item) || DEFAULT_ALBUM_COVER;
      return {
        id: String(item?.["sourceid"] || item?.["id"] || "").trim(),
        name: String(item?.["name"] || item?.["disname"] || "").trim(),
        cover,
        coverSize: toCoverSize(cover),
        description: String(item?.["disname"] || "").trim(),
        updateTip: String(item?.["info"] || "").trim(),
        platform: "kuwo",
        sourceType: "toplist",
        thirdPartyId: String(item?.["sourceid"] || item?.["id"] || "").trim(),
      };
    });
};

const fetchKugouToplists = async () => {
  const list = await Promise.all(
    kugouToplistPresets.map(async (item) => {
      const cover = await getKugouToplistCover(item.id);
      return {
        id: item.id,
        name: item.name,
        cover,
        coverSize: toCoverSize(cover),
        description: "",
        updateTip: "",
        platform: "kugou",
        sourceType: "toplist",
        thirdPartyId: item.id,
      };
    }),
  );
  return list;
};

const fetchQqToplistDetail = async (id: string) => {
  const response = await axios.post(
    "https://u.y.qq.com/cgi-bin/musicu.fcg",
    {
      comm: {
        cv: 4747474,
        ct: 24,
        format: "json",
        inCharset: "utf-8",
        outCharset: "utf-8",
        uin: 0,
      },
      toplist: {
        module: "musicToplist.ToplistInfoServer",
        method: "GetDetail",
        param: {
          topid: Number(id),
          num: 300,
          period: "",
        },
      },
    },
    {
      headers: {
        "Content-Type": "application/json",
        Referer: "https://y.qq.com/",
      },
      timeout: 15000,
    },
  );
  const decoded = parseJson(response.data);
  const data = decoded?.["toplist"]?.["data"] as Record<string, any> | undefined;
  const info = data?.["data"] as Record<string, any> | undefined;
  const list = Array.isArray(data?.["songInfoList"]) ? data?.["songInfoList"] : [];
  const songs = list
    .map((item) =>
      buildSong("qq", {
        ...item,
        name: item?.["title"] || item?.["name"],
        artist: Array.isArray(item?.["singerList"])
          ? item.singerList
              .map((s: any) => s?.name)
              .filter(Boolean)
              .join(" / ")
          : "",
        albumName: item?.["albumName"],
        albumMid: item?.["album"]?.["mid"] || item?.["albumMid"],
        duration: Number(item?.["interval"] || 0) * 1000,
      }),
    )
    .filter(Boolean);

  const cover = normalizeHttpUrl(String(info?.["headPicUrl"] || info?.["frontPicUrl"] || ""));
  return {
    detail: {
      id,
      name: String(info?.["title"] || "QQ 榜单").trim(),
      cover: cover || DEFAULT_ALBUM_COVER,
      coverSize: toCoverSize(cover || DEFAULT_ALBUM_COVER),
      description: String(info?.["intro"] || "").trim(),
      updateTip: String(info?.["updateTime"] || info?.["period"] || "").trim(),
      count: songs.length,
      platform: "qq",
      sourceType: "toplist",
      thirdPartyId: id,
    },
    songs,
  };
};

const fetchKuwoToplistDetail = async (id: string) => {
  const response = await axios.get("http://kbangserver.kuwo.cn/ksong.s", {
    params: {
      from: "pc",
      fmt: "json",
      id,
      type: "bang",
      data: "content",
      pn: 0,
      rn: 100,
    },
    headers: { "User-Agent": "Mozilla/5.0" },
    responseType: "text",
    timeout: 15000,
  });
  const decoded = parseJson(response.data) || {};
  const list = Array.isArray(decoded["musiclist"]) ? decoded["musiclist"] : [];
  const songs = list
    .map((item) =>
      buildSong("kuwo", {
        ...item,
        name: item?.["name"],
        artist: String(item?.["artist"] || "").replaceAll("&", " / "),
        albumName: item?.["album"],
        duration: Number(item?.["duration"] || 0) * 1000,
      }),
    )
    .filter(Boolean);

  return {
    detail: {
      id,
      name: String(decoded["name"] || decoded["leader"] || "酷我榜单").trim(),
      cover: getCoverUrl(decoded) || DEFAULT_ALBUM_COVER,
      coverSize: toCoverSize(getCoverUrl(decoded) || DEFAULT_ALBUM_COVER),
      description: String(decoded["info"] || "").trim(),
      updateTip: "",
      count: songs.length,
      platform: "kuwo",
      sourceType: "toplist",
      thirdPartyId: id,
    },
    songs,
  };
};

const fetchKugouToplistDetail = async (id: string) => {
  const response = await axios.get("http://mobilecdnbj.kugou.com/api/v3/rank/song", {
    params: {
      version: 9108,
      ranktype: 1,
      plat: 0,
      pagesize: 100,
      area_code: 1,
      page: 1,
      rankid: id,
      with_res_tag: 0,
      show_portrait_mv: 1,
    },
    headers: kugouHeaders,
    responseType: "text",
    timeout: 15000,
  });
  const decoded = parseJson(response.data) || {};
  const data = (decoded["data"] as Record<string, any>) || {};
  const list = Array.isArray(data["info"]) ? data["info"] : [];
  const songs = list
    .map((item) =>
      buildSong("kugou", {
        ...item,
        audioId: item?.["audio_id"] || item?.["audioId"],
        name: cleanKugouText(String(item?.["songname"] || item?.["songName"] || "")),
        artist: Array.isArray(item?.["authors"])
          ? item.authors
              .map((author: any) => author?.author_name || author?.name || "")
              .filter(Boolean)
              .join(" / ")
          : "",
        albumName: item?.["album_name"] || item?.["albumName"],
        duration: Number(item?.["duration"] || 0) * 1000,
        cover: getCoverUrl(item),
        hash: item?.["hash"],
        albumId: item?.["album_id"],
      }),
    )
    .filter(Boolean);

  const preset = kugouToplistPresets.find((item) => item.id === id);
  const cover = await getKugouToplistCover(id);
  return {
    detail: {
      id,
      name: preset?.name || String(data["rankname"] || "酷狗榜单").trim(),
      cover,
      coverSize: toCoverSize(cover),
      description: "",
      updateTip: "",
      count: songs.length,
      platform: "kugou",
      sourceType: "toplist",
      thirdPartyId: id,
    },
    songs,
  };
};

const fetchQQLyric = async (song: Record<string, any>) => {
  const songMid = String(
    song["platformSongId"] ||
      song["platform_song_id"] ||
      song["songmid"] ||
      song["thirdPartyMeta"]?.["songmid"] ||
      song["thirdPartyMeta"]?.["mid"] ||
      "",
  ).trim();
  const songId = Number(
    song["thirdPartyMeta"]?.["songId"] ||
      song["thirdPartyMeta"]?.["id"] ||
      song["songId"] ||
      song["id"] ||
      0,
  );

  try {
    if (songId > 0) {
      const response = await axios.post(
        "https://u.y.qq.com/cgi-bin/musicu.fcg",
        {
          comm: {
            ct: 11,
            cv: "1003006",
            v: "1003006",
            os_ver: "15",
            phonetype: "24122RKC7C",
            tmeAppID: "qqmusiclight",
            nettype: "NETWORK_WIFI",
            uid: "0",
          },
          request: {
            method: "GetPlayLyricInfo",
            module: "music.musichallSong.PlayLyricInfo",
            param: {
              songID: songId,
              qrc: 1,
              crypt: 1,
              qrc_t: 0,
              lrc_t: 0,
              roma: 1,
              roma_t: 0,
              trans: 1,
              trans_t: 0,
              type: 0,
              ct: 19,
              cv: 2111,
              interval: 0,
              albumName: "",
              singerName: "",
              songName: "",
            },
          },
        },
        {
          headers: {
            "Content-Type": "application/json",
            "Accept-Encoding": "gzip",
            "User-Agent": "okhttp/3.14.9",
          },
          responseType: "text",
          timeout: 15000,
        },
      );
      const decoded = parseJson(response.data);
      const request = decoded?.["request"] as Record<string, any> | undefined;
      const data = request?.["data"] as Record<string, any> | undefined;
      const qrc = decodeQqQrcField(data?.["lyric"]);
      const trans = decodeQqQrcField(data?.["trans"]);
      const roma = decodeQqQrcField(data?.["roma"]);
      if (qrc || trans || roma) {
        return {
          lrc: qrc,
          trans,
          roma,
          qrc,
        };
      }
    }
  } catch (error: any) {
    serverLog.warn("QQ 官方逐字歌词获取失败，尝试旧接口兜底:", error?.message || error);
  }

  if (!songMid) return null;
  const response = await axios.get("https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg", {
    params: {
      songmid: songMid,
      g_tk: 5381,
      loginUin: 0,
      hostUin: 0,
      format: "json",
      inCharset: "utf8",
      outCharset: "utf-8",
      platform: "yqq",
    },
    headers: {
      Referer: "https://y.qq.com/portal/player.html",
      "User-Agent": "Mozilla/5.0",
    },
    responseType: "text",
    timeout: 15000,
  });
  const decoded = parseJson(response.data);
  if (!decoded || Number(decoded["code"] || decoded["retcode"] || -1) !== 0) {
    return null;
  }
  return {
    lrc: decodeBase64Text(decoded["lyric"]),
    trans: decodeBase64Text(decoded["trans"]),
    roma: decodeBase64Text(decoded["roma"]),
    qrc: "",
  };
};

const fetchKuwoLyric = async (song: Record<string, any>) => {
  const songId = String(song["platformSongId"] || song["id"] || "").trim();
  if (!songId) return null;
  const response = await axios.get(
    `http://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId=${songId}`,
    {
      headers: { "User-Agent": "Mozilla/5.0" },
      responseType: "text",
      timeout: 15000,
    },
  );
  const decoded = parseJson(response.data);
  const data = (decoded?.["data"] as Record<string, any>) || {};
  const lines = Array.isArray(data["lrclist"]) ? data["lrclist"] : [];
  const lrc = lines
    .map((item: any) => {
      const time = formatKuwoTime(String(item?.["time"] || ""));
      const text = decodeHtmlEntities(String(item?.["lineLyric"] || "")).trim();
      if (!time || !text || text === "//") return "";
      return `[${time}]${text}`;
    })
    .filter(Boolean)
    .join("\n")
    .trim();
  return lrc ? { lrc, trans: "", roma: "", qrc: "" } : null;
};

const fetchKugouCover = async (song: Record<string, any>) => {
  let hash = String(
    song["hash"] || song["platformSongId"] || song["thirdPartyMeta"]?.["hash"] || "",
  ).trim();
  const albumId = String(
    song["platformAlbumId"] || song["albumId"] || song["thirdPartyMeta"]?.["albumId"] || "",
  ).trim();
  const audioId = String(
    song["platformSongId"] || song["audioId"] || song["thirdPartyMeta"]?.["audioId"] || "",
  ).trim();

  if (!hash) {
    const extraTypes = song["thirdPartyMeta"]?.["_types"];
    if (extraTypes && typeof extraTypes === "object") {
      const typeOrder = ["flac24bit", "flac", "wav", "ape", "320k", "192k", "128k"];
      for (const key of typeOrder) {
        const value = (extraTypes as Record<string, any>)[key];
        const currentHash = String(value?.["hash"] || "").trim();
        if (currentHash) {
          hash = currentHash;
          break;
        }
      }
    }
  }

  const response = await axios.post(
    "http://media.store.kugou.com/v1/get_res_privilege",
    {
      appid: 1001,
      area_code: "1",
      behavior: "play",
      clientver: "9020",
      need_hash_offset: 1,
      relate: 1,
      resource: [
        {
          album_audio_id: audioId,
          album_id: albumId,
          hash,
          id: 0,
          name: `${song["artist"] || ""} - ${song["title"] || song["name"] || ""}.mp3`,
          type: "audio",
        },
      ],
      token: "",
      userid: 2626431536,
      vip: 1,
    },
    {
      headers: {
        ...kugouHeaders,
        "KG-RC": 1,
        "KG-THash": "expand_search_manager.cpp:852736169:451",
        "User-Agent": "KuGou2012-9020-ExpandSearchManager",
        "Content-Type": "application/json",
      },
      responseType: "text",
      timeout: 15000,
    },
  );
  const decoded = parseJson(response.data);
  const data = Array.isArray(decoded?.["data"]) ? decoded?.["data"] : [];
  if (data.length > 0 && data[0]?.["info"]) {
    let image = String(data[0]["info"]["image"] || "").trim();
    if (image.includes("{size}")) {
      const sizes = Array.isArray(data[0]["info"]["imgsize"]) ? data[0]["info"]["imgsize"] : [];
      image = image.replace("{size}", String(sizes[0] || 400));
    }
    if (image) return normalizeHttpUrl(image);
  }
  if (!hash) return "";
  const fallback = await axios.get("https://wwwapi.kugou.com/yy/index.php", {
    params: { r: "play/getdata", hash },
    headers: kugouHeaders,
    timeout: 15000,
  });
  return normalizeHttpUrl(String(fallback.data?.["data"]?.["img"] || ""));
};

const fetchKugouLyric = async (song: Record<string, any>) => {
  const title = getSongText(song, "name");
  const artist = getSongText(song, "artist");
  const duration = Math.floor(
    Number(song["duration"] || song["thirdPartyMeta"]?.["_interval"] || 0) / 1000,
  );
  let hash = String(song["thirdPartyMeta"]?.["hash"] || song["hash"] || "").trim();

  if (!hash) {
    const types = song["thirdPartyMeta"]?.["_types"];
    if (types && typeof types === "object") {
      for (const key of ["flac24bit", "flac", "wav", "ape", "320k", "192k", "128k"]) {
        const value = (types as Record<string, any>)[key];
        const currentHash = String(value?.["hash"] || "").trim();
        if (currentHash) {
          hash = currentHash;
          break;
        }
      }
    }
  }

  const keywords = Array.from(
    new Set(
      [
        title,
        artist && title ? `${artist} - ${title}` : "",
        artist && title ? `${title} ${artist}` : "",
      ]
        .map((item) => cleanKugouText(item))
        .filter(Boolean),
    ),
  );

  let candidates: any[] = [];
  for (const keyword of keywords) {
    const response = await axios.get("http://lyrics.kugou.com/search", {
      params: {
        ver: 1,
        man: "yes",
        client: "pc",
        keyword,
        hash,
        timelength: duration,
        lrctxt: 1,
      },
      headers: {
        ...kugouHeaders,
        "KG-RC": 1,
        "KG-THash": "expand_search_manager.cpp:852736169:451",
        "User-Agent": "KuGou2012-9020-ExpandSearchManager",
      },
      timeout: 15000,
    });
    if (Array.isArray(response.data?.["candidates"]) && response.data.candidates.length > 0) {
      candidates = response.data.candidates;
      break;
    }
  }

  if (candidates.length === 0) return null;

  let selected: Record<string, any> | null = null;
  for (const item of candidates) {
    if (!item || typeof item !== "object") continue;
    selected = item as Record<string, any>;
    const candidateHash = String(item["hash"] || item["filehash"] || "")
      .trim()
      .toLowerCase();
    if (hash && candidateHash && candidateHash === hash.toLowerCase()) break;
  }
  if (!selected) return null;

  const lyricId = String(selected["id"] || "").trim();
  const accessKey = String(selected["accesskey"] || "").trim();
  const fmt =
    Number(selected["krctype"] || 0) === 1 && Number(selected["contenttype"] || 0) !== 1
      ? "krc"
      : "lrc";
  if (!lyricId || !accessKey) return null;

  const response = await axios.get("http://lyrics.kugou.com/download", {
    params: {
      ver: 1,
      client: "pc",
      id: lyricId,
      accesskey: accessKey,
      fmt,
      charset: "utf8",
    },
    headers: {
      ...kugouHeaders,
      "KG-RC": 1,
      "KG-THash": "expand_search_manager.cpp:852736169:451",
      "User-Agent": "KuGou2012-9020-ExpandSearchManager",
    },
    timeout: 15000,
  });
  const content = String(response.data?.["content"] || "");
  if (!content) return null;

  if (fmt === "lrc") {
    const lrc = Buffer.from(content, "base64").toString("utf8").trim();
    return lrc ? { lrc, trans: "", roma: "", qrc: "" } : null;
  }

  const raw = Buffer.from(content, "base64");
  if (raw.length <= 4) return null;
  const buf = raw.subarray(4);
  const key = [
    0x40, 0x47, 0x61, 0x77, 0x5e, 0x32, 0x74, 0x47, 0x51, 0x36, 0x31, 0x2d, 0xce, 0xd2, 0x6e, 0x69,
  ];
  for (let i = 0; i < buf.length; i += 1) {
    buf[i] = buf[i] ^ key[i % 16];
  }
  const decoded = inflateSync(Buffer.from(buf)).toString("utf8").trim();
  const lrc = parseKrcToLrc(decoded);
  return lrc ? { lrc, trans: "", roma: "", qrc: "" } : null;
};

const resolveKuwoCover = async (songId: string) => {
  const id = songId.trim();
  if (!id) return "";
  const response = await axios.get(kuwoCoverFromSongId(id), {
    headers: { "User-Agent": "Mozilla/5.0" },
    responseType: "text",
    timeout: 15000,
  });
  return normalizeKuwoCoverUrl(String(response.data || "").trim());
};

const getPlatformCover = async (platform: PlatformType, song: Record<string, any>) => {
  if (platform === "qq") {
    const albumMid = String(
      song["platformAlbumId"] || song["thirdPartyMeta"]?.["albumMid"] || "",
    ).trim();
    return qqCoverFromAlbumMid(albumMid);
  }
  if (platform === "kuwo") {
    return resolveKuwoCover(String(song["platformSongId"] || "").trim());
  }
  return fetchKugouCover(song);
};

const fetchRandomKugouToplistCover = async () => {
  const firstResponse = await axios.get(RANDOM_KUGOU_TOPLIST_COVER_API, {
    headers: { "User-Agent": "Mozilla/5.0" },
    maxRedirects: 0,
    validateStatus: (status) => status >= 200 && status < 400,
    timeout: 15000,
  });
  const firstLocation = String(firstResponse.headers["location"] || "").trim();
  if (!firstLocation) {
    const directUrl = String(
      firstResponse.request?.res?.responseUrl || firstResponse.config?.url || "",
    ).trim();
    return directUrl ? normalizeHttpUrl(directUrl) : DEFAULT_ALBUM_COVER;
  }

  const secondUrl = new URL(firstLocation, RANDOM_KUGOU_TOPLIST_COVER_API).toString();
  const secondResponse = await axios.get(secondUrl, {
    headers: { "User-Agent": "Mozilla/5.0" },
    maxRedirects: 0,
    validateStatus: (status) => status >= 200 && status < 400,
    timeout: 15000,
  });
  const secondLocation = String(secondResponse.headers["location"] || "").trim();
  if (!secondLocation) {
    const directUrl = String(
      secondResponse.request?.res?.responseUrl || secondResponse.config?.url || "",
    ).trim();
    return directUrl ? normalizeHttpUrl(directUrl) : DEFAULT_ALBUM_COVER;
  }
  return normalizeHttpUrl(new URL(secondLocation, secondUrl).toString());
};

const getKugouToplistCover = async (id: string) => {
  const cached = kugouToplistCoverCache.get(id);
  if (cached) return cached;
  try {
    const cover = await fetchRandomKugouToplistCover();
    const finalCover = cover || DEFAULT_ALBUM_COVER;
    kugouToplistCoverCache.set(id, finalCover);
    return finalCover;
  } catch (error: any) {
    serverLog.warn("酷狗榜单随机封面获取失败，使用默认封面:", error?.message || error);
    return DEFAULT_ALBUM_COVER;
  }
};

const getPlatformLyric = async (platform: PlatformType, song: Record<string, any>) => {
  if (platform === "qq") return fetchQQLyric(song);
  if (platform === "kuwo") return fetchKuwoLyric(song);
  return fetchKugouLyric(song);
};

export const initPlatformMusicAPI = async (fastify: FastifyInstance) => {
  fastify.get("/platform-music", async (_, reply) => {
    reply.send({
      name: "PlatformMusicAPI",
      description: "第三方音乐平台本地直连接口",
      list: [
        "/api/platform-music/search",
        "/api/platform-music/toplists",
        "/api/platform-music/toplist",
        "/api/platform-music/cover",
        "/api/platform-music/lyric",
      ],
    });
  });

  fastify.get(
    "/platform-music/search",
    async (
      req: FastifyRequest<{
        Querystring: {
          platform: PlatformType;
          keyword: string;
          page?: string;
          pageSize?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { platform, keyword } = req.query;
      const page = Math.max(1, Number(req.query.page || 1));
      const pageSize = Math.max(1, Math.min(Number(req.query.pageSize || 50), 100));
      if (!platform || !keyword) {
        return reply.status(400).send({ code: 400, message: "platform 和 keyword 为必填项" });
      }
      try {
        const result =
          platform === "qq"
            ? await fetchQQSearch(keyword, page, pageSize)
            : platform === "kuwo"
              ? await fetchKuwoSearch(keyword, pageSize)
              : await fetchKugouSearch(keyword, page, pageSize);
        return reply.send({ code: 200, ...result });
      } catch (error: any) {
        serverLog.error("第三方搜索失败:", error?.message || error);
        return reply.status(500).send({ code: 500, message: error?.message || "搜索失败" });
      }
    },
  );

  fastify.get(
    "/platform-music/toplists",
    async (
      req: FastifyRequest<{ Querystring: { platform: PlatformType } }>,
      reply: FastifyReply,
    ) => {
      const { platform } = req.query;
      if (!platform) {
        return reply.status(400).send({ code: 400, message: "platform 为必填项" });
      }
      try {
        const list =
          platform === "qq"
            ? await fetchQqToplists()
            : platform === "kuwo"
              ? await fetchKuwoToplists()
              : await fetchKugouToplists();
        return reply.send({ code: 200, list });
      } catch (error: any) {
        serverLog.error("第三方排行榜获取失败:", error?.message || error);
        return reply.status(500).send({ code: 500, message: error?.message || "排行榜获取失败" });
      }
    },
  );

  fastify.get(
    "/platform-music/toplist",
    async (
      req: FastifyRequest<{ Querystring: { platform: PlatformType; id: string } }>,
      reply: FastifyReply,
    ) => {
      const { platform, id } = req.query;
      if (!platform || !id) {
        return reply.status(400).send({ code: 400, message: "platform 和 id 为必填项" });
      }
      try {
        const result =
          platform === "qq"
            ? await fetchQqToplistDetail(id)
            : platform === "kuwo"
              ? await fetchKuwoToplistDetail(id)
              : await fetchKugouToplistDetail(id);
        return reply.send({ code: 200, ...result });
      } catch (error: any) {
        serverLog.error("第三方榜单详情获取失败:", error?.message || error);
        return reply.status(500).send({ code: 500, message: error?.message || "榜单详情获取失败" });
      }
    },
  );

  fastify.post(
    "/platform-music/cover",
    async (
      req: FastifyRequest<{
        Body: {
          platform: PlatformType;
          song: Record<string, any>;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { platform, song } = req.body || {};
      if (!platform || !song) {
        return reply.status(400).send({ code: 400, message: "platform 和 song 为必填项" });
      }
      try {
        const cover = await getPlatformCover(platform, song);
        return reply.send({ code: 200, cover: cover || "" });
      } catch (error: any) {
        serverLog.error("第三方封面获取失败:", error?.message || error);
        return reply.status(500).send({ code: 500, message: error?.message || "封面获取失败" });
      }
    },
  );

  fastify.post(
    "/platform-music/lyric",
    async (
      req: FastifyRequest<{
        Body: {
          platform: PlatformType;
          song: Record<string, any>;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { platform, song } = req.body || {};
      if (!platform || !song) {
        return reply.status(400).send({ code: 400, message: "platform 和 song 为必填项" });
      }
      try {
        const result = await getPlatformLyric(platform, song);
        return reply.send({ code: 200, ...(result || { lrc: "", trans: "", roma: "", qrc: "" }) });
      } catch (error: any) {
        serverLog.error("第三方歌词获取失败:", error?.message || error);
        return reply.status(500).send({ code: 500, message: error?.message || "歌词获取失败" });
      }
    },
  );

  serverLog.info("🌐 Register PlatformMusicAPI successfully");
};
