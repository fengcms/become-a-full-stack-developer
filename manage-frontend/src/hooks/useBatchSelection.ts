/**
 * @file hooks/useBatchSelection.ts
 * @description 批量任务限本页，逐项执行并保留失败项；只发送一次汇总提示。
 */
import { useEffect, useRef, useState } from 'react'
import { useToast } from './useToast'

/** 查询范围变化立即失效旧选择；失败明细可在页面就地查看。 */
export const useBatchSelection = (scope: string) => {
  const [selection, setSelection] = useState<{ scope: string; ids: Array<string | number> }>({
    scope,
    ids: [],
  })
  const [busy, setBusy] = useState(false)
  const [failures, setFailures] = useState<string[]>([])
  const running = useRef(false)
  const toast = useToast()
  const selected = selection.scope === scope ? selection.ids : []
  const setSelected = (ids: Array<string | number>) => setSelection({ scope, ids })
  useEffect(() => {
    if (scope !== selection.scope) {
      setFailures([])
      setSelection({ scope, ids: [] })
    }
  }, [scope, selection.scope])
  /** 顺序执行减轻限流压力，失败项继续保留选中便于重试。 */
  const run = async (
    label: string,
    ids: number[],
    action: (id: number) => Promise<unknown>,
    refresh: () => unknown,
  ) => {
    if (running.current || !ids.length) return
    running.current = true
    setBusy(true)
    const failed: number[] = []
    const messages: string[] = []
    try {
      for (const id of ids) {
        try {
          await action(id)
        } catch (error) {
          failed.push(id)
          messages.push(`#${id}：${error instanceof Error ? error.message : '操作失败，请重试'}`)
        }
      }
      setSelected(failed)
      setFailures(messages)
      await refresh()
      const message = `已${label} ${ids.length - failed.length} 项${failed.length ? `，${failed.length} 项失败，已保留选中` : ''}`
      if (failed.length) toast.info(message)
      else toast.success(message)
    } finally {
      running.current = false
      setBusy(false)
    }
  }
  return { selected, setSelected, busy, failures, run }
}
