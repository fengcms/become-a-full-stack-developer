/**
 * @file components/feedback/UnsavedChanges.tsx
 * @description 拦截应用内导航、浏览器返回和关闭窗口，避免丢失未保存输入。
 */
import { type RefObject, useEffect } from 'react'
import { useBlocker } from 'react-router-dom'
import { ConfirmDialog } from './ConfirmDialog'

/** 有修改时确认离开；提交/上传期间禁止离开，成功后的内部跳转可显式放行。 */
export const UnsavedChanges = ({
  dirty,
  busy = false,
  allowNavigation,
}: {
  dirty: boolean
  busy?: boolean
  allowNavigation?: RefObject<boolean>
}) => {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !allowNavigation?.current &&
      (dirty || busy) &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
  )
  useEffect(() => {
    if (!dirty && !busy) return
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [dirty, busy])
  return (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      title={busy ? '操作尚未完成' : '有未保存的修改'}
      description={busy ? '请等待保存或图片上传完成后再离开。' : '离开后，本次未保存的修改将丢失。'}
      cancelText="继续编辑"
      confirmText="放弃修改并离开"
      onOpenChange={(open) => {
        if (!open && blocker.state === 'blocked') blocker.reset()
      }}
      onConfirm={() => {
        if (!busy && blocker.state === 'blocked') blocker.proceed()
      }}
      confirmDisabled={busy}
    />
  )
}
