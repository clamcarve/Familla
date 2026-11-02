# Folia 渲染层

本目录的歌词动画、背景和文字排版代码来自 Folia（https://github.com/chthollyphile/folia-major），
提交 f03e8ec，版权归 chthollyphile 及其贡献者所有，以 AGPL-3.0 授权。

与原项目的差异：

- `mount.tsx`、`shims/`、`components/visualizer/registry.tsx`、`components/visualizer/backgrounds/registry.tsx`
  以及 `services/`、`stores/`、`mods/`、`i18n/` 下被替换的模块由本项目编写
- 去掉模组、第三方音乐服务、AI 主题、设置面板
- AI 节拍分析的代码保留在应用内，模型权重放在可选插件包中，不随安装包分发
- 雾笺笔顺数据 `public/nebbia-strokes.json` 来自 AnimCJK，以 Arphic Public License 授权，见 `public/licenses/nebbia-strokes/`
- 内置素材的授权见各样式目录中的 LICENSE 文件
