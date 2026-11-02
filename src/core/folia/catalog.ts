// 歌词特效目录

export type FoliaStyleLoad = "轻" | "中" | "重";

export type FoliaStyle = {
  id: string;
  name: string;
  desc: string;
  load: FoliaStyleLoad;
};

export const FOLIA_OFF = "off";

export const FOLIA_STYLES: FoliaStyle[] = [
  { id: "classic", name: "流光", desc: "单行居中，逐字点亮发光", load: "轻" },
  { id: "tilt", name: "倾诉", desc: "随机分行，大号斜体错落排版", load: "轻" },
  { id: "partita", name: "云阶", desc: "歌词分栏排布，如台阶展开", load: "轻" },
  { id: "claddagh", name: "回环", desc: "沿光环排布，轴线随音乐律动", load: "轻" },
  { id: "monet", name: "莫奈", desc: "海报布局，滚动歌词配音频条", load: "中" },
  { id: "fume", name: "浮名", desc: "印刷文章排版，镜头游走长文", load: "中" },
  { id: "cadenza", name: "心象", desc: "拆字布局的文字 PV", load: "中" },
  { id: "pendolo", name: "时计", desc: "钟表机芯，换句时齿轮跳动", load: "中" },
  { id: "cappella", name: "群唱", desc: "歌词化作聊天气泡", load: "中" },
  { id: "hanabi", name: "花火", desc: "夜空烟花中绽放的歌词 PV", load: "重" },
  { id: "lumiere", name: "绘光", desc: "舞台灯光与光轨 PV", load: "重" },
  { id: "sonnet", name: "商籁", desc: "镜头推近与后处理的文字 PV", load: "重" },
  { id: "tempera", name: "凝彩", desc: "色块与景深运镜 PV", load: "重" },
  { id: "nebbia", name: "雾笺", desc: "在起雾的车窗上手写歌词", load: "重" },
];

export const AI_PLUGIN_SIZE_TEXT = "约 133 MB";

export const FOLIA_BACKGROUNDS = [
  { id: "common", name: "通用", desc: "封面取色的流体与几何图形" },
  { id: "nomand", name: "漫游", desc: "封面生成的像素抖动着色器" },
];

export const getFoliaStyleName = (id: string): string =>
  FOLIA_STYLES.find((style) => style.id === id)?.name ?? "关闭";

export type AudioEffectControlText = { id: string; name: string; desc: string };

export const AUDIO_EFFECT_TEXT: Record<string, Omit<AudioEffectControlText, "id">> = {
  highpass: { name: "低频截止", desc: "切除低频，声音变薄" },
  lowpass: { name: "高频截止", desc: "切除高频，声音变闷" },
  drive: { name: "饱和失真", desc: "增加温暖的谐波" },
  crush: { name: "比特降质", desc: "复古数码颗粒，会引入噪声" },
  wow: { name: "抖晃", desc: "模拟磁带的音高摆动" },
  noise: { name: "黑胶噪声", desc: "叠加底噪和爆裂声" },
  width: { name: "立体声宽度", desc: "0 为单声道，1 为原始宽度" },
  space: { name: "空间混响", desc: "增加房间感" },
  punch: { name: "动态压缩", desc: "让声音更紧实有力" },
};
