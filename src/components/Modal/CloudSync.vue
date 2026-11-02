<template>
  <div class="login cloud-sync">
    <img src="/icons/favicon.png?asset" alt="logo" class="logo" />
    <n-tabs v-model:value="activeTab" class="login-tabs" type="segment" animated>
      <n-tab-pane v-if="cloudSyncStore.isLoggedIn" name="account" tab="账户">
        <n-spin :show="actionLoading.account">
          <n-flex vertical :size="14">
            <n-descriptions :column="1" bordered label-placement="left" size="small">
              <n-descriptions-item label="mobi 账号">
                {{ cloudSyncStore.user?.email || cloudSyncStore.membership?.email || "未知账号" }}
              </n-descriptions-item>
              <n-descriptions-item label="会员状态">
                <n-tag :type="membershipTagType" size="small" :bordered="false">
                  {{ membershipLabel }}
                </n-tag>
              </n-descriptions-item>
              <n-descriptions-item label="VIP 到期">
                {{ membershipExpiry }}
              </n-descriptions-item>
              <n-descriptions-item label="今日解析">
                {{ parseUsageText }}
              </n-descriptions-item>
              <n-descriptions-item label="统计日期">
                {{ cloudSyncStore.membership?.usage_date || "--" }}（UTC）
              </n-descriptions-item>
            </n-descriptions>
            <n-progress
              type="line"
              :percentage="parseUsagePercentage"
              :status="cloudSyncStore.membership?.remaining_today === 0 ? 'error' : 'success'"
              :show-indicator="false"
            />
            <n-flex :wrap="false">
              <n-button secondary block @click="openPurchasePage">
                <template #icon>
                  <SvgIcon name="Star" />
                </template>
                购买 VIP
              </n-button>
              <n-button secondary block @click="showRedeemInput = !showRedeemInput">
                <template #icon>
                  <SvgIcon name="Password" />
                </template>
                卡密兑换
              </n-button>
            </n-flex>
            <n-collapse-transition :show="showRedeemInput">
              <n-flex vertical :size="10">
                <n-input
                  v-model:value="activationCode"
                  clearable
                  placeholder="请输入 VIP 卡密"
                  @keyup.enter="handleRedeem"
                />
                <n-button
                  type="primary"
                  :disabled="!activationCode.trim()"
                  :loading="actionLoading.redeem"
                  @click="handleRedeem"
                >
                  确认兑换
                </n-button>
              </n-flex>
            </n-collapse-transition>
            <n-button secondary :loading="actionLoading.account" @click="refreshAccount">
              <template #icon>
                <SvgIcon name="Refresh" />
              </template>
              刷新会员信息
            </n-button>
          </n-flex>
        </n-spin>
      </n-tab-pane>
      <n-tab-pane name="login" tab="mobi登录">
        <n-flex vertical :size="12">
          <n-alert v-if="cloudSyncStore.isLoggedIn" type="success" show-icon>
            当前已登录：{{ cloudSyncStore.user?.email || "云端账号" }}
          </n-alert>
          <n-input v-model:value="loginForm.email" placeholder="请输入邮箱" />
          <n-input
            v-model:value="loginForm.password"
            type="password"
            show-password-on="click"
            placeholder="请输入密码"
          />
          <n-flex justify="space-between" align="center">
            <n-button secondary @click="logoutCloudAccount" :disabled="!cloudSyncStore.isLoggedIn">
              退出登录
            </n-button>
            <n-button type="primary" :loading="actionLoading.login" @click="handleLogin">
              mobi登录
            </n-button>
          </n-flex>
        </n-flex>
      </n-tab-pane>
      <n-tab-pane name="register" tab="注册">
        <n-flex vertical :size="12">
          <n-input v-model:value="registerForm.email" placeholder="请输入邮箱" />
          <n-input
            v-model:value="registerForm.password"
            type="password"
            show-password-on="click"
            placeholder="请输入密码"
          />
          <n-flex :wrap="false" :size="12">
            <n-input v-model:value="registerForm.code" placeholder="请输入邮箱验证码" />
            <n-button
              secondary
              :loading="actionLoading.sendCode"
              :disabled="countdown > 0"
              @click="handleSendCode"
            >
              {{ countdown > 0 ? `${countdown}s 后重试` : "发送验证码" }}
            </n-button>
          </n-flex>
          <n-button type="primary" :loading="actionLoading.register" @click="handleRegister">
            注册
          </n-button>
        </n-flex>
      </n-tab-pane>
      <n-tab-pane name="backup" tab="备份">
        <n-flex vertical :size="12">
          <n-alert v-if="!cloudSyncStore.isLoggedIn" type="warning" show-icon>
            请先登录云端账号后再备份“我的歌单”。
          </n-alert>
          <template v-else>
            <n-text depth="3">当前账号：{{ cloudSyncStore.user?.email || "云端账号" }}</n-text>
            <n-text depth="3">本地“我的歌单”数量：{{ myPlaylistStore.myPlaylists.length }}</n-text>
            <n-alert type="info" show-icon>
              备份会使用当前本地“我的歌单”覆盖云端已有备份。
            </n-alert>
            <n-button type="primary" :loading="actionLoading.backup" @click="handleBackup">
              备份到云端
            </n-button>
          </template>
        </n-flex>
      </n-tab-pane>
      <n-tab-pane name="restore" tab="恢复">
        <n-flex vertical :size="12">
          <n-alert v-if="!cloudSyncStore.isLoggedIn" type="warning" show-icon>
            请先登录云端账号后再恢复“我的歌单”。
          </n-alert>
          <template v-else>
            <n-text depth="3">当前账号：{{ cloudSyncStore.user?.email || "云端账号" }}</n-text>
            <n-alert type="warning" show-icon>
              恢复会使用云端歌单覆盖当前本地“我的歌单”，请谨慎操作。
            </n-alert>
            <n-button type="primary" :loading="actionLoading.restore" @click="confirmRestore">
              从云端恢复
            </n-button>
          </template>
        </n-flex>
      </n-tab-pane>
    </n-tabs>
    <n-button :focusable="false" class="close" strong secondary round @click="emit('close')">
      <template #icon>
        <SvgIcon name="WindowClose" />
      </template>
      关闭
    </n-button>
  </div>
</template>

<script setup lang="ts">
import {
  backupCloudPlaylists,
  getCloudAccount,
  getMembershipStatus,
  loginCloudAccount,
  redeemMembership,
  registerCloudAccount,
  sendRegisterCode,
  syncCloudPlaylists,
} from "@/api/cloudSync";
import { useCloudSyncStore, useMyPlaylistStore } from "@/stores";

type CloudTab = "account" | "login" | "register" | "backup" | "restore";

const emit = defineEmits<{
  close: [];
}>();

const cloudSyncStore = useCloudSyncStore();
const myPlaylistStore = useMyPlaylistStore();

const activeTab = ref<CloudTab>(cloudSyncStore.isLoggedIn ? "account" : "login");
const countdown = ref(0);
const countdownTimer = ref<number | null>(null);
const activationCode = ref("");
const showRedeemInput = ref(false);

const loginForm = reactive({
  email: cloudSyncStore.user?.email || "",
  password: "",
});

const registerForm = reactive({
  email: "",
  password: "",
  code: "",
});

const actionLoading = reactive({
  login: false,
  sendCode: false,
  register: false,
  backup: false,
  restore: false,
  account: false,
  redeem: false,
});

const membershipLabel = computed(() => {
  const membership = cloudSyncStore.membership;
  if (!membership?.vip_active) return "非 VIP";
  return membership.vip_level === 2 ? "永久 VIP" : "普通 VIP";
});

const membershipTagType = computed(() => {
  if (!cloudSyncStore.membership?.vip_active) return "default";
  return cloudSyncStore.membership.vip_level === 2 ? "success" : "warning";
});

const membershipExpiry = computed(() => {
  const membership = cloudSyncStore.membership;
  if (!membership) return "--";
  if (membership.vip_level === 2 && membership.vip_active) return "永久有效";
  if (!membership.vip_expires_at) return "--";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(membership.vip_expires_at));
});

const parseUsageText = computed(() => {
  const membership = cloudSyncStore.membership;
  if (!membership) return "--";
  return `剩余 ${membership.remaining_today} 次 / 共 ${membership.daily_limit} 次`;
});

const parseUsagePercentage = computed(() => {
  const membership = cloudSyncStore.membership;
  if (!membership?.daily_limit) return 0;
  return Math.min(100, Math.round((membership.used_today / membership.daily_limit) * 100));
});

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (value: string) =>
  String(value || "")
    .trim()
    .toLowerCase();

const validateEmail = (value: string): boolean => emailPattern.test(normalizeEmail(value));

const ensureLoginReady = (): boolean => {
  if (!validateEmail(loginForm.email)) {
    window.$message.warning("请输入正确的邮箱");
    return false;
  }
  if (!String(loginForm.password || "").trim()) {
    window.$message.warning("请输入密码");
    return false;
  }
  return true;
};

const ensureRegisterReady = (): boolean => {
  if (!validateEmail(registerForm.email)) {
    window.$message.warning("请输入正确的邮箱");
    return false;
  }
  if (String(registerForm.password || "").trim().length < 6) {
    window.$message.warning("密码至少需要 6 位");
    return false;
  }
  if (!String(registerForm.code || "").trim()) {
    window.$message.warning("请输入邮箱验证码");
    return false;
  }
  return true;
};

const handleCloudError = (error: unknown) => {
  const message = error instanceof Error ? error.message : "操作失败，请稍后重试";
  if (message.includes("登录状态已失效")) {
    cloudSyncStore.clearSession();
    activeTab.value = "login";
  }
  window.$message.error(message);
};

const refreshAccount = async () => {
  if (!cloudSyncStore.token) return;
  actionLoading.account = true;
  try {
    const [user, membership] = await Promise.all([
      getCloudAccount(cloudSyncStore.token),
      getMembershipStatus(cloudSyncStore.token),
    ]);
    cloudSyncStore.setUser(user);
    cloudSyncStore.setMembership(membership);
  } catch (error) {
    handleCloudError(error);
  } finally {
    actionLoading.account = false;
  }
};

const hashActivationCode = async (code: string): Promise<string> => {
  const normalized = code.trim().toUpperCase();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const handleRedeem = async () => {
  if (!cloudSyncStore.token || !activationCode.value.trim()) return;
  actionLoading.redeem = true;
  try {
    const codeHash = await hashActivationCode(activationCode.value);
    const result = await redeemMembership(cloudSyncStore.token, codeHash);
    cloudSyncStore.setMembership(result.membership);
    activationCode.value = "";
    showRedeemInput.value = false;
    window.$message.success("卡密兑换成功");
  } catch (error) {
    handleCloudError(error);
  } finally {
    actionLoading.redeem = false;
  }
};

const openPurchasePage = () => {
  window.open("https://key.likegamex.top/", "_blank");
};

const startCountdown = () => {
  countdown.value = 60;
  if (countdownTimer.value) window.clearInterval(countdownTimer.value);
  countdownTimer.value = window.setInterval(() => {
    if (countdown.value <= 1) {
      countdown.value = 0;
      if (countdownTimer.value) {
        window.clearInterval(countdownTimer.value);
        countdownTimer.value = null;
      }
      return;
    }
    countdown.value -= 1;
  }, 1000);
};

const handleLogin = async () => {
  if (!ensureLoginReady()) return;
  actionLoading.login = true;
  try {
    const result = await loginCloudAccount(normalizeEmail(loginForm.email), loginForm.password);
    cloudSyncStore.setSession(result.access_token, result.user || null);
    loginForm.password = "";
    activeTab.value = "account";
    await refreshAccount();
    window.$message.success("mobi 登录成功");
  } catch (error) {
    handleCloudError(error);
  } finally {
    actionLoading.login = false;
  }
};

const handleSendCode = async () => {
  if (!validateEmail(registerForm.email)) {
    window.$message.warning("请输入正确的邮箱");
    return;
  }
  actionLoading.sendCode = true;
  try {
    await sendRegisterCode(normalizeEmail(registerForm.email));
    startCountdown();
    window.$message.success("验证码已发送，请注意查收邮件");
  } catch (error) {
    handleCloudError(error);
  } finally {
    actionLoading.sendCode = false;
  }
};

const handleRegister = async () => {
  if (!ensureRegisterReady()) return;
  actionLoading.register = true;
  try {
    await registerCloudAccount(
      normalizeEmail(registerForm.email),
      registerForm.password,
      registerForm.code.trim(),
    );
    loginForm.email = normalizeEmail(registerForm.email);
    loginForm.password = registerForm.password;
    registerForm.code = "";
    activeTab.value = "login";
    window.$message.success("注册成功，请登录后使用");
  } catch (error) {
    handleCloudError(error);
  } finally {
    actionLoading.register = false;
  }
};

const handleBackup = async () => {
  if (!cloudSyncStore.token) {
    activeTab.value = "login";
    window.$message.warning("请先登录云端账号");
    return;
  }
  actionLoading.backup = true;
  try {
    await backupCloudPlaylists(cloudSyncStore.token, myPlaylistStore.myPlaylists);
    window.$message.success(`已备份 ${myPlaylistStore.myPlaylists.length} 个歌单到云端`);
  } catch (error) {
    handleCloudError(error);
  } finally {
    actionLoading.backup = false;
  }
};

const performRestore = async () => {
  if (!cloudSyncStore.token) {
    activeTab.value = "login";
    window.$message.warning("请先登录云端账号");
    return;
  }
  actionLoading.restore = true;
  try {
    const result = await syncCloudPlaylists(cloudSyncStore.token);
    await myPlaylistStore.replaceMyPlaylists(result.playlists);
    window.$message.success(`已从云端恢复 ${result.playlists.length} 个歌单`);
  } catch (error) {
    handleCloudError(error);
  } finally {
    actionLoading.restore = false;
  }
};

const confirmRestore = () => {
  window.$dialog.warning({
    title: "恢复我的歌单",
    content: "恢复会使用云端歌单覆盖当前本地“我的歌单”，是否继续？",
    positiveText: "确认恢复",
    negativeText: "取消",
    onPositiveClick: () => performRestore(),
  });
};

const logoutCloudAccount = () => {
  if (!cloudSyncStore.isLoggedIn) return;
  cloudSyncStore.clearSession();
  loginForm.password = "";
  activeTab.value = "login";
  window.$message.success("已退出 mobi 登录");
};

onMounted(() => {
  if (cloudSyncStore.isLoggedIn) void refreshAccount();
});

onBeforeUnmount(() => {
  if (countdownTimer.value) {
    window.clearInterval(countdownTimer.value);
    countdownTimer.value = null;
  }
});
</script>

<style lang="scss" scoped>
.cloud-sync {
  .logo {
    margin-bottom: 24px;
  }
  :deep(.n-tabs-nav) {
    margin-bottom: 18px;
  }
  :deep(.n-descriptions-table-content) {
    word-break: break-word;
  }
  .close {
    margin-top: 24px;
    margin-bottom: 8px;
  }
}
</style>
