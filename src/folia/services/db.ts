// 节拍和鼓点的分析结果存在本地，同一首歌不重复分析
const open = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open("familla-beat-analysis", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("cache");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const run = async <T,>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const request = action(db.transaction("cache", mode).objectStore("cache"));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).finally(() => db.close());
};

export const getFromCache = async <T,>(key: string): Promise<T | null> => {
  try {
    return (await run("readonly", (store) => store.get(key))) ?? null;
  } catch {
    return null;
  }
};

export const saveToCache = async (key: string, value: unknown): Promise<void> => {
  try {
    await run("readwrite", (store) => store.put(value, key));
  } catch (error) {
    console.warn("保存节拍分析结果失败:", error);
  }
};
