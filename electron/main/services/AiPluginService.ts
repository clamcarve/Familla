import { app, BrowserWindow, dialog, net } from "electron";
import { createHash } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { unzipSync } from "fflate";
import { processLog } from "../logger";

export const AI_PLUGIN_URL =
  "https://github.com/clamcarve/Familla/releases/download/ai-plugin-v1/familla-ai-beat-plugin-v1.zip";

// 固定模型的长度和哈希，校验不过的文件不安装
const MODELS = {
  beat_this: {
    file: "beat_this-wgsl.bin",
    bytes: 41102271,
    sha256: "6365ae5ba2e42922772da01fbfd0bde8dd20b7362a679018e78a5f251fe8a967",
  },
  htdemucs: {
    file: "htdemucs-wgsl.bin",
    bytes: 91838176,
    sha256: "27d5331a74a4e23b18172b3d59d0378e698fd79bc0d0fed3316da77e3a37d8d1",
  },
} as const;

type ModelName = keyof typeof MODELS;
const WEIGHTS_MAGIC = "FOLIABTW";
const WEIGHTS_TRAILER = WEIGHTS_MAGIC.length + 8;
const AUDIO_EXTENSIONS = [".sc", ".mp3", ".flac", ".m4a", ".aac", ".ogg", ".opus", ".wav", ".ape"];
const MAX_AUDIO_BYTES = 1024 * 1024 * 1024;

export type AiPluginResult = { ok: boolean; message?: string };

const pluginDir = () => join(app.getPath("userData"), "plugins", "ai-beat");

let downloadAbort: AbortController | null = null;

export const getAiPluginStatus = async () => {
  const sizes = await Promise.all(
    Object.values(MODELS).map(async (model) => {
      try {
        return (await stat(join(pluginDir(), model.file))).size === model.bytes ? model.bytes : 0;
      } catch {
        return 0;
      }
    }),
  );
  return {
    installed: sizes.every((size) => size > 0),
    bytes: sizes.reduce<number>((sum, size) => sum + size, 0),
    url: AI_PLUGIN_URL,
    downloading: downloadAbort !== null,
  };
};

// 校验并写入插件包中的模型
const installFromZip = async (zipPath: string): Promise<AiPluginResult> => {
  let entries: Record<string, Uint8Array>;
  try {
    const expected = new Set<string>(Object.values(MODELS).map((model) => model.file));
    entries = unzipSync(new Uint8Array(await readFile(zipPath)), {
      filter: (file) => expected.has(file.name),
    });
  } catch {
    return { ok: false, message: "文件不是有效的 AI 节拍插件包" };
  }
  for (const model of Object.values(MODELS)) {
    const data = entries[model.file];
    if (!data) return { ok: false, message: `插件包缺少 ${model.file}` };
    const hash = createHash("sha256").update(data).digest("hex");
    if (data.byteLength !== model.bytes || hash !== model.sha256) {
      return { ok: false, message: `${model.file} 校验失败，插件包可能已损坏` };
    }
  }
  const dir = pluginDir();
  await mkdir(dir, { recursive: true });
  for (const model of Object.values(MODELS)) {
    const target = join(dir, model.file);
    const temp = `${target}.tmp`;
    await new Promise<void>((done, fail) => {
      const stream = createWriteStream(temp);
      stream.on("error", fail);
      stream.end(entries[model.file], () => done());
    });
    await rename(temp, target);
  }
  return { ok: true };
};

export const importAiPlugin = async (win: BrowserWindow | null): Promise<AiPluginResult> => {
  const options: Electron.OpenDialogOptions = {
    title: "选择 AI 节拍插件包",
    properties: ["openFile"],
    filters: [{ name: "AI 节拍插件包", extensions: ["zip"] }],
  };
  const picked = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options);
  if (picked.canceled || !picked.filePaths[0]) return { ok: false };
  return installFromZip(picked.filePaths[0]);
};

export const downloadAiPlugin = async (
  onProgress: (received: number, total: number) => void,
): Promise<AiPluginResult> => {
  if (downloadAbort) return { ok: false, message: "正在下载中" };
  const abort = new AbortController();
  downloadAbort = abort;
  const dir = pluginDir();
  const temp = join(dir, "download.zip.tmp");
  try {
    await mkdir(dir, { recursive: true });
    const response = await net.fetch(AI_PLUGIN_URL, { signal: abort.signal });
    if (!response.ok || !response.body) {
      return { ok: false, message: `下载失败（HTTP ${response.status}），可手动下载后导入` };
    }
    const total = Number(response.headers.get("content-length")) || 0;
    const output = createWriteStream(temp);
    const reader = response.body.getReader();
    let received = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (!output.write(value))
          await new Promise<void>((next) => output.once("drain", () => next()));
        onProgress(received, total);
      }
    } finally {
      await new Promise<void>((closed) => output.end(() => closed()));
    }
    return await installFromZip(temp);
  } catch (error) {
    if (abort.signal.aborted) return { ok: false, message: "已取消下载" };
    processLog.error("AI plugin download failed:", error);
    return { ok: false, message: "下载失败，请检查网络后重试，或手动下载后导入" };
  } finally {
    downloadAbort = null;
    await rm(temp, { force: true }).catch(() => {});
  }
};

export const cancelAiPluginDownload = (): void => downloadAbort?.abort();

export const removeAiPlugin = async (): Promise<void> => {
  await rm(pluginDir(), { recursive: true, force: true });
};

// 模型文件格式：张量、清单 JSON、魔数、清单偏移
export const readAiPluginWeights = async (name: string) => {
  const model = MODELS[name as ModelName];
  if (!model) return null;
  const path = join(pluginDir(), model.file);
  if (!existsSync(path)) return null;
  try {
    const file = await readFile(path);
    const magicAt = file.byteLength - WEIGHTS_TRAILER;
    if (file.toString("latin1", magicAt, magicAt + WEIGHTS_MAGIC.length) !== WEIGHTS_MAGIC)
      return null;
    const offset = Number(file.readBigUInt64LE(file.byteLength - 8));
    if (!(offset > 0 && offset < magicAt)) return null;
    const manifest = JSON.parse(file.toString("utf8", offset, magicAt));
    if (manifest.bytes !== offset) return null;
    return { weights: new Uint8Array(file.buffer, file.byteOffset, offset), manifest };
  } catch (error) {
    processLog.warn(`Read AI plugin weights failed: ${name}`, error);
    return null;
  }
};

// 只读音频文件，分析本地和已缓存的歌曲
export const readAiPluginAudio = async (filePath: string): Promise<Uint8Array | null> => {
  const path = resolve(filePath);
  if (!AUDIO_EXTENSIONS.includes(extname(path).toLowerCase())) return null;
  try {
    if ((await stat(path)).size > MAX_AUDIO_BYTES) return null;
    return new Uint8Array(await readFile(path));
  } catch {
    return null;
  }
};
