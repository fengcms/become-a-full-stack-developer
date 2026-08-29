/**
 * @file src/components/ui/drawer.tsx
 * @description 右侧滑出抽屉。Portal 渲染到 body，带开关动画，锁 body 滚动。
 */
import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title?: string
  width?: number
  children: React.ReactNode
}

export function Drawer({ open, onClose, title, width = 800, children }: DrawerProps) {
  const [visible, setVisible] = useState(false)

  // 入场动画延迟（等 Portal 挂载到 DOM 后再加 animate）
  useEffect(() => {
    if (open) {
      setVisible(true)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  const handleClose = useCallback(() => {
    setVisible(false)
    setTimeout(() => {
      onClose()
    }, 200) // 等 CSS 动画结束
  }, [onClose])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) handleClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [open, handleClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal>
      {/* 遮罩 */}
      <div
        className={cn(
          'absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity duration-200',
          visible ? 'opacity-100' : 'opacity-0',
        )}
        onClick={handleClose}
      />

      {/* 抽屉面板 */}
      <div
        className={cn(
          'absolute right-0 top-0 h-full bg-card shadow-2xl transition-transform duration-200 ease-out',
          'flex flex-col',
          visible ? 'translate-x-0' : 'translate-x-full',
        )}
        style={{ width: `${width}px`, maxWidth: '100vw' }}
      >
        {title ? (
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
            <h3 className="text-base font-semibold">{title}</h3>
            <button
              type="button"
              onClick={handleClose}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
