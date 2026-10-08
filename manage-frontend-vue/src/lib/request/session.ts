import { pinia } from '@/app/pinia'
import { useAuthStore } from '@/stores/auth'

type UnauthorizedHandler = (reason: 'expired' | 'disabled') => void
let unauthorizedHandler: UnauthorizedHandler | null = null

export const setUnauthorizedHandler = (handler: UnauthorizedHandler | null) => {
  unauthorizedHandler = handler
}

export const forceLogout = (reason: 'expired' | 'disabled') => {
  useAuthStore(pinia).clear()
  unauthorizedHandler?.(reason)
}
