import type { LyricLine } from "@applemusic-like-lyrics/lyric";
import type { CoverColors } from "@/types/main";

// 歌词与主题转换

export type FoliaWord = { text: string; startTime: number; endTime: number };

export type FoliaLine = {
  words: FoliaWord[];
  startTime: number;
  endTime: number;
  fullText: string;
  translation?: string;
  romanization?: string;
};

export type FoliaTheme = {
  name: string;
  backgroundColor: string;
  primaryColor: string;
  accentColor: string;
  secondaryColor: string;
  fontStyle: "sans";
  animationIntensity: "normal";
};

const CJK = /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/;
const PUNCTUATION = /[，。！？、：；"'）]/;
const MIN_LINE_SECONDS = 0.1;
const FALLBACK_LINE_SECONDS = 5;
const READING_SECONDS_PER_CHAR = 0.5;

// 逐行歌词按字数估算每个字的时间
const buildTimedWords = (text: string, start: number, end: number): FoliaWord[] => {
  const tokens: { text: string; weight: number }[] = [];
  for (const token of text.split(/\s+/).filter(Boolean)) {
    if (CJK.test(token)) {
      for (const char of token) tokens.push({ text: char, weight: PUNCTUATION.test(char) ? 0 : 1 });
    } else {
      tokens.push({ text: token, weight: 1 + token.length * 0.15 });
    }
  }
  const total = tokens.reduce((sum, token) => sum + token.weight, 0) || 1;
  const perWeight = (Math.max(end - start, MIN_LINE_SECONDS) * 0.9) / total;
  let cursor = start;
  return tokens.map((token) => {
    const wordEnd = cursor + token.weight * perWeight;
    const word = { text: token.text, startTime: cursor, endTime: wordEnd };
    cursor = wordEnd;
    return word;
  });
};

/**
 * 转换为 Folia 歌词
 * @param lyric 应用内歌词，优先逐字
 * @returns 按时间排序的歌词行，时间单位为秒
 */
export const toFoliaLines = (lyric: {
  lrcData: LyricLine[];
  yrcData: LyricLine[];
}): FoliaLine[] => {
  const isWordTimed = lyric.yrcData.length > 0;
  const source = (isWordTimed ? lyric.yrcData : lyric.lrcData).filter((line) => !line.isBG);
  return source
    .map((line, index): FoliaLine | null => {
      const fullText = line.words.map((word) => word.word).join("");
      if (!fullText.trim()) return null;
      const startTime = line.startTime / 1000;
      const next = source[index + 1];
      const reading = fullText.length * READING_SECONDS_PER_CHAR + 2;
      const estimated = next ? next.startTime / 1000 : startTime + FALLBACK_LINE_SECONDS;
      const endTime =
        line.endTime > line.startTime
          ? line.endTime / 1000
          : Math.min(estimated, Math.max(startTime + FALLBACK_LINE_SECONDS, startTime + reading));
      return {
        words: isWordTimed
          ? line.words
              .filter((word) => word.word)
              .map((word) => ({
                text: word.word,
                startTime: word.startTime / 1000,
                endTime: word.endTime / 1000,
              }))
          : buildTimedWords(fullText, startTime, endTime),
        startTime,
        endTime,
        fullText,
        ...(line.translatedLyric ? { translation: line.translatedLyric } : {}),
        ...(line.romanLyric ? { romanization: line.romanLyric } : {}),
      };
    })
    .filter((line): line is FoliaLine => line !== null);
};

/**
 * 查找当前歌词行
 * @param lines 歌词行
 * @param time 当前时间（秒）
 * @returns 最后一条已开始的行，未开始时为 -1
 */
export const findFoliaLineIndex = (lines: FoliaLine[], time: number): number => {
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (lines[middle].startTime <= time) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
};

const toHex = ({ r, g, b }: { r: number; g: number; b: number }) =>
  `#${[r, g, b]
    .map((value) =>
      Math.max(0, Math.min(255, Math.round(value)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

const mix = (color: { r: number; g: number; b: number }, target: number, amount: number) => ({
  r: color.r + (target - color.r) * amount,
  g: color.g + (target - color.g) * amount,
  b: color.b + (target - color.b) * amount,
});

/**
 * 由封面主色生成深色主题
 * @param colors 封面主题
 */
export const toFoliaTheme = (colors?: Partial<CoverColors>): FoliaTheme => {
  const main = (colors?.main as { r: number; g: number; b: number } | undefined) ?? {
    r: 120,
    g: 120,
    b: 130,
  };
  return {
    name: "封面主题",
    backgroundColor: toHex(mix(main, 0, 0.82)),
    primaryColor: toHex(mix(main, 255, 0.92)),
    accentColor: toHex(mix(main, 255, 0.45)),
    secondaryColor: toHex(mix(main, 255, 0.35)),
    fontStyle: "sans",
    animationIntensity: "normal",
  };
};
