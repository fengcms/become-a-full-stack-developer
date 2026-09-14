/**
 * @file hooks/useCompactEditor.ts
 * @description 小屏写作优先单栏，断点切换时同步编辑器默认模式。
 */
import { useEffect, useState } from 'react'
/** 监听 640px 以下的视口，释放不必要的实时预览分栏。 */
export const useCompactEditor = () => {
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 639px)').matches)
  useEffect(() => {
    const media = window.matchMedia('(max-width: 639px)')
    const update = () => setCompact(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return compact
}
