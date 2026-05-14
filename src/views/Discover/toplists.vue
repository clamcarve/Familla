<template>
  <div class="discover-toplists">
    <n-divider> 官方榜 </n-divider>
    <Transition name="fade" mode="out-in">
      <div v-if="topListData.official?.length > 0" class="official-list">
        <n-grid cols="1 600:2 1000:3" x-gap="20" y-gap="20">
          <n-gi v-for="(item, index) in topListData.official" :key="index">
            <SongListCard
              :cover="item.coverSize?.m || item.cover"
              :title="item.name"
              :height="160"
              :description="item.updateTip"
              size="normal"
              :pure-cover="!!item.platform"
              :hiddenCover="settingStore.hiddenCovers.toplist"
              @click="
                router.push({
                  name: 'playlist',
                  query:
                    item.platform && item.platform !== 'netease'
                      ? { id: item.id, platform: item.platform, thirdParty: '1' }
                      : { id: item.id },
                })
              "
            >
              <template v-if="!item.platform || item.platform === 'netease'" #info>
                <div
                  v-for="(song, songIndex) in item.tracks"
                  :key="songIndex"
                  class="song-item text-hidden"
                >
                  <n-text class="name">{{ songIndex + 1 }}. {{ song.first }}</n-text>
                  <n-text class="desc" depth="3">{{ song.second }}</n-text>
                </div>
              </template>
            </SongListCard>
          </n-gi>
        </n-grid>
      </div>
      <div v-else class="official-list">
        <n-grid cols="1 600:2 1000:3" x-gap="20" y-gap="20">
          <n-gi v-for="item in 4" :key="item">
            <n-card class="loading" :class="{ 'no-cover': settingStore.hiddenCovers.toplist }">
              <n-skeleton v-if="!settingStore.hiddenCovers.toplist" class="cover" />
              <div class="desc">
                <n-skeleton text round :repeat="3" />
              </div>
            </n-card>
          </n-gi>
        </n-grid>
      </div>
    </Transition>
    <n-divider style="margin-bottom: 0"> 精选榜 </n-divider>
    <CoverList
      :data="topListData.selected"
      :loading="true"
      type="playlist"
      :hiddenCover="settingStore.hiddenCovers.toplist"
    />
  </div>
</template>

<script setup lang="ts">
import { getPlatformToplists } from "@/api/tunefree";
import { topPlaylist } from "@/api/playlist";
import type { CoverType } from "@/types/main";
import { usePlatformStore } from "@/stores";
import { formatCoverList } from "@/utils/format";
import { useSettingStore } from "@/stores";

const router = useRouter();
const settingStore = useSettingStore();
const platformStore = usePlatformStore();

// 排行榜数据
const topListData = ref<{
  official: CoverType[];
  selected: CoverType[];
}>({
  official: [],
  selected: [],
});

// 获取排行榜数据
const getTopPlaylistData = async () => {
  if (platformStore.currentPlatform === "netease") {
    const result = await topPlaylist();
    const official = formatCoverList(result.list?.filter((v: any) => v.ToplistType !== undefined));
    const selected = formatCoverList(result.list?.filter((v: any) => v.ToplistType === undefined));
    topListData.value = { official, selected };
    return;
  }
  const result = await getPlatformToplists(platformStore.currentPlatform);
  topListData.value = {
    official: result.list,
    selected: [],
  };
};

onMounted(getTopPlaylistData);

watch(
  () => platformStore.currentPlatform,
  () => {
    topListData.value = { official: [], selected: [] };
    getTopPlaylistData();
  },
);
</script>

<style lang="scss" scoped>
.discover-toplists {
  .song-item {
    .desc {
      &::before {
        content: "-";
        margin: 0 4px;
      }
    }
  }
  .loading {
    height: 160px;
    border-radius: 12px;
    cursor: pointer;
    :deep(.n-card__content) {
      display: flex;
      height: 100%;
      padding: 16px;
    }
    .cover {
      height: 100%;
      width: auto;
      border-radius: 8px;
      aspect-ratio: 1/1;
      margin-right: 20px;
    }
    .desc {
      display: flex;
      flex-direction: column;
      justify-content: space-evenly;
      width: 100%;
      :deep(.n-skeleton) {
        height: 20px;
      }
    }
    &.no-cover {
      :deep(.n-card__content) {
        padding: 12px;
      }
      .desc {
        justify-content: center;
        gap: 12px;
      }
    }
  }
}
</style>
