import { open } from "node:fs/promises";

/**
 * 按文件头识别音频格式
 * @param filePath 文件路径
 * @returns 扩展名，无法识别时返回 null
 */
export const detectAudioType = async (filePath: string): Promise<string | null> => {
  const handle = await open(filePath, "r");
  try {
    const header = Buffer.alloc(16);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    const bytes = header.subarray(0, bytesRead);
    const ascii = (start: number, end: number) => bytes.toString("latin1", start, end);
    if (ascii(0, 3) === "ID3" && bytesRead >= 10) {
      // 跳过 ID3 头判断真实格式
      const id3Size =
        ((bytes[6] & 0x7f) << 21) |
        ((bytes[7] & 0x7f) << 14) |
        ((bytes[8] & 0x7f) << 7) |
        (bytes[9] & 0x7f);
      const marker = Buffer.alloc(4);
      await handle.read(marker, 0, marker.length, 10 + id3Size);
      return marker.toString("latin1") === "fLaC" ? "flac" : "mp3";
    }
    if (ascii(0, 4) === "fLaC") return "flac";
    if (ascii(4, 8) === "ftyp") return "m4a";
    if (ascii(0, 4) === "OggS") return "ogg";
    if (ascii(0, 4) === "RIFF") return "wav";
    if (bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0) return "aac";
    if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return "mp3";
    // 错误页面不能当作音频保存
    if (/^\s*[<{]/.test(ascii(0, bytesRead))) throw new Error("下载内容不是有效的音频文件");
    return null;
  } finally {
    await handle.close();
  }
};
