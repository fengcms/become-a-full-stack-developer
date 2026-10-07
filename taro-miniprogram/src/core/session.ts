import Taro from '@tarojs/taro'
import { useSyncExternalStore } from 'react'
import type { Auth, User } from './models'
import { cache } from './cache'
export const API = 'https://api-befull.kao9.com/api/v1'
const key = `befull:session:${API}`
let current: Auth | null = null
let epoch = 0
let restored = false
const listeners = new Set<() => void>()
export const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }
export const session = () => current
export const sessionEpoch = () => epoch
export const useSession = () => useSyncExternalStore(subscribe, session, session)
export function restoreSession() {
  if (restored) return
  restored = true
  try {
    const saved = Taro.getStorageSync(key)
    if (saved?.user?.id && typeof saved.refreshToken === 'string' && typeof saved.accessToken === 'string') current = saved
  } catch { /* 无缓存以游客启动 */ }
}
export function setSession(value: Auth | null, identityChange = true) {
  current = value
  if (identityChange) { epoch++; cache.clear() }
  try { if (value) Taro.setStorageSync(key, value); else Taro.removeStorageSync(key) } catch {
    Taro.showToast({ title: '会话仅保留至本次关闭', icon: 'none' })
  }
  listeners.forEach(fn => fn())
}
export function setUser(user: User) { if (current) setSession({ ...current, user }, false) }
restoreSession()
