import React from "react";
import { DEFAULT_NOMAND_BACKGROUND_TUNING, type VisualizerBackgroundMode } from "../../../types";
import type { VisualizerBackgroundRegistryEntry, VisualizerBackgroundRenderProps } from "./definition";
import FluidBackground from "./common/FluidBackground";
import GeometricBackground from "./common/GeometricBackground";
import NomandBackgroundLayer, { resolveNomandSourceUrl } from "./nomand/NomandBackgroundLayer";

// 只保留本应用接入的背景，隐现、莫奈、空、嵌入不接入
export const DEFAULT_VISUALIZER_BACKGROUND_MODE: VisualizerBackgroundMode = "common" as VisualizerBackgroundMode;

const common = {
  mode: "common",
  order: 10,
  song: ({ config, coverUrl, seed, staticMode }: VisualizerBackgroundRenderProps) => [
    staticMode ? null : (seed ?? null),
    config?.common?.useCoverColorBg ? (coverUrl ?? null) : null,
  ],
  render: ({ config, theme, coverUrl, audioPower, audioBands, seed, staticMode, paused }: VisualizerBackgroundRenderProps) => {
    const settings = config?.common;
    const useCoverColorBg = settings?.useCoverColorBg ?? false;
    return (
      <>
        {useCoverColorBg && (
          <div className="absolute inset-0 z-0">
            <FluidBackground coverUrl={coverUrl} theme={theme} />
          </div>
        )}
        <div
          className="absolute inset-0 z-0 transition-all duration-1000"
          style={{ backgroundColor: theme.backgroundColor, opacity: useCoverColorBg ? (settings?.opacity ?? 0.75) : 1 }}
        />
        {!staticMode && (
          <div className="absolute inset-0 z-0">
            <GeometricBackground
              theme={theme}
              audioPower={audioPower}
              audioBands={audioBands}
              seed={seed}
              hideShapes={settings?.disableGeometricBackground ?? false}
              disableVignette={settings?.disableVignette ?? false}
              paused={paused}
            />
          </div>
        )}
      </>
    );
  },
} as unknown as VisualizerBackgroundRegistryEntry;

const nomand = {
  mode: "nomand",
  order: 30,
  song: ({ config, coverUrl }: VisualizerBackgroundRenderProps) => [
    resolveNomandSourceUrl(coverUrl, config?.customImage, {
      ...DEFAULT_NOMAND_BACKGROUND_TUNING,
      ...(config as any)?.nomand?.tuning,
    }),
  ],
  render: ({ config, coverUrl, theme, isDaylight }: VisualizerBackgroundRenderProps) => (
    <NomandBackgroundLayer
      coverUrl={coverUrl}
      monetBackgroundImage={config?.customImage}
      tuning={(config as any)?.nomand?.tuning}
      theme={theme}
      isDaylight={isDaylight}
    />
  ),
} as unknown as VisualizerBackgroundRegistryEntry;

export const VISUALIZER_BACKGROUND_REGISTRY = [common, nomand];
export const hasVisualizerBackgroundMode = (mode: unknown): mode is VisualizerBackgroundMode =>
  VISUALIZER_BACKGROUND_REGISTRY.some((entry) => entry.mode === mode);
export const getVisualizerBackgroundRegistryEntry = (mode: VisualizerBackgroundMode) =>
  VISUALIZER_BACKGROUND_REGISTRY.find((entry) => entry.mode === mode) ?? common;
