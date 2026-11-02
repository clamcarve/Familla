import { BrowserWindow, ipcMain } from "electron";
import {
  cancelAiPluginDownload,
  downloadAiPlugin,
  getAiPluginStatus,
  importAiPlugin,
  readAiPluginAudio,
  readAiPluginWeights,
  removeAiPlugin,
} from "../services/AiPluginService";

const PROGRESS_INTERVAL = 200;

/**
 * AI 节拍插件 IPC
 */
const initAiPluginIpc = (): void => {
  ipcMain.handle("ai-plugin:status", () => getAiPluginStatus());
  ipcMain.handle("ai-plugin:import", (event) =>
    importAiPlugin(BrowserWindow.fromWebContents(event.sender)),
  );
  ipcMain.handle("ai-plugin:download", (event) => {
    let lastSent = 0;
    return downloadAiPlugin((received, total) => {
      const now = Date.now();
      if (now - lastSent < PROGRESS_INTERVAL || event.sender.isDestroyed()) return;
      lastSent = now;
      event.sender.send("ai-plugin:progress", { received, total });
    });
  });
  ipcMain.handle("ai-plugin:cancel", () => cancelAiPluginDownload());
  ipcMain.handle("ai-plugin:remove", () => removeAiPlugin());
  ipcMain.handle("ai-plugin:weights", (_event, name: string) => readAiPluginWeights(name));
  ipcMain.handle("ai-plugin:read-audio", (_event, path: string) => readAiPluginAudio(path));
};

export default initAiPluginIpc;
