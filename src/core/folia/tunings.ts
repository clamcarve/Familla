// 各样式的调节项

export type TuningControl =
  | { key: string; label: string; type: "number"; min: number; max: number; step?: number }
  | { key: string; label: string; type: "switch" }
  | { key: string; label: string; type: "choice"; options: Record<string, string> };

const num = (
  key: string,
  label: string,
  min: number,
  max: number,
  step?: number,
): TuningControl => ({
  key,
  label,
  type: "number",
  min,
  max,
  step,
});
const sw = (key: string, label: string): TuningControl => ({ key, label, type: "switch" });
const pick = (key: string, label: string, options: Record<string, string>): TuningControl => ({
  key,
  label,
  type: "choice",
  options,
});

const POST_PROCESS = [
  sw("postProcessEnabled", "整体后处理滤镜"),
  num("postProcessGrain", "胶片颗粒", 0, 1),
  num("postProcessContrast", "对比度", 0, 1),
  num("postProcessRgbShift", "色散偏移", 0, 1),
  num("postProcessVignette", "暗角", 0, 2),
  num("postProcessLensDistortion", "镜头畸变", 0, 2),
];

export const FOLIA_TUNINGS: Record<string, TuningControl[]> = {
  classic: [
    sw("enableWordRotation", "逐字旋转"),
    sw("useLegacyLayout", "经典布局"),
    num("breathingFloatMultiplier", "呼吸浮动范围", 0, 2),
    num("wordSpacing", "字间距", 0, 2),
  ],
  tilt: [
    num("splitProbability", "分行概率", 0, 1),
    num("tiltStyleProbability", "斜体强调概率", 0, 1),
    pick("colorScheme", "配色方案", {
      default: "默认",
      swap: "主次互换",
      accentAll: "全部强调色",
      primaryAll: "全部主色",
    }),
  ],
  partita: [
    sw("showGuideLines", "引导线"),
    sw("useSemanticLayout", "语义排列"),
    num("staggerMin", "错位最小值", 0, 180, 1),
    num("staggerMax", "错位最大值", 0, 180, 1),
  ],
  claddagh: [
    num("focusScaleRatio", "主歌词放大倍率", 0, 1.5),
    num("radiusScale", "轨道半径", 0.5, 1.5),
    num("ellipseTiltDeg", "轨道倾斜度", 0, 60, 1),
    sw("showAxisLine", "中间轴线"),
    num("letterSpacingOffset", "字间距", -5, 20, 1),
  ],
  monet: [
    sw("keywordColoringEnabled", "关键字着色"),
    sw("showDescription", "显示歌曲描述"),
    sw("showAudioVisualization", "音频图案"),
    pick("audioStyle", "音频图案样式", { bar: "柱状", line: "线条" }),
    num("fontScale", "字体缩放", 0.7, 1.5),
    pick("portraitStyle", "封面形状", { square: "正方形", rectangular: "长方形" }),
  ],
  fume: [
    sw("hidePrintSymbols", "隐藏打印方块"),
    sw("disableGeometricBackground", "关闭通用几何图形"),
    num("backgroundObjectOpacity", "世界背景物体透明度", 0, 1),
    num("textHoldRatio", "文字停留比例", 0, 1),
    num("cameraSpeed", "摄影机移动速度", 0.55, 1.85),
    pick("cameraTrackingMode", "摄影机跟随", { stepped: "分步", smooth: "平滑" }),
    num("glowIntensity", "辉光强度", 0, 1.8),
    num("heroScale", "主句缩放", 0.82, 1.32),
  ],
  cadenza: [
    num("fontScale", "字体缩放", 0.7, 1.6),
    num("widthRatio", "排版宽度", 0.4, 1),
    num("motionAmount", "动效幅度", 0, 2),
    num("glowIntensity", "辉光强度", 0, 2),
    num("beamIntensity", "光束强度", 0, 2),
  ],
  pendolo: [
    num("wheelCenterX", "轮盘水平位置", -0.2, 0.4),
    num("arcRadius", "轮盘半径", 0.25, 0.8),
    num("arcAngleDeg", "弧度角度", 40, 160, 1),
    num("tickSnappiness", "擒纵咬合力度", 0.5, 2),
    num("activeScale", "聚焦句缩放", 1, 1.6),
    pick("showGearDecor", "齿轮装饰", { none: "隐藏", subtle: "淡化", full: "完整" }),
    sw("showCenterGradient", "齿轮中央深色渐变"),
    sw("showCoverOnWatchFace", "表盘显示专辑封面"),
    sw("enableLineGlow", "线条发光效果"),
  ],
  cappella: [
    sw("showEmoMessages", "显示表情包"),
    pick("avatarSource", "头像来源", { cover: "歌曲封面", builtin: "内置头像", color: "纯色" }),
  ],
  hanabi: [
    pick("colorMode", "配色", { theme: "跟随主题", vivid: "鲜艳", mixed: "混合" }),
    num("sparkAmount", "火花数量", 0, 2),
    num("ornamentAmount", "装饰数量", 0, 2),
    num("textMotion", "文字动效", 0, 2),
    num("blockOpacity", "色块不透明度", 0, 1),
    num("riseSpeed", "升空速度", 0, 2),
    num("spin", "旋转幅度", 0, 2),
    num("ambient", "环境光", 0, 2),
    num("glow", "辉光", 0, 2),
    num("bloom", "泛光", 0, 2),
    num("chorusBloom", "副歌泛光", 0, 2),
    sw("launches", "烟花升空"),
    sw("overlayFrame", "画框"),
    sw("textOnly", "只显示文字"),
    num("sky", "夜空亮度", 0, 1),
    num("collage", "PV 拼贴", 0, 2),
  ],
  lumiere: [
    num("lightIntensity", "灯光强度", 0.3, 2),
    num("audioResponse", "音频响应", 0, 2),
    num("fogDensity", "雾气浓度", 0, 2),
    num("darkField", "暗场", 0, 1),
    num("moteAmount", "尘埃数量", 0, 2),
    num("bloom", "泛光", 0, 2),
    num("textBloom", "文字泛光", 0, 2),
    num("unlitOpacity", "未点亮文字透明度", 0.05, 0.6),
    num("windowNeighbors", "邻行数量", 1, 2, 1),
    num("decay", "余辉衰减", 0, 2),
    num("echo", "残影", 0, 2),
    sw("lineArt", "线条图案"),
    sw("frontBokeh", "前景光斑"),
    sw("trails", "光轨"),
    sw("hideTrails", "隐藏轨迹线"),
    sw("seamlessTransitions", "无缝换句"),
    sw("overlayFrame", "画框"),
    sw("textOnly", "只显示文字"),
    sw("keywordColors", "关键词着色"),
    num("themeColorMix", "主题色混合", 0, 1),
  ],
  sonnet: [
    num("cameraIntensity", "镜头强度", 0, 2),
    num("typographyMotion", "文字动效", 0, 2),
    num("mgDensity", "动态图形密度", 0, 2),
    sw("showOnlyText", "只显示文字"),
    sw("showGuide", "辅助线"),
    sw("showBackgroundMg", "背景动态图形"),
    sw("showFixedGeo", "固定几何图形"),
    sw("showGiantDecorativeText", "巨型装饰文字"),
    sw("showBackgroundDecor", "背景装饰"),
    sw("enableTransitions", "转场动画"),
    pick("outerFrameMode", "外框", { none: "完全隐藏", frame: "仅外框", full: "完整" }),
    ...POST_PROCESS,
    num("postProcessHalftone", "半调网点", 0, 1),
    num("postProcessLensDispersion", "镜头色散", 0, 1),
  ],
  tempera: [
    num("cameraIntensity", "镜头强度", 0, 2),
    num("glyphMotion", "文字动效", 0, 2),
    sw("wholeLineLyrics", "整句显示歌词"),
    num("glyphSettleStretch", "逐字入场时序", 0, 1),
    num("depthOfField", "景深", 0, 2),
    num("depthPan", "景深运镜", 0, 2),
    num("glyphDepth", "文字纵深", 0, 2),
    pick("colorMode", "色彩模式", { duo: "双色", mono: "单色", gradient: "渐变" }),
    sw("showBlocks", "色块"),
    sw("showDecor", "装饰"),
    sw("showCornerMarks", "边角线框"),
    sw("textInversion", "文字反色"),
    sw("enableTransitions", "转场动画"),
    ...POST_PROCESS,
  ],
  nebbia: [
    pick("behind", "窗外", { night: "雨夜街景", aquarium: "水族箱", backdrop: "共用背景" }),
    pick("glass", "玻璃上的水", { rain: "雨窗", dew: "凝露" }),
    pick("rain", "雨", { slant: "斜雨", straight: "直雨", off: "无雨" }),
    sw("credits", "片尾写曲名和歌手"),
    num("jellies", "水母数量", 0, 24, 1),
    num("jitter", "手写歪斜", 0, 1.5),
    num("warp", "手写变形", 0, 1.5),
    num("mist", "雾气浓度", 0.2, 1),
    num("hold", "下一句开始后保持", 0, 6),
    num("refog", "重新起雾用时", 0.5, 12),
  ],
};

export const NOMAND_EFFECTS: Record<string, string> = {
  dithering: "像素抖动",
  "fluted-glass": "棱纹玻璃",
  "halftone-dots": "半调网点",
  "lens-distortion": "镜头畸变",
  "paper-texture": "纸张纹理",
};

export type BeatEffectInfo = {
  id: string;
  style: string;
  name: string;
  desc: string;
  model: "节拍" | "鼓声与人声分离";
};

export const FOLIA_BEAT_EFFECTS: BeatEffectInfo[] = [
  {
    id: "sonnet.lensTear",
    style: "商籁",
    name: "推镜裂光",
    desc: "每拍镜头推近，小节第一拍撕裂并泛起辉光",
    model: "节拍",
  },
  {
    id: "hanabi.beatBursts",
    style: "花火",
    name: "随拍开花",
    desc: "每拍在夜空开一朵小烟花",
    model: "节拍",
  },
  {
    id: "hanabi.beatPulse",
    style: "花火",
    name: "随拍推镜",
    desc: "画面每拍推近一下、轻轻一摆",
    model: "节拍",
  },
  {
    id: "nebbia.aquaBeat",
    style: "雾笺",
    name: "舞潮踏拍",
    desc: "窗外是水族箱时，水母和水草跟随节拍",
    model: "节拍",
  },
  {
    id: "pendolo.drumhead",
    style: "时计",
    name: "仿真鼓面",
    desc: "底鼓让表盘鼓起，军鼓和镲片各有反应",
    model: "鼓声与人声分离",
  },
  {
    id: "tempera.inkFlash",
    style: "凝彩",
    name: "墨染奥行",
    desc: "跟随鼓声的景深和运镜",
    model: "鼓声与人声分离",
  },
  {
    id: "nebbia.drizzleRide",
    style: "雾笺",
    name: "疏雨轻车",
    desc: "雨跟人声，车子跟着底鼓颠簸",
    model: "鼓声与人声分离",
  },
];
