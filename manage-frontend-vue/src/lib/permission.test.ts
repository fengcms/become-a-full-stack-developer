import { describe, expect, it } from 'vitest'
import {
  canManageArticles,
  canManageSiteSettings,
  canManageUsers,
  canOperateOwned,
} from '@/lib/permission'

describe('role capabilities', () => {
  it('limits content management to editors and admins', () => {
    expect(canManageArticles({ id: 1, role: 'member' })).toBe(false)
    expect(canManageArticles({ id: 1, role: 'editor' })).toBe(true)
    expect(canManageArticles({ id: 1, role: 'admin' })).toBe(true)
  })

  it('limits account and site administration to admins', () => {
    expect(canManageUsers({ id: 1, role: 'editor' })).toBe(false)
    expect(canManageSiteSettings({ id: 1, role: 'editor' })).toBe(false)
    expect(canManageUsers({ id: 1, role: 'admin' })).toBe(true)
    expect(canManageSiteSettings({ id: 1, role: 'admin' })).toBe(true)
  })

  it('allows owners to manage their own resources while preserving editor override', () => {
    expect(canOperateOwned({ id: 7, role: 'member' }, 7, 'editor')).toBe(true)
    expect(canOperateOwned({ id: 7, role: 'member' }, 8, 'editor')).toBe(false)
    expect(canOperateOwned({ id: 7, role: 'editor' }, 8, 'editor')).toBe(true)
    expect(canOperateOwned(null, 7, 'editor')).toBe(false)
  })
})
