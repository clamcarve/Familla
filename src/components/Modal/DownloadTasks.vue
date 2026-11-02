<template>
  <div class="download-tasks">
    <n-scrollbar v-if="tasks.length" class="task-list">
      <n-flex vertical :size="16">
        <n-flex v-for="item in tasks" :key="item.song.id" vertical :size="8" class="task-item">
          <n-flex justify="space-between" :wrap="false">
            <n-text ellipsis class="song-name">{{ item.song.name }}</n-text>
            <n-text :type="item.status === 'failed' ? 'error' : undefined" depth="3">
              {{ getStatusText(item.status, item.progress) }}
            </n-text>
          </n-flex>
          <n-progress
            type="line"
            :percentage="item.status === 'downloading' ? item.progress : 0"
            :status="item.status === 'failed' ? 'error' : undefined"
            :show-indicator="false"
          />
        </n-flex>
      </n-flex>
    </n-scrollbar>
    <n-empty v-else description="暂无下载任务" />
  </div>
</template>

<script setup lang="ts">
import { useDataStore } from "@/stores";

const dataStore = useDataStore();
const tasks = computed(() => dataStore.downloadingSongs);

const getStatusText = (status: "downloading" | "waiting" | "failed", progress: number) => {
  if (status === "downloading") return `${progress}%`;
  if (status === "waiting") return "等待下载";
  return "下载失败";
};
</script>

<style scoped lang="scss">
.download-tasks {
  min-height: 160px;

  .task-list {
    max-height: 480px;
  }

  .task-item {
    padding: 12px;
    border-radius: 10px;
    background-color: var(--surface-container-hex);
  }

  .song-name {
    min-width: 0;
    max-width: 75%;
  }
}
</style>
