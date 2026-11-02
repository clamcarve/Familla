const MIN_CACHEABLE_AUDIO_BYTES = 16 * 1024;
const NON_AUDIO_CONTENT_TYPE = /^(text\/|application\/(json|xml|xhtml))|html/i;

// 错误页面不能当音频分析
export const isCacheableAudioResponse = (
  response: { ok: boolean; headers?: { get(name: string): string | null } },
  blob: { size: number; type?: string },
): boolean => {
  if (!response.ok) return false;
  const contentType = response.headers?.get("content-type") || blob.type || "";
  if (NON_AUDIO_CONTENT_TYPE.test(contentType)) return false;
  return blob.size >= MIN_CACHEABLE_AUDIO_BYTES;
};
