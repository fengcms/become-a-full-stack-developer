/**
 * @file src/hooks/useViewportHeight.ts
 * @description 返回当前视口高度（px），随窗口 resize 实时更新。
 *   用于让「新建文章」的写作区编辑器尽量占满可视高度，呈现文章系统专属的大编辑体验。
 * @module manage-frontend/hooks
 * @date 2026-08-31
 */

import { useEffect, useState } from 'react'

/** 当前视口高度，SSR 安全，resize 自动同步。 */
export function useViewportHeight(): number {
  const [height, setHeight] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight : 900,
  )
  useEffect(() => {
    const onResize = () => setHeight(window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return height
}
