import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AuthResult, User } from '@/types/common'

export type BootStatus = 'idle' | 'booting' | 'ready'

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(null)
  const refreshToken = ref<string | null>(null)
  const user = ref<User | null>(null)
  const bootStatus = ref<BootStatus>('idle')

  function setSession(auth: AuthResult) {
    accessToken.value = auth.accessToken
    refreshToken.value = auth.refreshToken ?? refreshToken.value
    user.value = auth.user
    bootStatus.value = 'ready'
  }

  function setUser(next: User) {
    user.value = next
  }

  function setBootStatus(next: BootStatus) {
    bootStatus.value = next
  }

  function clear() {
    accessToken.value = null
    refreshToken.value = null
    user.value = null
    bootStatus.value = 'ready'
  }

  return { accessToken, refreshToken, user, bootStatus, setSession, setUser, setBootStatus, clear }
})
