<template>
  <n-flex class="kugou-login" align="center" vertical :size="16">
    <n-qr-code v-if="qrContent" :value="qrContent" :size="180" :padding="8" />
    <n-skeleton v-else :width="196" :height="196" />
    <n-text>{{ statusText }}</n-text>
    <n-text depth="3" class="tip">使用酷狗概念版 App 扫码，登录后每天自动领取畅听 VIP</n-text>
    <n-flex>
      <n-button strong secondary @click="emit('close')">取消</n-button>
      <n-button v-if="canRefresh" type="primary" @click="createQrCode">刷新二维码</n-button>
    </n-flex>
  </n-flex>
</template>

<script setup lang="ts">
import { checkKugouQrLogin, createKugouQrLogin } from "@/api/kugou";
import { useKugouStore } from "@/stores";

const STATUS_EXPIRED = 0;
const STATUS_SCANNED = 2;
const STATUS_AUTHORIZED = 4;
const POLL_INTERVAL = 2000;

const emit = defineEmits<{ close: [] }>();

const kugouStore = useKugouStore();
const qrKey = ref("");
const qrContent = ref("");
const statusText = ref("正在生成二维码");
const canRefresh = ref(false);
let checking = false;

const { pause, resume } = useIntervalFn(() => void checkLogin(), POLL_INTERVAL, {
  immediate: false,
});

// 生成二维码并开始轮询
const createQrCode = async () => {
  pause();
  canRefresh.value = false;
  qrContent.value = "";
  statusText.value = "正在生成二维码";
  try {
    const result = await createKugouQrLogin();
    if (!result?.key) throw new Error("酷狗接口未返回二维码");
    qrKey.value = result.key;
    qrContent.value = result.content;
    statusText.value = "等待扫码";
    resume();
  } catch (error) {
    console.error("酷狗二维码获取失败:", error);
    statusText.value = "二维码获取失败";
    canRefresh.value = true;
  }
};

// 查询扫码状态
const checkLogin = async () => {
  if (checking || !qrKey.value) return;
  checking = true;
  try {
    const result = await checkKugouQrLogin(qrKey.value);
    if (!result) return;
    if (result.status === STATUS_AUTHORIZED && result.cookie) {
      pause();
      kugouStore.setCredential(result.cookie, result.nickname);
      window.$message.success("酷狗登录成功");
      void kugouStore.checkIn();
      emit("close");
    } else if (result.status === STATUS_SCANNED) {
      statusText.value = "已扫码，请在 App 内确认";
    } else if (result.status === STATUS_EXPIRED) {
      pause();
      statusText.value = "二维码已过期";
      canRefresh.value = true;
    }
  } catch (error) {
    console.warn("酷狗扫码状态获取失败:", error);
  } finally {
    checking = false;
  }
};

onMounted(createQrCode);
</script>

<style lang="scss" scoped>
.kugou-login {
  padding: 8px 0;
  .tip {
    font-size: 12px;
    text-align: center;
  }
}
</style>
