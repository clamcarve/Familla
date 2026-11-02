// Folia 渲染层在单独的 React 环境中运行，这里只声明对外接口
declare module "@folia-stage" {
  import type { FoliaLine, FoliaTheme } from "@/core/folia/lyrics";

  export type FoliaStageState = {
    mode: string;
    background: string;
    lines: FoliaLine[];
    lineIndex: number;
    theme: FoliaTheme;
    title?: string;
    artist?: string;
    album?: string;
    cover?: string;
    seed?: string | number;
    paused: boolean;
    tunings?: Record<string, Record<string, unknown>>;
    backgroundOptions?: Record<string, unknown>;
    nomandEffect?: string;
    smartBeat?: { mode: "off" | "cached" | "on"; effects: Record<string, unknown> };
    song?: {
      id: number | string;
      name?: string;
      durationMs?: number;
      audioUrl?: string;
      localPath?: string;
    } | null;
  };

  export type FoliaFrame = {
    time: number;
    power: number;
    bass: number;
    lowMid: number;
    mid: number;
    vocal: number;
    treble: number;
    spectrum?: Uint8Array;
    audioTime?: number;
    playing?: boolean;
  };

  export type FoliaStage = {
    update(patch: Partial<FoliaStageState>): void;
    frame(frame: FoliaFrame): void;
    unmount(): void;
  };

  export const mountFoliaStage: (
    element: HTMLElement,
    initial: FoliaStageState,
    onError: (error: unknown) => void,
    onSeek?: (seconds: number) => void,
  ) => FoliaStage;
}
