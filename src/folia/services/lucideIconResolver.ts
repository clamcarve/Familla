// 不接入 AI 主题图标，避免打包全部 lucide 图标
export type LucideIconStatus = "loading" | "ready" | "missing";
export const loadLucideIcons = async (_names: readonly unknown[] | undefined): Promise<void> => {};
export const hasLucideIcon = async (_name: string): Promise<boolean> => false;
export const resolveLucideIcon = (_name: string | null | undefined): any => null;
export const resolveLucideIconNode = (_name: string | null | undefined): any => null;
export const getLucideIconStatus = (_name: string | null | undefined): LucideIconStatus => "missing";
export const resolveLucideIconNames = (_names: readonly string[] | undefined): string[] => [];
export const subscribeLucideIcons = (_listener: () => void) => () => {};
export const getLucideIconRevision = () => 0;
