/** @file View/history reporting after a real reading interval, deduplicated per identity/article. */
'use client'
import { useEffect } from 'react'
import { reportReadingProgress } from '@/lib/api/me'
import { request } from '@/lib/request'
import { useAuthStore } from '@/store/auth'

const viewed = new Set<number>()
const recorded = new Set<string>()
/** Reporting failures do not interrupt reading and remain eligible for retry on revisit. */
export const ReadingTracker = ({ id }: { id: number }) => {
  const user = useAuthStore((s) => s.user)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!viewed.has(id)) {
        viewed.add(id)
        void request(`/articles/${id}/view`, {
          method: 'POST',
          skipAuth: true,
          skipRefresh: true,
        }).catch(() => viewed.delete(id))
      }
      const key = `${user?.id}:${id}`
      if (user && !recorded.has(key)) {
        recorded.add(key)
        void reportReadingProgress(id).catch(() => recorded.delete(key))
      }
    }, 5000)
    return () => clearTimeout(timer)
  }, [id, user?.id, user])
  return null
}
