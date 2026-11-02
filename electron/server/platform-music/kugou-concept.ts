import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import axios from "axios";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { serverLog } from "../../main/logger";

const GATEWAY = "https://gateway.kugou.com";
const LOGIN_BASE = "https://login-user.kugou.com";
const VIP_BASE = "https://kugouvip.kugou.com";
const APP_ID = 3116;
const CLIENT_VERSION = 11440;
const SONG_URL_VERSION = 11430;
const ANDROID_SALT = "LnT6xpN3khm36zse0QzvmgTZ3waWdRSA";
const WEB_SALT = "NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt";
const SONG_URL_KEY_SALT = "185672dd44712f60bb1736df5a377e82";
const LISTEN_VIP_SOURCE_ID = 90139;
const ALREADY_CLAIMED_CODE = 131001;
const VERIFICATION_CODE = 20028;
const QUALITY_ORDER = [
  "super",
  "multitrack",
  "viper_atmos",
  "viper_tape",
  "viper_clear",
  "high",
  "flac",
  "320",
  "128",
];
const REQUEST_QUALITIES = [
  "128",
  "320",
  "flac",
  "high",
  "viper_atmos",
  "viper_tape",
  "viper_clear",
  "super",
  "multitrack",
];

type Params = Record<string, unknown>;
type Cookies = Record<string, string>;

type KugouRequest = {
  baseUrl: string;
  path: string;
  method?: "GET" | "POST";
  query?: Params;
  body?: Params;
  headers?: Record<string, string | number>;
  allowStatusZero?: boolean;
};

type QualityOption = {
  key: string;
  hash: string;
  albumId: string;
  albumAudioId: string;
};

class KugouBusinessError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message || `酷狗接口返回错误（${code}）`);
  }
}

class KugouLoginExpiredError extends Error {
  constructor() {
    super("酷狗登录已失效，请重新扫码");
  }
}

const md5 = (value: string) => createHash("md5").update(value).digest("hex");
const text = (value: unknown) => String(value ?? "").trim();
const toInt = (value: unknown) => Number.parseInt(text(value), 10) || 0;
const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
const asList = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const randomText = (length: number) => {
  const chars = "1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return Array.from({ length }, () => chars[randomInt(chars.length)]).join("");
};

const randomGuid = () => {
  const hex = randomBytes(16).toString("hex");
  const variant = "89ab"[randomInt(4)];
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

const parseCookie = (cookie: string): Cookies => {
  const values: Cookies = {};
  for (const part of cookie.split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key && value) values[key] = value;
  }
  return values;
};

const joinCookie = (values: Cookies) =>
  Object.entries(values)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");

// 补全设备参数，登录后随 cookie 一起保存
const withDeviceCookies = (cookie: string): Cookies => {
  const values = parseCookie(cookie);
  const guid = values["KUGOU_API_GUID"] || randomGuid();
  values["dfid"] ||= randomText(24);
  values["KUGOU_API_GUID"] = guid;
  values["KUGOU_API_MID"] ||= BigInt(`0x${md5(guid)}`).toString();
  values["KUGOU_API_DEV"] ||= randomText(10);
  values["KUGOU_API_MAC"] ||= "02:00:00:00:00:00";
  values["KUGOU_API_WEBGL"] ||= String(randomInt(2 ** 31));
  return values;
};

const buildHeaders = (cookies: Cookies, router?: string): Record<string, string> => ({
  "User-Agent": "Android15-1070-11083-46-0-DiscoveryDRADProtocol-wifi",
  Cookie: joinCookie(cookies),
  dfid: cookies["dfid"] || "-",
  mid: cookies["KUGOU_API_MID"] || "",
  "kg-rc": "1",
  "kg-thash": "5d816a0",
  "kg-rec": "1",
  "kg-rf": "B9EDA08A64250DEFFBCADDEE00F8F25F",
  ...(router ? { "x-router": router } : {}),
});

const deviceParams = (cookies: Cookies, clientTime: number): Params => ({
  dfid: cookies["dfid"] || "-",
  mid: cookies["KUGOU_API_MID"] || "",
  uuid: "-",
  appid: APP_ID,
  clientver: CLIENT_VERSION,
  clienttime: clientTime,
  ...(cookies["token"] ? { token: cookies["token"] } : {}),
  ...(cookies["userid"] ? { userid: cookies["userid"] } : {}),
});

const sendRequest = async ({
  baseUrl,
  path,
  method = "GET",
  query = {},
  body,
  headers = {},
  allowStatusZero = false,
}: KugouRequest): Promise<Record<string, any>> => {
  const response = await axios.request({
    url: `${baseUrl}${path}`,
    method,
    params: query,
    data: body ? JSON.stringify(body) : headers["content-type"] ? "" : undefined,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
    responseType: "text",
    timeout: 18000,
    validateStatus: () => true,
  });
  let root: Record<string, any> | null = null;
  try {
    root = asRecord(JSON.parse(String(response.data)));
  } catch {
    root = null;
  }
  if (response.status !== 200 || !root) {
    throw new Error(`酷狗接口请求失败（${response.status}）`);
  }
  const errorCode = toInt(root["error_code"] ?? root["errcode"] ?? root["err_code"]);
  const statusZero = root["status"] !== undefined && toInt(root["status"]) === 0;
  if ((statusZero && !allowStatusZero) || errorCode !== 0) {
    const message = text(root["err_msg"] ?? root["error_msg"] ?? root["message"] ?? root["error"]);
    throw new KugouBusinessError(errorCode, message);
  }
  return root;
};

// 登录接口使用网页签名
const webRequest = (cookies: Cookies, baseUrl: string, path: string, query: Params) => {
  const params: Params = { ...deviceParams(cookies, Math.floor(Date.now() / 1000)), ...query };
  const raw = Object.keys(params)
    .map((key) => `${key}=${params[key]}`)
    .sort()
    .join("");
  params["signature"] = md5(`${WEB_SALT}${raw}${WEB_SALT}`);
  return sendRequest({ baseUrl, path, query: params, headers: buildHeaders(cookies) });
};

// 业务接口使用安卓签名
const androidRequest = (
  cookies: Cookies,
  options: Pick<KugouRequest, "path" | "method" | "query" | "body" | "headers"> & {
    baseUrl?: string;
    router?: string;
  },
) => {
  const clientTime = Math.floor(Date.now() / 1000);
  const params: Params = { ...deviceParams(cookies, clientTime), ...options.query };
  const raw = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("");
  const data = options.body ? JSON.stringify(options.body) : "";
  params["signature"] = md5(`${ANDROID_SALT}${raw}${data}${ANDROID_SALT}`);
  return sendRequest({
    baseUrl: options.baseUrl || GATEWAY,
    path: options.path,
    method: options.method,
    query: params,
    body: options.body,
    headers: {
      ...buildHeaders(cookies, options.router),
      clienttime: clientTime,
      ...options.headers,
    },
  });
};

const createQrLogin = async () => {
  const root = await webRequest(withDeviceCookies(""), LOGIN_BASE, "/v2/qrcode", {
    appid: 1001,
    type: 1,
    plat: 4,
    qrcode_txt: `https://h5.kugou.com/apps/loginQRCode/html/index.html?appid=${APP_ID}&`,
    srcappid: 2919,
  });
  const key = text(root["data"]?.["qrcode"] ?? root["data"]?.["key"]);
  if (!key) throw new Error("酷狗接口未返回二维码");
  return {
    key,
    content: `https://h5.kugou.com/apps/loginQRCode/html/index.html?qrcode=${key}`,
  };
};

const checkQrLogin = async (key: string) => {
  const root = await webRequest(withDeviceCookies(""), LOGIN_BASE, "/v2/get_userinfo_qrcode", {
    plat: 4,
    appid: APP_ID,
    srcappid: 2919,
    qrcode: key,
  });
  const data = asRecord(root["data"]);
  const parts = [text(root["cookie"]), text(data["cookie"])];
  for (const [name, value] of [
    ["token", data["token"]],
    ["userid", data["userid"] ?? data["user_id"]],
    ["dfid", data["dfid"]],
    ["t1", data["t1"]],
  ] as const) {
    if (text(value)) parts.push(`${name}=${text(value)}`);
  }
  const accountCookie = parseCookie(parts.join(";"));
  return {
    status: toInt(data["status"] ?? root["status"]),
    message: text(data["msg"] ?? data["message"] ?? root["message"]),
    nickname: text(data["nickname"]),
    cookie: accountCookie["token"]
      ? joinCookie(withDeviceCookies(joinCookie(accountCookie)))
      : undefined,
  };
};

const fetchVipDetail = (cookies: Cookies) =>
  androidRequest(cookies, {
    baseUrl: VIP_BASE,
    path: "/v1/get_union_vip",
    query: { busi_type: "concept" },
  });

const fetchVipSummary = async (cookies: Cookies) => {
  try {
    const root = await fetchVipDetail(cookies);
    const items = asList(asRecord(root["data"])["busi_vip"]).map(asRecord);
    return {
      conceptVipActive: items.some(
        (item) => text(item["product_type"]) === "svip" && toInt(item["is_vip"]) === 1,
      ),
      summary: items
        .map((item) => {
          const label = text(item["product_type"]) === "svip" ? "概念版 VIP" : "畅听 VIP";
          const end = text(item["vip_end_time"]);
          const active = toInt(item["is_vip"]) === 1;
          return `${label}${active ? "有效" : "未开通"}${active && end ? `，到期 ${end}` : ""}`;
        })
        .join("；"),
    };
  } catch {
    return { conceptVipActive: false, summary: "" };
  }
};

const withSummary = (message: string, summary: string) =>
  summary ? `${message}；${summary}` : message;

const claimDailyVip = async (cookie: string, receiveDay: string) => {
  const cookies = withDeviceCookies(cookie);
  let alreadyClaimed = false;
  try {
    await androidRequest(cookies, {
      path: "/youth/v1/recharge/receive_vip_listen_song",
      method: "POST",
      query: { source_id: LISTEN_VIP_SOURCE_ID, receive_day: receiveDay },
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
  } catch (error) {
    if (error instanceof KugouBusinessError && error.code === ALREADY_CLAIMED_CODE) {
      alreadyClaimed = true;
    } else {
      const { summary } = await fetchVipSummary(cookies);
      const reason = error instanceof Error ? error.message : "未知错误";
      return { claimed: false, detail: withSummary(`畅听 VIP 领取失败：${reason}`, summary) };
    }
  }
  const claimedText = alreadyClaimed ? "今日畅听 VIP 已领取" : "畅听 VIP 领取成功";
  try {
    await androidRequest(cookies, {
      path: "/youth/v1/listen_song/upgrade_vip_reward",
      method: "POST",
      query: { kugouid: toInt(cookies["userid"]), ad_type: 1 },
    });
    const { summary } = await fetchVipSummary(cookies);
    return { claimed: true, detail: withSummary(`${claimedText}，概念版 VIP 升级成功`, summary) };
  } catch {
    const { conceptVipActive, summary } = await fetchVipSummary(cookies);
    const upgradeText = conceptVipActive ? "概念版 VIP 当前有效" : "概念版 VIP 升级失败";
    return { claimed: true, detail: withSummary(`${claimedText}，${upgradeText}`, summary) };
  }
};

const fetchSongIdentity = async (hash: string) => {
  try {
    const info = await sendRequest({
      baseUrl: "https://m.kugou.com",
      path: "/app/i/getSongInfo.php",
      query: { cmd: "playInfo", hash },
      headers: { "User-Agent": "Mozilla/5.0", Referer: "https://www.kugou.com/" },
      allowStatusZero: true,
    });
    return {
      albumId: text(info["album_id"] ?? info["albumid"] ?? info["req_albumid"]),
      albumAudioId: text(info["album_audio_id"] ?? info["mixsongid"] ?? info["MixSongID"]),
    };
  } catch {
    return { albumId: "", albumAudioId: "" };
  }
};

const fetchQualityOptions = async (cookies: Cookies, hash: string, albumId: string) => {
  const root = await androidRequest(cookies, {
    path: "/v2/get_res_privilege/lite",
    method: "POST",
    router: "media.store.kugou.com",
    body: {
      appid: APP_ID,
      area_code: 1,
      behavior: "play",
      clientver: CLIENT_VERSION,
      need_hash_offset: 1,
      relate: 1,
      support_verify: 1,
      resource: [{ type: "audio", page_id: 0, hash, album_id: toInt(albumId) }],
      qualities: REQUEST_QUALITIES,
    },
  });
  const options = new Map<string, QualityOption>();
  const append = (item: Record<string, any>, parent?: Record<string, any>) => {
    const key = text(item["quality"]).toLowerCase();
    const variantHash = text(item["hash"]);
    if (!key || !variantHash || toInt(item["level"]) <= 0 || options.has(key)) return;
    options.set(key, {
      key,
      hash: variantHash,
      albumId: text(item["album_id"] ?? item["albumId"] ?? parent?.["album_id"]),
      albumAudioId: text(
        item["album_audio_id"] ??
          item["albumAudioId"] ??
          item["mixsongid"] ??
          parent?.["album_audio_id"] ??
          parent?.["mixsongid"],
      ),
    });
  };
  for (const raw of asList(root["data"])) {
    const item = asRecord(raw);
    append(item);
    for (const related of asList(item["relate_goods"])) append(asRecord(related), item);
  }
  return [...options.values()];
};

const qualityRank = (key: string) => {
  const index = QUALITY_ORDER.indexOf(key);
  return index < 0 ? QUALITY_ORDER.length : index;
};

// 只取不高于目标的音质，都没有时才用账号可用音质
const selectQualityCandidates = (options: QualityOption[], desired: string) => {
  const ordered = [...options].sort((a, b) => qualityRank(a.key) - qualityRank(b.key));
  const allowed = ordered.filter((item) => qualityRank(item.key) >= qualityRank(desired));
  return allowed.length ? allowed : ordered;
};

const requestSongUrl = async (
  cookies: Cookies,
  option: QualityOption,
  albumId: string,
  albumAudioId: string,
) => {
  const hash = option.hash.toLowerCase();
  const userId = cookies["userid"] || "";
  const params: Params = {
    dfid: cookies["dfid"] || "-",
    mid: cookies["KUGOU_API_MID"] || "",
    uuid: "-",
    appid: APP_ID,
    clienttime: Math.floor(Date.now() / 1000),
    ...(cookies["token"] ? { token: cookies["token"] } : {}),
    ...(userId ? { userid: userId } : {}),
    album_id: toInt(option.albumId || albumId),
    area_code: 1,
    hash,
    ssa_flag: "is_fromtrack",
    version: SONG_URL_VERSION,
    page_id: 967177915,
    quality: option.key,
    album_audio_id: toInt(option.albumAudioId || albumAudioId),
    behavior: "play",
    pid: 411,
    cmd: 26,
    pidversion: 3001,
    IsFreePart: 0,
    ppage_id: "356753938,823673182,967485191",
    cdnBackup: 1,
    module: "",
    clientver: SONG_URL_VERSION,
  };
  params["key"] = md5(
    `${hash}${SONG_URL_KEY_SALT}${APP_ID}${cookies["KUGOU_API_MID"]}${userId || 0}`,
  );
  const raw = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("");
  params["signature"] = md5(`${ANDROID_SALT}${raw}${ANDROID_SALT}`);
  const root = await sendRequest({
    baseUrl: GATEWAY,
    path: "/v5/url",
    query: params,
    headers: buildHeaders(cookies, "trackercdn.kugou.com"),
  });
  const data = asRecord(root["data"]);
  const value =
    data["url"] ??
    data["play_url"] ??
    data["playUrl"] ??
    root["url"] ??
    root["play_url"] ??
    root["playUrl"];
  const urls = Array.isArray(value) ? value.map(text) : [text(value)];
  return urls.find((url) => url.startsWith("http")) || "";
};

const isLoginExpired = async (cookies: Cookies) => {
  try {
    await fetchVipDetail(cookies);
    return false;
  } catch (error) {
    if (!(error instanceof KugouBusinessError)) return false;
    return error.code !== VERIFICATION_CODE && !error.message.includes("验证");
  }
};

const resolveSongUrl = async (body: {
  cookie: string;
  hash: string;
  albumId?: string;
  albumAudioId?: string;
  quality?: string;
}) => {
  const cookies = withDeviceCookies(body.cookie);
  if (!cookies["token"]) throw new KugouLoginExpiredError();
  let albumId = text(body.albumId);
  let albumAudioId = text(body.albumAudioId);
  if (!albumId || !albumAudioId) {
    const identity = await fetchSongIdentity(body.hash);
    albumId ||= identity.albumId;
    albumAudioId ||= identity.albumAudioId;
  }
  try {
    const options = await fetchQualityOptions(cookies, body.hash, albumId);
    const candidates = selectQualityCandidates(options, text(body.quality) || "128");
    if (!candidates.length) throw new Error("酷狗账号没有可用的播放音质");
    let lastError: unknown;
    for (const option of candidates) {
      try {
        const url = await requestSongUrl(cookies, option, albumId, albumAudioId);
        if (url) return { url, quality: option.key };
        lastError = new Error(`酷狗账号未返回 ${option.key} 音质的播放地址`);
      } catch (error) {
        lastError = error;
        if (
          error instanceof KugouBusinessError &&
          (error.code === VERIFICATION_CODE || error.message.includes("验证"))
        ) {
          throw error;
        }
      }
    }
    throw lastError;
  } catch (error) {
    if (await isLoginExpired(cookies)) throw new KugouLoginExpiredError();
    throw error;
  }
};

const replyError = (reply: FastifyReply, label: string, error: unknown) => {
  const message = error instanceof Error ? error.message : label;
  serverLog.error(`${label}:`, message);
  const status = error instanceof KugouLoginExpiredError ? 401 : 500;
  return reply.status(status).send({ code: status, message });
};

export const initKugouConceptAPI = (fastify: FastifyInstance) => {
  fastify.post("/platform-music/kugou/qr/key", async (_, reply) => {
    try {
      return reply.send({ code: 200, ...(await createQrLogin()) });
    } catch (error) {
      return replyError(reply, "酷狗二维码获取失败", error);
    }
  });

  fastify.post(
    "/platform-music/kugou/qr/check",
    async (req: FastifyRequest<{ Body: { key: string } }>, reply: FastifyReply) => {
      if (!req.body?.key) return reply.status(400).send({ code: 400, message: "key 为必填项" });
      try {
        return reply.send({ code: 200, ...(await checkQrLogin(req.body.key)) });
      } catch (error) {
        return replyError(reply, "酷狗扫码状态获取失败", error);
      }
    },
  );

  fastify.post(
    "/platform-music/kugou/checkin",
    async (
      req: FastifyRequest<{ Body: { cookie: string; receiveDay: string } }>,
      reply: FastifyReply,
    ) => {
      const { cookie, receiveDay } = req.body || {};
      if (!cookie || !receiveDay) {
        return reply.status(400).send({ code: 400, message: "cookie 和 receiveDay 为必填项" });
      }
      try {
        return reply.send({ code: 200, ...(await claimDailyVip(cookie, receiveDay)) });
      } catch (error) {
        return replyError(reply, "酷狗签到失败", error);
      }
    },
  );

  fastify.post(
    "/platform-music/kugou/url",
    async (
      req: FastifyRequest<{
        Body: {
          cookie: string;
          hash: string;
          albumId?: string;
          albumAudioId?: string;
          quality?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      if (!req.body?.cookie || !req.body?.hash) {
        return reply.status(400).send({ code: 400, message: "cookie 和 hash 为必填项" });
      }
      try {
        return reply.send({ code: 200, ...(await resolveSongUrl(req.body)) });
      } catch (error) {
        return replyError(reply, "酷狗播放地址获取失败", error);
      }
    },
  );
};
