<template>
  <div ref="hostRef" class="folia-root folia-lyrics" />
</template>

<script setup lang="ts">
import type { FoliaStage } from "@folia-stage";
import { findFoliaLineIndex, toFoliaLines, toFoliaTheme } from "@/core/folia/lyrics";
import { getFoliaStyleName } from "@/core/folia/catalog";
import { usePlayerController } from "@/core/player/PlayerController";
import { useAudioManager } from "@/core/player/AudioManager";
import { useMusicStore, useSettingStore, useStatusStore } from "@/stores";
import { FOLIA_OFF } from "@/core/folia/catalog";
import { aiPluginStatus, refreshAiPlugin } from "@/core/folia/aiPlugin";

const BIN_HZ = 48000 / 512;
const IDLE_BREATH_SPEED = 0.0024;
const IDLE_BREATH_FLOOR = 18;
const IDLE_BREATH_RANGE = 22;

const musicStore = useMusicStore();
const statusStore = useStatusStore();
const settingStore = useSettingStore();
const player = usePlayerController();
const audioManager = useAudioManager();

const hostRef = ref<HTMLElement | null>(null);
const lines = computed(() => toFoliaLines(musicStore.songLyric));
const artist = computed(() => {
  const artists = musicStore.playSong.artists;
  return Array.isArray(artists) ? artists.map((item) => item.name).join(" / ") : artists || "";
});
const album = computed(() => {
  const value = musicStore.playSong.album;
  return typeof value === "string" ? value : value?.name || "";
});

let stage: FoliaStage | null = null;
let frameId = 0;
let lineIndex = -1;
let disposed = false;
let lastAudioUrl = "";

// 没装插件时智能节拍保持关闭
const smartBeat = computed(() => ({
  mode: aiPluginStatus.value.installed ? settingStore.foliaSmartBeatMode : ("off" as const),
  effects: settingStore.foliaBeatEffects,
}));

// 本地路径用于读取已缓存和本地歌曲
const fileUrlToPath = (url: string) =>
  decodeURIComponent(url.replace(/^file:\/+/, /^file:\/+[A-Za-z]:/.test(url) ? "" : "/"));

const buildSong = () => {
  const audioUrl = player.currentAudioSource?.url || "";
  return {
    id: musicStore.playSong.id,
    name: musicStore.playSong.name,
    durationMs: musicStore.playSong.duration,
    audioUrl,
    localPath: audioUrl.startsWith("file:") ? fileUrlToPath(audioUrl) : musicStore.playSong.path,
  };
};

const buildState = () => ({
  mode: settingStore.foliaStyle,
  background: settingStore.foliaBackground,
  lines: lines.value,
  lineIndex,
  theme: toFoliaTheme(statusStore.songCoverTheme),
  title: musicStore.playSong.name,
  artist: artist.value,
  album: album.value,
  cover: musicStore.getSongCover("l"),
  seed: musicStore.playSong.id,
  paused: !statusStore.playStatus,
  tunings: settingStore.foliaTunings,
  backgroundOptions: settingStore.foliaBackgroundOptions,
  nomandEffect: settingStore.foliaNomandEffect,
  smartBeat: smartBeat.value,
  song: buildSong(),
});

// 计算频段能量
const bandEnergy = (data: Uint8Array, minHz: number, maxHz: number) => {
  const start = Math.floor(minHz / BIN_HZ);
  const end = Math.max(start + 1, Math.floor(maxHz / BIN_HZ));
  let sum = 0;
  for (let index = start; index < end && index < data.length; index += 1) sum += data[index];
  return sum / (end - start);
};

const shape = (value: number, boost: number) => Math.pow(value / 255, boost) * 255;

// 每帧同步时间与音频能量
const tick = (now: number) => {
  frameId = requestAnimationFrame(tick);
  if (!stage) return;
  const songId = musicStore.playSong.id;
  const seek = player.getSeek();
  const time = (seek + statusStore.getSongOffset(songId)) / 1000;
  const audioUrl = player.currentAudioSource?.url || "";
  if (audioUrl !== lastAudioUrl) {
    lastAudioUrl = audioUrl;
    stage.update({ song: buildSong() });
  }
  const playback = { audioTime: seek / 1000, playing: statusStore.playStatus };
  const index = findFoliaLineIndex(lines.value, time);
  if (index !== lineIndex) {
    lineIndex = index;
    stage.update({ lineIndex });
  }
  const data = audioManager.getFrequencyData();
  if (data.length > 0) {
    const bass = bandEnergy(data, 20, 150);
    const lowMid = bandEnergy(data, 150, 400);
    stage.frame({
      time,
      power: shape((bass + lowMid) / 2, 3),
      bass: shape(bass, 1.8),
      lowMid: shape(lowMid, 2),
      mid: shape(bandEnergy(data, 400, 1200), 2),
      vocal: shape(bandEnergy(data, 1000, 3500), 1.5),
      treble: shape(bandEnergy(data, 3500, 12000), 2),
      spectrum: data,
      ...playback,
    });
    return;
  }
  // 没有频谱时用缓慢呼吸代替
  const breath = IDLE_BREATH_FLOOR + (Math.sin(now * IDLE_BREATH_SPEED) + 1) * IDLE_BREATH_RANGE;
  stage.frame({
    time,
    power: breath,
    bass: breath,
    lowMid: breath,
    mid: breath,
    vocal: breath,
    treble: breath,
    ...playback,
  });
};

onMounted(async () => {
  void refreshAiPlugin();
  try {
    const { mountFoliaStage } = await import("@folia-stage");
    if (disposed || !hostRef.value) return;
    lineIndex = findFoliaLineIndex(lines.value, player.getSeek() / 1000);
    stage = mountFoliaStage(
      hostRef.value,
      buildState(),
      (error) => {
        console.error("歌词特效渲染失败:", error);
        window.$message.error(
          `「${getFoliaStyleName(settingStore.foliaStyle)}」无法运行，已关闭特效`,
        );
        settingStore.foliaStyle = FOLIA_OFF;
      },
      (seconds) => player.setSeek(seconds * 1000),
    );
    frameId = requestAnimationFrame(tick);
  } catch (error) {
    console.error("歌词特效加载失败:", error);
    window.$message.error("歌词特效加载失败，已关闭特效");
    settingStore.foliaStyle = FOLIA_OFF;
  }
});

watch(
  () => [
    settingStore.foliaStyle,
    settingStore.foliaBackground,
    lines.value,
    statusStore.songCoverTheme,
    statusStore.playStatus,
    musicStore.playSong.id,
    musicStore.playSong.cover,
    settingStore.foliaTunings,
    settingStore.foliaBackgroundOptions,
    settingStore.foliaNomandEffect,
    smartBeat.value,
  ],
  () => stage?.update(buildState()),
  { deep: false },
);

onBeforeUnmount(() => {
  disposed = true;
  cancelAnimationFrame(frameId);
  stage?.unmount();
  stage = null;
});
</script>

<style lang="scss" scoped>
.folia-lyrics {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
}
</style>
