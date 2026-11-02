// 各样式的默认参数，不依赖渲染代码
const modules = import.meta.glob<{ default: { mode: string; defaults: Record<string, unknown> } }>(
  "./components/visualizer/*/tuning.ts",
  { eager: true },
);

export const FOLIA_TUNING_DEFAULTS: Record<string, Record<string, unknown>> = Object.fromEntries(
  Object.values(modules).map(({ default: tuning }) => [tuning.mode, tuning.defaults]),
);
