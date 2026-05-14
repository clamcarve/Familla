<template>
  <div class="search-type">
    <Transition name="fade" mode="out-in">
      <SongList
        v-if="searchCount > 0"
        :data="searchResultData"
        :loading="loading"
        doubleClickAction="add"
        loadMore
        disabledSort
        @reachBottom="reachBottom"
      />
      <n-empty
        v-else
        :description="`很抱歉，未能找到与 ${keyword} 相关的任何歌曲`"
        style="margin-top: 60px"
        size="large"
      >
        <template #icon>
          <SvgIcon name="SearchOff" />
        </template>
      </n-empty>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import type { SongType } from "@/types/main";
import { getPlatformCover, searchPlatformSongs } from "@/api/tunefree";
import { searchResult } from "@/api/search";
import { usePlatformStore } from "@/stores";
import { formatSongsList } from "@/utils/format";

const props = defineProps<{
  keyword: string;
}>();

// 搜索数据
const platformStore = usePlatformStore();
const hasMore = ref<boolean>(true);
const loading = ref<boolean>(true);
const searchOffset = ref<number>(0);
const searchCount = ref<number>(1);
const searchResultData = ref<SongType[]>([]);

const fillKuwoSongCovers = async (songs: SongType[]) => {
  if (platformStore.currentPlatform !== "kuwo" || songs.length === 0) return songs;
  const tasks = songs.map(async (song) => {
    if (song.cover && !song.cover.includes("/images/song.jpg?asset")) {
      return song;
    }
    try {
      const cover = await getPlatformCover("kuwo", song);
      if (!cover) return song;
      return {
        ...song,
        cover,
        coverSize: {
          s: cover,
          m: cover,
          l: cover,
          xl: cover,
        },
      } as SongType;
    } catch {
      return song;
    }
  });
  return Promise.all(tasks);
};

// 获取搜索结果
const getSearchResult = async () => {
  // 获取数据
  loading.value = true;
  if (platformStore.currentPlatform === "netease") {
    const result = await searchResult(props.keyword, 50, searchOffset.value, 1);
    hasMore.value = result.result?.hasMore || result.result?.songCount > searchOffset.value + 50;
    searchCount.value = result.result?.songCount;
    const songData = formatSongsList(result.result.songs);
    searchResultData.value = searchResultData.value?.concat(songData);
  } else {
    const page = Math.floor(searchOffset.value / 50) + 1;
    const result = await searchPlatformSongs(
      platformStore.currentPlatform,
      props.keyword,
      page,
      50,
    );
    hasMore.value = searchOffset.value + result.list.length < (result.total || 0);
    searchCount.value = result.total || result.list.length;
    const normalizedList = await fillKuwoSongCovers(result.list);
    searchResultData.value = searchResultData.value.concat(normalizedList);
  }
  loading.value = false;
};

// 列表触底
const reachBottom = () => {
  if (hasMore.value) {
    console.log("加载");
    searchOffset.value += 50;
    getSearchResult();
  } else {
    loading.value = false;
  }
};

onMounted(() => {
  getSearchResult();
});

watch(
  () => [props.keyword, platformStore.currentPlatform],
  () => {
    hasMore.value = true;
    loading.value = true;
    searchOffset.value = 0;
    searchCount.value = 1;
    searchResultData.value = [];
    getSearchResult();
  },
);
</script>
