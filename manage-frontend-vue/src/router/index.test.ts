import { beforeEach, describe, expect, it } from 'vitest'
import { pinia } from '@/app/pinia'
import { router } from '@/router'
import { useAuthStore } from '@/stores/auth'
import type { AuthResult, UserRole } from '@/types/common'

const auth = useAuthStore(pinia)

const signInAs = async (role: UserRole) => {
  const result = {
    accessToken: 'access',
    refreshToken: 'refresh',
    expiresIn: 900,
    user: {
      id: 1,
      username: 'tester',
      nickname: '测试用户',
      role,
      status: 'active',
      level: 1,
    },
  } as AuthResult
  auth.setSession(result)
}

describe('route access control', () => {
  beforeEach(async () => {
    auth.clear()
    await router.push('/login')
  })

  it('redirects anonymous visits to protected routes to login', async () => {
    await router.push('/articles')

    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('allows members into profile but blocks the console', async () => {
    await signInAs('member')
    await router.push('/profile')
    expect(router.currentRoute.value.path).toBe('/profile')

    await router.push('/articles')
    expect(router.currentRoute.value.path).toBe('/no-access')
  })

  it('keeps capability denial distinct from console role denial', async () => {
    await signInAs('editor')
    await router.push('/articles')
    expect(router.currentRoute.value.path).toBe('/articles')

    await router.push('/users')
    expect(router.currentRoute.value.path).toBe('/403')
  })
})
