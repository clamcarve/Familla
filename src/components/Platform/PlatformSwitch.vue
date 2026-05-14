<template>
  <n-popselect
    :options="platformValueOptions"
    :value="platformStore.currentPlatform"
    trigger="click"
    @update:value="handlePlatformChange"
  >
    <n-button
      :focusable="false"
      tertiary
      round
      :class="['platform-switch', `platform-switch-${variant}`]"
    >
      <span class="platform-label">当前平台</span>
      <span class="platform-name">{{ platformStore.currentPlatformName }}</span>
    </n-button>
  </n-popselect>
</template>

<script setup lang="ts">
import { platformValueOptions, usePlatformStore } from "@/stores";
import type { MusicPlatformType } from "@/types/main";

withDefaults(
  defineProps<{
    variant?: "nav" | "home";
  }>(),
  {
    variant: "nav",
  },
);

const router = useRouter();
const route = useRoute();
const platformStore = usePlatformStore();

const handlePlatformChange = (platform: MusicPlatformType) => {
  if (platformStore.currentPlatform === platform) return;
  platformStore.setPlatform(platform);
  if (String(route.name || "").startsWith("search")) {
    router.replace({
      name: "search-songs",
      query: {
        ...route.query,
        platform,
      },
    });
    return;
  }
  if (route.name === "discover-toplists") {
    router.replace({
      name: "discover-toplists",
      query: {
        ...route.query,
        platform,
      },
    });
  }
};
</script>

<style lang="scss" scoped>
.platform-switch {
  width: auto;
  min-width: 150px;
  gap: 8px;
  -webkit-app-region: no-drag;
  :deep(.n-button__content) {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .platform-label {
    font-size: 12px;
    color: var(--n-text-color-3);
  }
  .platform-name {
    font-size: 14px;
    font-weight: 700;
  }
}

.platform-switch-nav {
  height: 42px;
  padding: 0 16px;
  border: 1px solid color-mix(in srgb, var(--n-border-color) 75%, transparent);
  background: color-mix(in srgb, var(--n-card-color) 88%, transparent);
  backdrop-filter: blur(16px);
}

.platform-switch-home {
  min-width: 180px;
  height: 46px;
  padding: 0 20px;
  border: 1px solid color-mix(in srgb, var(--n-border-color) 80%, transparent);
  background: color-mix(in srgb, var(--n-card-color) 94%, transparent);
  box-shadow: 0 12px 30px rgb(0 0 0 / 8%);
  .platform-label {
    font-size: 13px;
  }
  .platform-name {
    font-size: 15px;
  }
}
</style>
