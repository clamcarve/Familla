import React, { Suspense, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import VisualizerRenderer from "./components/visualizer/VisualizerRenderer";
import { getVisualizerTuning, getVisualizerTuningModes } from "./components/visualizer/tuningRegistry";
import { audioBands, audioPower, lyricCurrentTime } from "./stores/motionSignals";
import { annotateLyricLines } from "./utils/lyrics/renderHints";
import { tickBeatFx } from "./services/beatFx/beatFxLive";
import { setVisualizerSettings } from "./stores/useVisualizerSettingsStore";
import { setPlaybackSong, type HostSong } from "./stores/usePlaybackStore";
import type { Line, Theme, VisualizerMode } from "./types";
import "./folia-tailwind.css";

// 本应用与 Folia 渲染层的唯一接口

export type FoliaStageState = {
  mode: string;
  background: string;
  lines: Line[];
  lineIndex: number;
  theme: Theme;
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
  song?: HostSong | null;
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

const BeatFxHost = React.lazy(() => import("./BeatFxHost"));
const tuningModes = getVisualizerTuningModes();
const tuningCache = new Map<string, { source: unknown; value: unknown }>();

// 用户调节合并默认值，没变时保持同一个对象，样式才不会重建
const resolveTunings = (overrides: Record<string, Record<string, unknown>> = {}) =>
  Object.fromEntries(
    tuningModes.map((mode) => {
      const source = overrides[mode];
      const cached = tuningCache.get(mode);
      if (cached && cached.source === source) return [mode, cached.value];
      const adapter = getVisualizerTuning(mode) as any;
      const merged = { ...adapter.defaults, ...source };
      const value = adapter.storage?.read ? adapter.storage.read(merged) : merged;
      tuningCache.set(mode, { source, value });
      return [mode, value];
    }),
  );

const syncAnalysisState = (state: FoliaStageState, tunings: Record<string, unknown>) => {
  const settingsFields = Object.fromEntries(
    tuningModes.map((mode) => [(getVisualizerTuning(mode) as any).settingsKey, tunings[mode]]),
  );
  setVisualizerSettings({
    ...settingsFields,
    smartBeat: state.smartBeat ?? { mode: "off", effects: {} },
    visualizerMode: state.mode,
    visualizerBackgroundMode: state.background,
  });
  setPlaybackSong(state.song ?? null, !state.paused);
};

class StageBoundary extends React.Component<
  { onError: (error: unknown) => void; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    this.props.onError(error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export const mountFoliaStage = (
  element: HTMLElement,
  initial: FoliaStageState,
  onError: (error: unknown) => void,
  onSeek?: (seconds: number) => void,
) => {
  let state = { ...initial, lines: annotateLyricLines(initial.lines) };
  syncAnalysisState(state, resolveTunings(state.tunings));
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const Stage = () => {
    const shown = useSyncExternalStore(subscribe, () => state);
    const background = {
      mode: shown.background as never,
      common: { useCoverColorBg: true, opacity: 0.72, ...shown.backgroundOptions },
      nomand: { tuning: { effect: shown.nomandEffect ?? "dithering" } },
    };
    const tunings = resolveTunings(shown.tunings);
    const beatOn = shown.smartBeat?.mode === "on" || shown.smartBeat?.mode === "cached";
    return (
      <StageBoundary key={shown.mode} onError={onError}>
        <Suspense fallback={null}>
      {beatOn && <BeatFxHost />}
      <VisualizerRenderer
        mode={shown.mode as VisualizerMode}
        animateStyleSwitch
        currentTime={lyricCurrentTime}
        currentLineIndex={shown.lineIndex}
        lines={shown.lines}
        theme={shown.theme}
        subtitleTheme={shown.theme}
        isDaylight={false}
        audioPower={audioPower}
        audioBands={audioBands}
        showText
        songTitle={shown.title}
        songArtist={shown.artist}
        songAlbum={shown.album}
        coverUrl={shown.cover}
        seed={shown.seed}
        paused={shown.paused}
        visualizerOpacity={1}
        background={background}
        visualizerTunings={tunings as never}
        lyricsFontScale={1}
        subtitleFontScale={1}
        subtitleOverlayOpacity={1}
        subtitleOverlayBackground={false}
        subtitleUpcomingLyricsBlur
        showHarmonySubtitle
        harmonySubtitleBackground={false}
        showSubtitleTranslation
        subtitleContentMode="translation"
        subtitleOverlayLayout="translation"
        onLyricLineSeek={onSeek}
      />
        </Suspense>
      </StageBoundary>
    );
  };

  const root = createRoot(element);
  root.render(<Stage />);

  return {
    update(patch: Partial<FoliaStageState>) {
      state = { ...state, ...patch, ...(patch.lines ? { lines: annotateLyricLines(patch.lines) } : {}) };
      syncAnalysisState(state, resolveTunings(state.tunings));
      listeners.forEach((listener) => listener());
    },
    frame(frame: FoliaFrame) {
      lyricCurrentTime.set(frame.time);
      audioPower.set(frame.power);
      audioBands.bass.set(frame.bass);
      audioBands.lowMid.set(frame.lowMid);
      audioBands.mid.set(frame.mid);
      audioBands.vocal.set(frame.vocal);
      audioBands.treble.set(frame.treble);
      if (frame.spectrum) audioBands.spectrum?.set(frame.spectrum as Uint8Array<ArrayBuffer>);
      if (state.smartBeat && state.smartBeat.mode !== "off") {
        // 节拍时钟只需要当前播放位置
        tickBeatFx(
          { paused: !frame.playing, ended: false, currentTime: frame.audioTime ?? frame.time } as HTMLMediaElement,
          null,
        );
      }
    },
    unmount() {
      root.unmount();
      listeners.clear();
    },
  };
};

export type FoliaStage = ReturnType<typeof mountFoliaStage>;
