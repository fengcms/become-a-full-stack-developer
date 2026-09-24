/**
 * @file components/article/ReadingTracker.tsx
 * @description 阅读历史上报：用户在文章页停留 N 秒后上报阅读进度。
 *   客户端组件：仅登录用户上报，节流避免重复。
 * @module web-frontend/components/article
 * @date 2026-09-18
 */

'use client'

import { useEffect, useRef } from 'react'
import { reportReadingProgress } from '@/lib/api/me'
import { useAuthStore } from '@/store/auth'

interface ReadingTrackerProps {
  articleId: number
}

/** 阅读多少秒后上报。 */
const REPORT_DELAY_MS = 5000

const ReadingTracker = ({ articleId }: ReadingTrackerProps) => {
  const reportedRef = useRef(false)
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    if (!user || reportedRef.current) return

    const timer = setTimeout(() => {
      if (reportedRef.current) return
      reportedRef.current = true
      reportReadingProgress(articleId).catch(() => {
        // 上报失败不影响用户体验
      })
    }, REPORT_DELAY_MS)

    return () => clearTimeout(timer)
  }, [articleId, user])

  return null
}

export default ReadingTracker
