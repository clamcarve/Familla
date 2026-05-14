import { defineStore } from "pinia";
import type { CloudPopup, CloudUserInfo } from "@/api/cloudSync";

interface CloudSyncState {
  token: string;
  user: CloudUserInfo | null;
  lastReadPopupId: number | null;
}

export const useCloudSyncStore = defineStore("cloud-sync", {
  state: (): CloudSyncState => ({
    token: "",
    user: null,
    lastReadPopupId: null,
  }),
  getters: {
    isLoggedIn(state): boolean {
      return !!state.token;
    },
  },
  actions: {
    setSession(token: string, user: CloudUserInfo | null) {
      this.token = String(token || "").trim();
      this.user = user;
    },
    clearSession() {
      this.token = "";
      this.user = null;
    },
    markPopupRead(popup: CloudPopup | null) {
      this.lastReadPopupId = popup?.id ?? null;
    },
    shouldShowPopup(popup: CloudPopup | null): boolean {
      if (!popup?.id) return false;
      return this.lastReadPopupId !== popup.id;
    },
  },
  persist: {
    key: "cloud-sync-store",
    storage: localStorage,
  },
});
