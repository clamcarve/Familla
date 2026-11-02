// 模型由 AI 节拍插件提供，通过主进程读取
type Reply = { weights: Uint8Array; manifest: unknown } | null;
const invoke = (channel: string, ...args: unknown[]) =>
  (window as any).electron?.ipcRenderer?.invoke(channel, ...args);

export const aiHost = {
  getBeatThisGpuWeights: (_model?: string): Promise<Reply> => invoke("ai-plugin:weights", "beat_this"),
  getHtdemucsGpuWeights: (): Promise<Reply> => invoke("ai-plugin:weights", "htdemucs"),
  getAutomixModelsPresent: async () => {
    const status = await invoke("ai-plugin:status");
    const installed = Boolean(status?.installed);
    return { beat_this: installed, htdemucs: false, htdemucs_gpu: installed };
  },
  runBeatThis: undefined as undefined | ((...args: any[]) => Promise<any>),
};
