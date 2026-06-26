type Entry<T> = { value: T; expires: number };

export class TtlCache<K, V> {
  private readonly store = new Map<K, Entry<V>>();
  private readonly defaultTtlMs: number;
  private readonly maxEntries: number;

  constructor(ttlMs: number, maxEntries = 256) {
    this.defaultTtlMs = ttlMs;
    this.maxEntries = maxEntries;
  }

  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expires < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V, ttlMs = this.defaultTtlMs): void {
    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, { value, expires: Date.now() + ttlMs });
    this.evict();
  }

  private evict(): void {
    while (this.store.size > this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey === undefined) break;
      this.store.delete(oldestKey);
    }
  }
}