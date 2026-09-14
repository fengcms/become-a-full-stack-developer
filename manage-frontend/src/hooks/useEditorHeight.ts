/**
 * @file hooks/useEditorHeight.ts
 * @description 观察编辑器容器可用高度；隐藏面板不把高度重置为零。
 */
import { useCallback, useRef, useState } from 'react'
/** 回调 ref 卸载时释放观察器，支持面板显隐与窗口变化。 */
export const useEditorHeight = () => {
  const [height, setHeight] = useState(560)
  const observer = useRef<ResizeObserver | null>(null)
  const measure = useCallback((node: HTMLDivElement | null) => {
    observer.current?.disconnect()
    if (!node) return
    const ro = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.height > 0) setHeight(Math.floor(entry.contentRect.height))
    })
    ro.observe(node)
    observer.current = ro
  }, [])
  return { height, measure }
}
