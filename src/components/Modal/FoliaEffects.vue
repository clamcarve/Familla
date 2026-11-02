<template>
  <n-tabs v-model:value="tab" type="segment" animated class="folia-effects">
    <n-tab-pane name="lyrics" tab="歌词特效">
      <n-flex vertical :size="16">
        <n-flex align="center" justify="space-between">
          <n-flex vertical :size="2">
            <n-text strong>全屏歌词特效</n-text>
            <n-text depth="3" class="tip">开启后在全屏播放页显示，点选下方样式立即生效</n-text>
          </n-flex>
          <n-switch :value="isOn" size="large" :round="false" @update:value="toggle" />
        </n-flex>
        <div class="style-grid">
          <n-card
            v-for="style in FOLIA_STYLES"
            :key="style.id"
            :class="['style-card', { active: settingStore.foliaStyle === style.id }]"
            size="small"
            hoverable
            @click="selectStyle(style.id)"
          >
            <n-flex align="center" justify="space-between" :wrap="false">
              <n-text strong>{{ style.name }}</n-text>
              <n-tag size="small" :bordered="false" :type="loadType[style.load]">
                {{ style.load }}
              </n-tag>
            </n-flex>
            <n-text depth="3" class="tip">{{ style.desc }}</n-text>
          </n-card>
        </div>
        <n-card v-if="tuningControls.length" size="small" class="tuning">
          <n-flex align="center" justify="space-between">
            <n-text strong>调节「{{ getFoliaStyleName(tuningStyle) }}」</n-text>
            <n-button size="tiny" secondary @click="resetTuning">恢复默认</n-button>
          </n-flex>
          <div class="tuning-grid">
            <div v-for="control in tuningControls" :key="control.key" class="tuning-item">
              <n-flex align="center" justify="space-between" :wrap="false">
                <n-text>{{ control.label }}</n-text>
                <n-switch
                  v-if="control.type === 'switch'"
                  :value="Boolean(tuningValue(control.key))"
                  size="small"
                  @update:value="setTuning(control.key, $event)"
                />
                <n-text v-else-if="control.type === 'number'" depth="3" class="tip">
                  {{ formatNumber(tuningValue(control.key)) }}
                </n-text>
              </n-flex>
              <n-slider
                v-if="control.type === 'number'"
                :value="Number(tuningValue(control.key) ?? control.min)"
                :min="control.min"
                :max="control.max"
                :step="control.step ?? (control.max - control.min) / 100"
                :tooltip="false"
                @update:value="setTuning(control.key, $event)"
              />
              <n-select
                v-else-if="control.type === 'choice'"
                :value="String(tuningValue(control.key) ?? '')"
                size="small"
                :options="choiceOptions(control.options)"
                @update:value="setTuning(control.key, $event)"
              />
            </div>
          </div>
        </n-card>
        <n-text depth="3" class="tip">
          标“重”的样式需要较好的显卡。效果移植自 Folia（AGPL-3.0）。
        </n-text>
      </n-flex>
    </n-tab-pane>
    <n-tab-pane name="background" tab="背景">
      <n-flex vertical :size="12">
        <n-text depth="3" class="tip"
          >背景只在歌词特效开启时使用，部分样式会绘制自己的画面。</n-text
        >
        <div class="style-grid">
          <n-card
            v-for="background in FOLIA_BACKGROUNDS"
            :key="background.id"
            :class="['style-card', { active: settingStore.foliaBackground === background.id }]"
            size="small"
            hoverable
            @click="settingStore.foliaBackground = background.id"
          >
            <n-text strong>{{ background.name }}</n-text>
            <br />
            <n-text depth="3" class="tip">{{ background.desc }}</n-text>
          </n-card>
        </div>
        <n-card v-if="settingStore.foliaBackground === 'common'" size="small">
          <div class="tuning-grid">
            <n-flex justify="space-between" :wrap="false">
              <n-text>封面流体取色</n-text>
              <n-switch
                :value="settingStore.foliaBackgroundOptions.useCoverColorBg"
                size="small"
                @update:value="setBackground('useCoverColorBg', $event)"
              />
            </n-flex>
            <n-flex justify="space-between" :wrap="false">
              <n-text>显示几何图形</n-text>
              <n-switch
                :value="!settingStore.foliaBackgroundOptions.disableGeometricBackground"
                size="small"
                @update:value="setBackground('disableGeometricBackground', !$event)"
              />
            </n-flex>
            <n-flex justify="space-between" :wrap="false">
              <n-text>暗角</n-text>
              <n-switch
                :value="!settingStore.foliaBackgroundOptions.disableVignette"
                size="small"
                @update:value="setBackground('disableVignette', !$event)"
              />
            </n-flex>
            <div>
              <n-text>主题色遮罩</n-text>
              <n-slider
                :value="settingStore.foliaBackgroundOptions.opacity"
                :min="0"
                :max="1"
                :step="0.01"
                :tooltip="false"
                @update:value="setBackground('opacity', $event)"
              />
            </div>
          </div>
        </n-card>
        <n-card v-else size="small">
          <n-flex align="center" justify="space-between" :wrap="false">
            <n-text>漫游效果</n-text>
            <n-select
              v-model:value="settingStore.foliaNomandEffect"
              size="small"
              class="effect-select"
              :options="choiceOptions(NOMAND_EFFECTS)"
            />
          </n-flex>
        </n-card>
      </n-flex>
    </n-tab-pane>
    <n-tab-pane name="audio" tab="音效">
      <n-flex vertical :size="12">
        <n-alert v-if="!supportsEffects" type="warning" :show-icon="false">
          当前播放引擎不支持音效，请在播放设置中切换到 Web Audio 或 FFmpeg。
        </n-alert>
        <n-flex align="center" justify="space-between">
          <n-flex vertical :size="2">
            <n-text strong>音效</n-text>
            <n-text depth="3" class="tip">调节后立即生效，关闭时完全不影响原声</n-text>
          </n-flex>
          <n-flex align="center">
            <n-button size="small" secondary :disabled="!supportsEffects" @click="resetEffects">
              重置
            </n-button>
            <n-switch
              v-model:value="settingStore.audioEffectsEnabled"
              size="large"
              :round="false"
              :disabled="!supportsEffects"
            />
          </n-flex>
        </n-flex>
        <div class="effect-grid">
          <div v-for="control in AUDIO_EFFECT_CONTROLS" :key="control.id" class="effect">
            <n-flex justify="space-between" :wrap="false">
              <n-text>{{ AUDIO_EFFECT_TEXT[control.id].name }}</n-text>
              <n-text depth="3" class="tip">{{ formatValue(control) }}</n-text>
            </n-flex>
            <n-slider
              :value="toSlider(control)"
              :min="0"
              :max="SLIDER_STEPS"
              :step="1"
              :disabled="!settingStore.audioEffectsEnabled || !supportsEffects"
              :tooltip="false"
              @update:value="fromSlider(control, $event)"
            />
            <n-text depth="3" class="tip">{{ AUDIO_EFFECT_TEXT[control.id].desc }}</n-text>
          </div>
        </div>
      </n-flex>
    </n-tab-pane>
    <n-tab-pane name="beat" tab="智能节拍">
      <n-flex vertical :size="14">
        <n-text depth="3" class="tip">
          用本地 AI
          模型识别歌曲的节拍、鼓声和人声，让部分样式跟着音乐动起来。分析在本机显卡上完成，歌曲不会上传。
        </n-text>
        <n-alert v-if="!hasWebGpu" type="warning" :show-icon="false">
          当前环境不支持 WebGPU，智能节拍无法运行。
        </n-alert>
        <template v-if="!aiPluginStatus.installed">
          <n-card size="small">
            <n-flex vertical :size="10">
              <n-text strong>需要先安装 AI 节拍插件（{{ AI_PLUGIN_SIZE_TEXT }}）</n-text>
              <n-text depth="3" class="tip">
                模型体积较大，所以没有放进安装包。可以直接下载，也可以先用浏览器下载后再导入。
              </n-text>
              <n-progress
                v-if="aiPluginProgress"
                type="line"
                :percentage="downloadPercent"
                :show-indicator="aiPluginProgress.total > 0"
              />
              <n-flex>
                <n-button v-if="!aiPluginProgress" type="primary" @click="downloadAiPlugin">
                  从 GitHub 下载安装
                </n-button>
                <n-button v-else secondary @click="cancelAiPluginDownload">取消下载</n-button>
                <n-button secondary :disabled="!!aiPluginProgress" @click="importAiPlugin">
                  导入插件文件
                </n-button>
                <n-button secondary @click="copyUrl">复制下载地址</n-button>
              </n-flex>
            </n-flex>
          </n-card>
        </template>
        <template v-else>
          <n-flex align="center" justify="space-between">
            <n-text strong>智能节拍</n-text>
            <n-radio-group v-model:value="settingStore.foliaSmartBeatMode" size="small">
              <n-radio-button value="off">关闭</n-radio-button>
              <n-radio-button value="cached">只用已分析的</n-radio-button>
              <n-radio-button value="on">开启</n-radio-button>
            </n-radio-group>
          </n-flex>
          <n-text depth="3" class="tip">
            “开启”会在播放时分析新歌，每首只分析一次，分析时占用显卡；“只用已分析的”不做新分析。
          </n-text>
          <div class="beat-list">
            <n-card v-for="effect in FOLIA_BEAT_EFFECTS" :key="effect.id" size="small">
              <n-flex align="center" justify="space-between" :wrap="false">
                <n-flex vertical :size="2">
                  <n-text strong>{{ effect.style }} · {{ effect.name }}</n-text>
                  <n-text depth="3" class="tip">{{ effect.desc }}（{{ effect.model }}）</n-text>
                </n-flex>
                <n-switch
                  :value="beatEffect(effect.id).on"
                  size="small"
                  @update:value="setBeatEffect(effect.id, { on: $event })"
                />
              </n-flex>
              <n-slider
                :value="beatEffect(effect.id).strength"
                :min="0"
                :max="2"
                :step="0.05"
                :tooltip="false"
                :disabled="!beatEffect(effect.id).on"
                @update:value="setBeatEffect(effect.id, { strength: $event })"
              />
            </n-card>
          </div>
          <n-flex justify="end">
            <n-button size="small" secondary type="error" @click="confirmRemove">
              卸载插件
            </n-button>
          </n-flex>
        </template>
      </n-flex>
    </n-tab-pane>
  </n-tabs>
</template>

<script setup lang="ts">
import {
  AI_PLUGIN_SIZE_TEXT,
  AUDIO_EFFECT_TEXT,
  FOLIA_BACKGROUNDS,
  FOLIA_OFF,
  FOLIA_STYLES,
  getFoliaStyleName,
  type FoliaStyleLoad,
} from "@/core/folia/catalog";
import { FOLIA_BEAT_EFFECTS, FOLIA_TUNINGS, NOMAND_EFFECTS } from "@/core/folia/tunings";
import {
  aiPluginProgress,
  aiPluginStatus,
  cancelAiPluginDownload,
  downloadAiPlugin,
  importAiPlugin,
  refreshAiPlugin,
  removeAiPlugin,
} from "@/core/folia/aiPlugin";
import {
  AUDIO_EFFECT_CONTROLS,
  DEFAULT_AUDIO_EFFECT_SETTINGS,
  type AudioEffectControl,
} from "@/core/audio-player/effects/audioEffects";
import { useAudioManager } from "@/core/player/AudioManager";
import { useSettingStore, useStatusStore } from "@/stores";

const SLIDER_STEPS = 100;

const settingStore = useSettingStore();
const statusStore = useStatusStore();
const audioManager = useAudioManager();
const tab = ref("lyrics");
const supportsEffects = audioManager.capabilities.supportsEqualizer;
const hasWebGpu = "gpu" in navigator;
const tuningDefaults = shallowRef<Record<string, Record<string, unknown>>>({});

const isOn = computed(() => settingStore.foliaStyle !== FOLIA_OFF);

// 关闭特效时仍可调节上次的样式
const tuningStyle = computed(() =>
  isOn.value ? settingStore.foliaStyle : settingStore.foliaLastStyle,
);
const tuningControls = computed(() => FOLIA_TUNINGS[tuningStyle.value] ?? []);

const loadType: Record<FoliaStyleLoad, "success" | "warning" | "error"> = {
  轻: "success",
  中: "warning",
  重: "error",
};

const downloadPercent = computed(() => {
  const progress = aiPluginProgress.value;
  if (!progress?.total) return 0;
  return Math.round((progress.received / progress.total) * 100);
});

const toggle = (value: boolean) => {
  settingStore.foliaStyle = value ? settingStore.foliaLastStyle || "classic" : FOLIA_OFF;
};

const selectStyle = (id: string) => {
  settingStore.foliaStyle = id;
  settingStore.foliaLastStyle = id;
  window.$message.success(
    statusStore.showFullPlayer
      ? `已切换到「${getFoliaStyleName(id)}」`
      : `已选择「${getFoliaStyleName(id)}」，打开全屏播放页即可查看`,
  );
};

const tuningValue = (key: string) =>
  settingStore.foliaTunings[tuningStyle.value]?.[key] ??
  tuningDefaults.value[tuningStyle.value]?.[key];

const setTuning = (key: string, value: unknown) => {
  const style = tuningStyle.value;
  settingStore.foliaTunings = {
    ...settingStore.foliaTunings,
    [style]: { ...settingStore.foliaTunings[style], [key]: value },
  };
};

const resetTuning = () => {
  const next = { ...settingStore.foliaTunings };
  delete next[tuningStyle.value];
  settingStore.foliaTunings = next;
};

const formatNumber = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.round(number * 100) / 100) : "";
};

const choiceOptions = (options: Record<string, string>) =>
  Object.entries(options).map(([value, label]) => ({ value, label }));

const setBackground = (key: string, value: unknown) => {
  settingStore.foliaBackgroundOptions = { ...settingStore.foliaBackgroundOptions, [key]: value };
};

// 对数参数按比例映射到滑块
const toSlider = (control: AudioEffectControl) => {
  const value = settingStore.audioEffects[control.id] ?? control.neutral;
  const ratio =
    control.scale === "log"
      ? Math.log(value / control.min) / Math.log(control.max / control.min)
      : (value - control.min) / (control.max - control.min);
  return Math.round(ratio * SLIDER_STEPS);
};

const fromSlider = (control: AudioEffectControl, slider: number) => {
  const ratio = slider / SLIDER_STEPS;
  const value =
    control.scale === "log"
      ? control.min * Math.pow(control.max / control.min, ratio)
      : control.min + (control.max - control.min) * ratio;
  settingStore.audioEffects = { ...settingStore.audioEffects, [control.id]: value };
};

const formatValue = (control: AudioEffectControl) => {
  const value = settingStore.audioEffects[control.id] ?? control.neutral;
  return control.unit === "hz" ? `${Math.round(value)} Hz` : value.toFixed(2);
};

const resetEffects = () => {
  settingStore.audioEffects = { ...DEFAULT_AUDIO_EFFECT_SETTINGS };
};

const beatEffect = (id: string) => settingStore.foliaBeatEffects[id] ?? { on: true, strength: 1 };

const setBeatEffect = (id: string, patch: Partial<{ on: boolean; strength: number }>) => {
  settingStore.foliaBeatEffects = {
    ...settingStore.foliaBeatEffects,
    [id]: { ...beatEffect(id), ...patch },
  };
};

const copyUrl = async () => {
  await navigator.clipboard.writeText(aiPluginStatus.value.url);
  window.$message.success("下载地址已复制");
};

const confirmRemove = () => {
  window.$dialog.warning({
    title: "卸载 AI 节拍插件",
    content: "将删除已下载的模型，已分析的歌曲结果会保留。之后可以重新安装。",
    positiveText: "卸载",
    negativeText: "取消",
    onPositiveClick: async () => {
      settingStore.foliaSmartBeatMode = "off";
      await removeAiPlugin();
    },
  });
};

// 调节时立即生效
watch(
  () => [settingStore.audioEffects, settingStore.audioEffectsEnabled],
  () => audioManager.setAudioEffects(settingStore.audioEffects, settingStore.audioEffectsEnabled),
);

onMounted(async () => {
  void refreshAiPlugin();
  const { FOLIA_TUNING_DEFAULTS } = await import("@folia-tuning");
  tuningDefaults.value = FOLIA_TUNING_DEFAULTS;
});
</script>

<style lang="scss" scoped>
.folia-effects {
  .tip {
    font-size: 12px;
  }
  .style-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 10px;
  }
  .style-card {
    cursor: pointer;
    &.active {
      border-color: var(--primary-hex);
      box-shadow: 0 0 0 1px var(--primary-hex);
    }
  }
  .effect-grid,
  .tuning-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 14px 20px;
  }
  .tuning-grid {
    margin-top: 12px;
  }
  .effect-select {
    width: 180px;
  }
  .beat-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 10px;
  }
}
</style>
