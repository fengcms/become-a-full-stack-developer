/**
 * @file hooks/useKeywordFilter.ts
 * @description 搜索只在用户输入变化后提交，首次进入和恢复列表不重置页码。
 */
import { useEffect, useState } from 'react'
/** 同步 URL 关键词，并延迟提交用户输入。 */
export const useKeywordFilter = (
  keyword: string,
  onChange: (filters: { keyword?: string }) => void,
) => {
  const [value, setValue] = useState(keyword)
  useEffect(() => {
    setValue(keyword)
  }, [keyword])
  useEffect(() => {
    if (value.trim() === keyword) return
    const timer = setTimeout(() => onChange({ keyword: value.trim() || undefined }), 300)
    return () => clearTimeout(timer)
  }, [value, keyword, onChange])
  return [value, setValue] as const
}
