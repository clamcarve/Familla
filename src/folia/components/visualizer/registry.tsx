import React from "react";
import type { VisualizerMode } from "../../types";
import type { VisualizerRegistryEntry, VisualizerSharedProps } from "./definition";
import { fumeBackgroundConfig } from "./fume/backgroundConfig";
import { nebbiaBackgroundConfig, nebbiaShowsBackground } from "./nebbia/nebbiaBehind";
import hanabiTuning from "./hanabi/tuning";
import nebbiaTuning from "./nebbia/tuning";
import { nebbiaBeatEffectOnScreen } from "./nebbia/nebbiaBehind";
import { BEAT_EFFECT_IDS } from "../../services/beatFx/beatEffects";

// 只保留本应用接入的样式，去掉 Folia 的设置面板和命令面板
const lazyMode = (load: () => Promise<{ default: React.ComponentType<any> }>) => {
  const Component = React.lazy(load);
  return (props: VisualizerSharedProps) => <Component {...props} />;
};

// 这两种样式的调参不走通用属性
const Hanabi = React.lazy(() => import("./hanabi/VisualizerHanabi"));
const Nebbia = React.lazy(() => import("./nebbia/VisualizerNebbia"));

const define = (
  mode: string,
  order: number,
  render: VisualizerRegistryEntry["render"],
  extra: Partial<VisualizerRegistryEntry> = {},
): VisualizerRegistryEntry =>
  ({
    mode,
    order,
    labelKey: "",
    labelFallback: mode,
    previewSeed: mode,
    previewStartOffset: 0,
    render,
    ...extra,
  }) as unknown as VisualizerRegistryEntry;

export const VISUALIZER_REGISTRY: VisualizerRegistryEntry[] = [
  define("classic", 30, lazyMode(() => import("./classic/Visualizer"))),
  define("tilt", 70, lazyMode(() => import("./tilt/VisualizerTilt"))),
  define("partita", 50, lazyMode(() => import("./partita/VisualizerPartita"))),
  define("claddagh", 80, lazyMode(() => import("./claddagh/VisualizerCladdagh"))),
  define("monet", 90, lazyMode(() => import("./monet/VisualizerMonet")), {
    seeksOnLineClick: true,
  }),
  define("fume", 60, lazyMode(() => import("./fume/VisualizerFume")), {
    background: fumeBackgroundConfig,
  }),
  define("cadenza", 40, lazyMode(() => import("./cadenza/VisualizerCadenza"))),
  define("pendolo", 100, lazyMode(() => import("./pendolo/VisualizerPendolo")), {
    seeksOnLineClick: true,
    beatEffects: [
      { id: BEAT_EFFECT_IDS.pendoloDrumhead, nameKey: "", descKey: "", source: "drums" },
      { id: BEAT_EFFECT_IDS.pendoloGearBeats, nameKey: "", descKey: "", source: "beats", retired: true },
    ],
  }),
  define("cappella", 110, lazyMode(() => import("./cappella/VisualizerCappella"))),
  define("hanabi", 26, (props) => (
    <Hanabi {...(props as any)} hanabiTuning={hanabiTuning.read(props.visualizerTunings)} />
  ), {
    beatEffects: [
      { id: BEAT_EFFECT_IDS.hanabiBeatBursts, nameKey: "", descKey: "", source: "beats" },
      { id: BEAT_EFFECT_IDS.hanabiBeatPulse, nameKey: "", descKey: "", source: "beats" },
    ],
  }),
  define("lumiere", 25, lazyMode(() => import("./lumiere/VisualizerLumiere"))),
  define("sonnet", 10, lazyMode(() => import("./sonnet/VisualizerSonnet")), {
    beatEffects: [{ id: BEAT_EFFECT_IDS.sonnetLensTear, nameKey: "", descKey: "", source: "beats" }],
  }),
  define("tempera", 20, lazyMode(() => import("./tempera/VisualizerTempera")), {
    beatEffects: [{ id: BEAT_EFFECT_IDS.temperaInkFlash, nameKey: "", descKey: "", source: "drums" }],
  }),
  define("nebbia", 29, (props) => (
    <Nebbia {...(props as any)} nebbiaTuning={nebbiaTuning.read(props.visualizerTunings)} />
  ), {
    background: nebbiaBackgroundConfig,
    showsBackground: nebbiaShowsBackground,
    beatEffectOnScreen: nebbiaBeatEffectOnScreen,
    beatEffects: [
      {
        id: BEAT_EFFECT_IDS.nebbiaDrizzleRide,
        nameKey: "",
        descKey: "",
        source: "stems",
        parts: [
          { key: "rain", nameKey: "" },
          { key: "bump", nameKey: "" },
        ],
      },
      {
        id: BEAT_EFFECT_IDS.nebbiaAquaBeat,
        nameKey: "",
        descKey: "",
        source: "beats",
        parts: [
          { key: "jelly", nameKey: "" },
          { key: "weed", nameKey: "" },
          { key: "bubble", nameKey: "" },
          { key: "spot", nameKey: "" },
        ],
      },
    ],
  }),
];

export const getVisualizerRegistryEntry = (mode: VisualizerMode): VisualizerRegistryEntry =>
  VISUALIZER_REGISTRY.find((entry) => entry.mode === mode) ?? VISUALIZER_REGISTRY[0];
export const hasVisualizerMode = (mode: unknown): boolean =>
  VISUALIZER_REGISTRY.some((entry) => entry.mode === mode);
