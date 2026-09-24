'use client'
import { useEffect, useRef, useState } from 'react'
import type { DraftFields } from '@/lib/api/contributions'

/** Local copies are account scoped, optional to restore, and never imply server persistence. */
export function useRecovery(
  key: string,
  fields: DraftFields,
  ready: boolean,
  dirty: boolean,
  busy: boolean,
) {
  const [recovery, setRecovery] = useState<DraftFields | null>(null)
  const [storageError, setStorageError] = useState('')
  const checked = useRef('')
  useEffect(() => {
    if (!ready || checked.current === key) return
    checked.current = key
    try {
      const raw = localStorage.getItem(key)
      if (raw) {
        const copy = JSON.parse(raw)
        if (
          typeof copy.title === 'string' &&
          typeof copy.content === 'string' &&
          JSON.stringify(copy) !== JSON.stringify(fields)
        )
          setRecovery(copy)
      }
    } catch {
      setStorageError('本机恢复副本不可用，请及时保存到服务器。')
    }
  }, [key, ready, fields])
  useEffect(() => {
    if (!ready || !dirty || recovery) return
    try {
      localStorage.setItem(key, JSON.stringify(fields))
    } catch {
      setStorageError('本机空间不足或存储不可用，请及时保存到服务器。')
    }
  }, [key, fields, ready, dirty, recovery])
  useEffect(() => {
    if (!dirty && !busy) return
    const message = busy ? '正在保存或上传图片，确定离开？' : '有未保存的修改，确定离开？'
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    const click = (event: MouseEvent) => {
      const link = (event.target as Element).closest('a')
      if (
        !link ||
        link.target === '_blank' ||
        link.hasAttribute('download') ||
        link.href === location.href ||
        link.getAttribute('href')?.startsWith('#')
      )
        return
      if (!window.confirm(message)) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    // Back/forward keeps the recovery copy even when the browser cannot cancel navigation.
    window.addEventListener('beforeunload', unload)
    document.addEventListener('click', click, true)
    return () => {
      window.removeEventListener('beforeunload', unload)
      document.removeEventListener('click', click, true)
    }
  }, [dirty, busy])
  const discard = () => {
    try {
      localStorage.removeItem(key)
    } catch {
      /* Storage may be disabled. */
    }
    setRecovery(null)
  }
  return { recovery, discard, storageError }
}
