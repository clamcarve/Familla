import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { MyPlaylistType } from "@/types/main";

export const CLOUD_BACKUP_FORMAT = "flutter_music_cloud_zip_backup";

const CLOUD_BACKUP_VERSION = 1;
const CLOUD_MANIFEST_FORMAT = "flutter_music_webdav_backup";
const CLOUD_ASSET_POLICY = "exclude_local_assets";
const MAX_ARCHIVE_SIZE = 7 * 1024 * 1024;
const MAX_ENTRY_SIZE = 64 * 1024 * 1024;
const MANIFEST_ENTRY = "manifest.json";
const ALLOWED_CLOUD_FILE = "listening_heatmap.json";

type JsonRecord = Record<string, unknown>;

type CloudBackupFile = {
  original: string;
  relative: string;
};

export type CloudBackupManifest = JsonRecord & {
  format: string;
  version: number;
  assetPolicy: string;
  savedAtMs: number;
  preferences: JsonRecord;
  excludedPreferenceKeys: string[];
  files: CloudBackupFile[];
};

export type CloudBackupSnapshot = {
  format: string;
  version: number;
  id: number;
  name: string;
  size: number;
  sha256: string;
  savedAtMs: number;
  archiveBase64: string;
};

export type DecodedCloudBackup = {
  manifest: CloudBackupManifest;
  retainedFiles: Record<string, Uint8Array>;
};

const toRecord = (value: unknown): JsonRecord | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
};

const toFiniteInteger = (value: unknown): number | null => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(number) ? number : null;
};

const sha256Hex = async (bytes: Uint8Array): Promise<string> => {
  const source = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest("SHA-256", source.buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const decodeBase64 = (value: string): Uint8Array => {
  if (
    !value ||
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    throw new Error("云端备份数据损坏");
  }
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    throw new Error("云端备份数据损坏");
  }
};

const encodeBase64 = (bytes: Uint8Array): string => {
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
};

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

const crc32 = (bytes: Uint8Array): number => {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
};

const findEndOfCentralDirectory = (bytes: Uint8Array): number => {
  const minimumOffset = Math.max(0, bytes.length - 65557);
  for (let offset = bytes.length - 22; offset >= minimumOffset; offset -= 1) {
    if (
      bytes[offset] === 0x50 &&
      bytes[offset + 1] === 0x4b &&
      bytes[offset + 2] === 0x05 &&
      bytes[offset + 3] === 0x06
    ) {
      return offset;
    }
  }
  throw new Error("云端备份 ZIP 结构损坏");
};

const readZipCrcMap = (bytes: Uint8Array): Map<string, number> => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOffset = findEndOfCentralDirectory(bytes);
  const entryCount = view.getUint16(endOffset + 10, true);
  let offset = view.getUint32(endOffset + 16, true);
  if (entryCount === 0xffff || offset === 0xffffffff) {
    throw new Error("云端备份 ZIP 版本不受支持");
  }

  const result = new Map<string, number>();
  const decoder = new TextDecoder();
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("云端备份 ZIP 结构损坏");
    }
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > bytes.length) throw new Error("云端备份 ZIP 结构损坏");
    const name = decoder.decode(bytes.subarray(nameStart, nameEnd));
    result.set(name, view.getUint32(offset + 16, true));
    offset = nameEnd + extraLength + commentLength;
  }
  return result;
};

const validateZipEntries = (
  archiveBytes: Uint8Array,
  entries: Record<string, Uint8Array>,
): void => {
  const crcMap = readZipCrcMap(archiveBytes);
  for (const [name, bytes] of Object.entries(entries)) {
    if (bytes.length > MAX_ENTRY_SIZE) throw new Error("云端备份文件过大");
    const expectedCrc = crcMap.get(name);
    if (expectedCrc === undefined || crc32(bytes) !== expectedCrc) {
      throw new Error("云端备份 ZIP 校验失败");
    }
  }
  if (crcMap.size !== Object.keys(entries).length) {
    throw new Error("云端备份 ZIP 结构损坏");
  }
};

const normalizeManifest = (value: unknown): CloudBackupManifest => {
  const manifest = toRecord(value);
  if (!manifest || manifest["format"] !== CLOUD_MANIFEST_FORMAT) {
    throw new Error("云端备份清单格式不受支持");
  }
  if (toFiniteInteger(manifest["version"]) !== CLOUD_BACKUP_VERSION) {
    throw new Error("云端备份清单版本不受支持，请升级客户端");
  }
  if (manifest["assetPolicy"] !== CLOUD_ASSET_POLICY) {
    throw new Error("云端备份资源策略无效");
  }
  const preferences = toRecord(manifest["preferences"]);
  if (!preferences) throw new Error("云端备份清单缺少设置数据");

  const rawExcludedPreferenceKeys = manifest["excludedPreferenceKeys"];
  if (
    rawExcludedPreferenceKeys !== undefined &&
    (!Array.isArray(rawExcludedPreferenceKeys) ||
      rawExcludedPreferenceKeys.some((key) => typeof key !== "string" || !key))
  ) {
    throw new Error("云端备份排除项格式无效");
  }
  const excludedPreferenceKeys = (rawExcludedPreferenceKeys || []) as string[];
  if (!Array.isArray(manifest["files"])) throw new Error("云端备份文件清单格式无效");
  const rawFiles = manifest["files"];
  const files = rawFiles.map((value) => {
    const file = toRecord(value);
    const original = typeof file?.["original"] === "string" ? file["original"].trim() : "";
    const relative = typeof file?.["relative"] === "string" ? file["relative"].trim() : "";
    if (!original || relative !== ALLOWED_CLOUD_FILE) {
      throw new Error("云端备份文件路径无效");
    }
    return { original, relative };
  });

  return {
    ...manifest,
    format: CLOUD_MANIFEST_FORMAT,
    version: CLOUD_BACKUP_VERSION,
    assetPolicy: CLOUD_ASSET_POLICY,
    savedAtMs: toFiniteInteger(manifest["savedAtMs"]) || 0,
    preferences,
    excludedPreferenceKeys,
    files,
  };
};

const formatBackupName = (date: Date): string => {
  const pad = (value: number) => String(value).padStart(2, "0");
  const datePart = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const timePart = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `mobi_cloud_backup_${datePart}_${timePart}.zip`;
};

export const parseCloudBackupSnapshot = (value: unknown): CloudBackupSnapshot | null => {
  const snapshot = toRecord(value);
  if (!snapshot || Object.keys(snapshot).length === 0) return null;
  if (snapshot["format"] !== CLOUD_BACKUP_FORMAT) {
    throw new Error("云端数据不是受支持的 ZIP 备份，已停止覆盖");
  }
  if (toFiniteInteger(snapshot["version"]) !== CLOUD_BACKUP_VERSION) {
    throw new Error("云端备份版本不受支持，请升级客户端");
  }

  const id = toFiniteInteger(snapshot["id"]);
  const size = toFiniteInteger(snapshot["size"]);
  const savedAtMs = toFiniteInteger(snapshot["savedAtMs"]);
  const name = typeof snapshot["name"] === "string" ? snapshot["name"] : "";
  const sha256 = typeof snapshot["sha256"] === "string" ? snapshot["sha256"].toLowerCase() : "";
  const archiveBase64 =
    typeof snapshot["archiveBase64"] === "string" ? snapshot["archiveBase64"] : "";
  if (
    id === null ||
    id <= 0 ||
    size === null ||
    size <= 0 ||
    size > MAX_ARCHIVE_SIZE ||
    savedAtMs === null ||
    !name ||
    !/^[a-f0-9]{64}$/.test(sha256) ||
    !archiveBase64
  ) {
    throw new Error("云端备份元数据损坏");
  }
  if (archiveBase64.length !== Math.ceil(size / 3) * 4) {
    throw new Error("云端备份数据损坏");
  }
  return {
    format: CLOUD_BACKUP_FORMAT,
    version: CLOUD_BACKUP_VERSION,
    id,
    name,
    size,
    sha256,
    savedAtMs,
    archiveBase64,
  };
};

export const decodeCloudBackup = async (
  snapshot: CloudBackupSnapshot,
): Promise<DecodedCloudBackup> => {
  const archiveBytes = decodeBase64(snapshot.archiveBase64);
  if (archiveBytes.length !== snapshot.size) throw new Error("云端备份校验失败");
  if ((await sha256Hex(archiveBytes)) !== snapshot.sha256) {
    throw new Error("云端备份校验失败");
  }

  let entries: Record<string, Uint8Array>;
  try {
    let expandedSize = 0;
    entries = unzipSync(archiveBytes, {
      filter: (file) => {
        if (file.originalSize > MAX_ENTRY_SIZE) throw new Error("云端备份文件过大");
        expandedSize += file.originalSize;
        if (expandedSize > MAX_ENTRY_SIZE) throw new Error("云端备份展开数据过大");
        return true;
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("云端备份")) throw error;
    throw new Error("云端备份 ZIP 数据损坏");
  }
  validateZipEntries(archiveBytes, entries);

  const manifestBytes = entries[MANIFEST_ENTRY];
  if (!manifestBytes) throw new Error("云端备份缺少 manifest.json");
  let manifestValue: unknown;
  try {
    manifestValue = JSON.parse(strFromU8(manifestBytes));
  } catch {
    throw new Error("云端备份清单损坏");
  }
  const manifest = normalizeManifest(manifestValue);

  const retainedFiles: Record<string, Uint8Array> = {};
  const allowedEntries = new Set([MANIFEST_ENTRY]);
  for (const file of manifest.files) {
    const entryName = `files/${file.relative}`;
    const entry = entries[entryName];
    if (!entry) throw new Error("云端备份声明的文件不存在");
    retainedFiles[entryName] = entry;
    allowedEntries.add(entryName);
  }
  if (Object.keys(entries).some((name) => !allowedEntries.has(name))) {
    throw new Error("云端备份包含未声明文件");
  }
  return { manifest, retainedFiles };
};

export const createEmptyCloudManifest = (): CloudBackupManifest => ({
  format: CLOUD_MANIFEST_FORMAT,
  version: CLOUD_BACKUP_VERSION,
  assetPolicy: CLOUD_ASSET_POLICY,
  savedAtMs: Date.now(),
  preferences: {},
  excludedPreferenceKeys: [],
  files: [],
});

export const buildCloudBackupSnapshot = async (
  sourceManifest: CloudBackupManifest,
  retainedFiles: Record<string, Uint8Array>,
  playlists: MyPlaylistType[],
  mapPlaylist: (playlist: MyPlaylistType) => unknown,
): Promise<CloudBackupSnapshot> => {
  const now = new Date();
  const nowMs = now.getTime();
  const manifest: CloudBackupManifest = {
    ...sourceManifest,
    savedAtMs: nowMs,
    preferences: {
      ...sourceManifest.preferences,
      user_playlists: JSON.stringify(playlists.map(mapPlaylist)),
    },
    excludedPreferenceKeys: [...sourceManifest.excludedPreferenceKeys],
    files: sourceManifest.files.map((file) => ({ ...file })),
  };
  for (const key of manifest.excludedPreferenceKeys) delete manifest.preferences[key];

  const entries: Record<string, Uint8Array> = {
    [MANIFEST_ENTRY]: strToU8(JSON.stringify(manifest)),
    ...retainedFiles,
  };
  const archiveBytes = zipSync(entries, { level: 9 });
  if (archiveBytes.length === 0 || archiveBytes.length > MAX_ARCHIVE_SIZE) {
    throw new Error("云端备份超过 7 MiB 限制");
  }

  return {
    format: CLOUD_BACKUP_FORMAT,
    version: CLOUD_BACKUP_VERSION,
    id: nowMs,
    name: formatBackupName(now),
    size: archiveBytes.length,
    sha256: await sha256Hex(archiveBytes),
    savedAtMs: nowMs,
    archiveBase64: encodeBase64(archiveBytes),
  };
};
