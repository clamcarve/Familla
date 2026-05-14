import type { MusicPlatformType } from "@/types/main";
import { defineStore } from "pinia";

interface PlatformState {
  currentPlatform: MusicPlatformType;
}

export const platformNameMap: Record<MusicPlatformType, string> = {
  netease: "网易云",
  qq: "QQ 音乐",
  kuwo: "酷我音乐",
  kugou: "酷狗音乐",
};

export const platformValueOptions = (Object.keys(platformNameMap) as MusicPlatformType[]).map(
  (value) => ({
    label: platformNameMap[value],
    value,
  }),
);

export const usePlatformStore = defineStore("platform", {
  state: (): PlatformState => ({
    currentPlatform: "netease",
  }),
  getters: {
    currentPlatformName: (state) => platformNameMap[state.currentPlatform],
    isNetease: (state) => state.currentPlatform === "netease",
    isThirdParty: (state) => state.currentPlatform !== "netease",
  },
  actions: {
    setPlatform(platform: MusicPlatformType) {
      this.currentPlatform = platform;
    },
  },
  persist: {
    key: "platform-store",
    storage: localStorage,
    pick: ["currentPlatform"],
  },
});
