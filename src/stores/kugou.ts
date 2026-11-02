import { claimKugouDailyVip, clearKugouUrlCache } from "@/api/kugou";
import { defineStore } from "pinia";

interface KugouState {
  cookie: string;
  nickname: string;
  lastCheckInDate: string;
  checkInMessage: string;
}

// 酷狗活动按北京时间跨天
const getBeijingDate = () => new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);

export const useKugouStore = defineStore("kugou", {
  state: (): KugouState => ({
    cookie: "",
    nickname: "",
    lastCheckInDate: "",
    checkInMessage: "",
  }),
  getters: {
    isLoggedIn: (state) => Boolean(state.cookie),
  },
  actions: {
    setCredential(cookie: string, nickname = "") {
      this.cookie = cookie;
      this.nickname = nickname;
      this.lastCheckInDate = "";
      this.checkInMessage = "";
      clearKugouUrlCache();
    },
    logout() {
      this.setCredential("");
    },
    /**
     * 领取每日畅听 VIP
     * @param silent 静默模式，当日已领取时跳过
     */
    async checkIn(silent = false) {
      if (!this.cookie) return;
      const date = getBeijingDate();
      if (silent && this.lastCheckInDate === date) return;
      try {
        const result = await claimKugouDailyVip(this.cookie, date);
        if (!result) return;
        this.checkInMessage = result.detail;
        if (result.claimed) {
          this.lastCheckInDate = date;
          // 新权益生效后重新取播放地址
          clearKugouUrlCache();
        }
      } catch (error) {
        console.warn("酷狗签到失败:", error);
        if (!silent) this.checkInMessage = "签到失败，请稍后重试";
      }
    },
  },
  persist: {
    key: "kugou-store",
    storage: localStorage,
  },
});
