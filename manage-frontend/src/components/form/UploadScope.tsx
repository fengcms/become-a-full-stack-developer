/**
 * @file components/form/UploadScope.tsx
 * @description 将表单内所有图片上传汇总，提交与离开保护共用同一上传状态。
 */
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'

const UploadContext = createContext<{ count: number; begin: () => () => void }>({
  count: 0,
  begin: () => () => {},
})

/** 为一个表单提供上传计数；每个任务独立释放，兼容并发。 */
export const UploadScope = ({ children }: { children: ReactNode }) => {
  const [count, setCount] = useState(0)
  const begin = useCallback(() => {
    setCount((n) => n + 1)
    let finished = false
    return () => {
      if (finished) return
      finished = true
      setCount((n) => Math.max(0, n - 1))
    }
  }, [])
  const value = useMemo(() => ({ count, begin }), [count, begin])
  return <UploadContext.Provider value={value}>{children}</UploadContext.Provider>
}

/** 读取当前表单上传状态及任务登记入口。 */
export const useUploadActivity = () => useContext(UploadContext)
