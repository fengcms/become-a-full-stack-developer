// 有界内存缓存；会话切换或写入用版本栅栏阻止旧读取重新填回缓存。
export class DataCache {
  private entries = new Map<string, { value: unknown; until: number }>()
  private pending = new Map<string, Promise<unknown>>()
  private version = 0
  constructor(private limit = 80) {}
  clear() { this.version++; this.entries.clear(); this.pending.clear() }
  async read<T>(key: string, fetcher: () => Promise<T>, ttl = 60000, force = false): Promise<T> {
    const hit = this.entries.get(key)
    if (!force && hit && hit.until > Date.now()) return hit.value as T
    const pending = this.pending.get(key)
    if (!force && pending) return pending as Promise<T>
    const version = this.version
    const task = fetcher().then(value => {
      if (version === this.version && this.pending.get(key) === task) {
        this.entries.delete(key)
        this.entries.set(key, { value, until: Date.now() + ttl })
        while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value!)
      }
      return value
    }).finally(() => { if (this.pending.get(key) === task) this.pending.delete(key) })
    this.pending.set(key, task)
    return task
  }
}
export const cache = new DataCache()
