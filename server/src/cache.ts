type Entry<T> = { value: T; expires: number };

const TTL_MS = 60_000;
const store = new Map<string, Entry<unknown>>();

export function cacheGet<T>(key: string): T | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    store.delete(key);
    return undefined;
  }
  return hit.value as T;
}

export function cacheSet<T>(key: string, value: T): void {
  store.set(key, { value, expires: Date.now() + TTL_MS });
}

export function cacheClear(): void {
  store.clear();
}
