// 替换 Folia 的多语言模块，渲染层只需要少量中文文案
const TEXT: Record<string, string> = {
  "common.reset": "重置",
};

export const t = (key: string, fallback?: unknown): string => {
  if (typeof fallback === "string") return TEXT[key] ?? fallback;
  const options = fallback as { defaultValue?: string } | undefined;
  return TEXT[key] ?? options?.defaultValue ?? "";
};

const i18n = { language: "zh-CN", t };

export const useTranslation = () => ({ t, i18n });
export default i18n;
