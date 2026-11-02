import { isElectron } from "@/utils/env";
import { ref } from "vue";

// AI 节拍插件状态

export type AiPluginStatus = {
  installed: boolean;
  bytes: number;
  url: string;
};

export const aiPluginStatus = ref<AiPluginStatus>({ installed: false, bytes: 0, url: "" });
export const aiPluginProgress = ref<{ received: number; total: number } | null>(null);

const invoke = <T>(channel: string): Promise<T> => window.electron.ipcRenderer.invoke(channel);

export const refreshAiPlugin = async (): Promise<void> => {
  if (!isElectron) return;
  try {
    aiPluginStatus.value = await invoke<AiPluginStatus>("ai-plugin:status");
  } catch (error) {
    console.warn("读取 AI 节拍插件状态失败:", error);
  }
};

const report = async (result: { ok: boolean; message?: string }, success: string) => {
  await refreshAiPlugin();
  if (result.ok) window.$message.success(success);
  else if (result.message) window.$message.error(result.message);
};

export const downloadAiPlugin = async (): Promise<void> => {
  const onProgress = (_event: unknown, progress: { received: number; total: number }) => {
    aiPluginProgress.value = progress;
  };
  window.electron.ipcRenderer.on("ai-plugin:progress", onProgress);
  aiPluginProgress.value = { received: 0, total: 0 };
  try {
    await report(await invoke("ai-plugin:download"), "AI 节拍插件安装完成");
  } finally {
    window.electron.ipcRenderer.removeListener("ai-plugin:progress", onProgress);
    aiPluginProgress.value = null;
  }
};

export const cancelAiPluginDownload = (): Promise<void> => invoke("ai-plugin:cancel");

export const importAiPlugin = async (): Promise<void> => {
  await report(await invoke("ai-plugin:import"), "AI 节拍插件安装完成");
};

export const removeAiPlugin = async (): Promise<void> => {
  await invoke("ai-plugin:remove");
  await refreshAiPlugin();
};
