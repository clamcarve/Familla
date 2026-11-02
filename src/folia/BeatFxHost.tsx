import { useEffect, useState } from "react";
import { useBeatFxTrack } from "./hooks/useBeatFxTrack";
import { refreshModelAvailability } from "./services/analysis/modelAvailability";
import { registerLocalTrackFileReader } from "./services/analysis/trackAudio";
import { usePlaybackStore, type HostSong } from "./stores/usePlaybackStore";

// 本地文件和缓存文件由主进程读取
registerLocalTrackFileReader(async (song) => {
  const path = (song as unknown as HostSong).localPath;
  if (!path) return null;
  const bytes: Uint8Array | null = await (window as any).electron?.ipcRenderer?.invoke("ai-plugin:read-audio", path);
  return bytes ? (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer) : null;
});

const BeatFxTrack = () => {
  usePlaybackStore((state) => state.song?.audioUrl);
  useBeatFxTrack();
  return null;
};

// 先确认插件已安装，否则第一首歌会被判定为无法分析
const BeatFxHost = () => {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    void refreshModelAvailability().finally(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);
  return ready ? <BeatFxTrack /> : null;
};

export default BeatFxHost;
