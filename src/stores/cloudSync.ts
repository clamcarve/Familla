import { defineStore } from "pinia";
import type { CloudPopup, CloudUserInfo, MembershipStatus } from "@/api/cloudSync";

interface CloudSyncState {
  token: string;
  user: CloudUserInfo | null;
  membership: MembershipStatus | null;
  lastReadPopupId: number | null;
}

export const useCloudSyncStore = defineStore("cloud-sync", {
  state: (): CloudSyncState => ({
    token: "",
    user: null,
    membership: null,
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
      this.membership = null;
    },
    setUser(user: CloudUserInfo | null) {
      this.user = user;
    },
    setMembership(membership: MembershipStatus | null) {
      this.membership = membership;
    },
    setRemainingToday(remaining: number) {
      if (!this.membership) return;
      this.membership.remaining_today = Math.max(0, remaining);
      this.membership.used_today = Math.max(
        0,
        this.membership.daily_limit - this.membership.remaining_today,
      );
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
