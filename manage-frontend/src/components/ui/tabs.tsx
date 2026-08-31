/**
 * @file src/components/ui/tabs.tsx
 * @description 轻量受控 Tabs（零新依赖，API 对齐 shadcn）。用于发布文章页「内容 / 设置」分栏。
 *   含 ARIA role（tablist/tab/tabpanel）与左右方向键导航；视觉风格与项目其余 shadcn 件一致。
 * @module manage-frontend/components/ui
 * @date 2026-08-31
 */

import {
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
  createContext,
  useContext,
  useRef,
} from 'react'
import { cn } from '@/lib/utils'

/** Tabs 上下文：当前选中值 + 切换回调。 */
type TabsContextValue = {
  value: string
  setValue: (v: string) => void
}
const TabsContext = createContext<TabsContextValue | null>(null)

const useTabs = (): TabsContextValue => {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error('Tabs 子组件必须在 <Tabs> 内使用')
  return ctx
}

/** Tabs 容器（受控）。 */
export const Tabs = ({
  value,
  onValueChange,
  children,
  className,
}: {
  value: string
  onValueChange: (v: string) => void
  children: ReactNode
  className?: string
}) => {
  return (
    <TabsContext.Provider value={{ value, setValue: onValueChange }}>
      <div className={cn('w-full', className)}>{children}</div>
    </TabsContext.Provider>
  )
}

/** Tabs 标签栏（role=tablist），支持方向键切换。 */
export const TabsList = ({ children, className }: { children: ReactNode; className?: string }) => {
  const ref = useRef<HTMLDivElement>(null)

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    const triggers = Array.from(
      ref.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])') ?? [],
    )
    const idx = triggers.findIndex((t) => t === document.activeElement)
    if (idx === -1 || triggers.length === 0) return
    e.preventDefault()
    const next =
      e.key === 'ArrowRight'
        ? (idx + 1) % triggers.length
        : (idx - 1 + triggers.length) % triggers.length
    triggers[next]?.focus()
    triggers[next]?.click()
  }

  return (
    <div
      ref={ref}
      role="tablist"
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      className={cn(
        'inline-flex items-center gap-4 border-b border-border',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** 单个标签触发器（role=tab）。 */
export const TabsTrigger = ({
  value,
  children,
  className,
  disabled,
  ...rest
}: { value: string; children: ReactNode; className?: string; disabled?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) => {
  const { value: active, setValue } = useTabs()
  const selected = active === value
  return (
    <button
      type="button"
      role="tab"
      id={`tab-${value}`}
      aria-selected={selected}
      aria-controls={`tabpanel-${value}`}
      tabIndex={selected ? 0 : -1}
      disabled={disabled}
      onClick={() => setValue(value)}
      className={cn(
        'inline-flex items-center gap-1.5 border-b-2 border-transparent px-1 py-2 text-sm font-medium transition-colors -mb-px',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        selected ? 'border-primary text-foreground' : 'text-muted-foreground hover:text-foreground',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

/** 标签面板内容（role=tabpanel）。非激活项不渲染。 */
export const TabsContent = ({
  value,
  children,
  className,
  ...rest
}: { value: string; children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) => {
  const { value: active } = useTabs()
  if (active !== value) return null
  return (
    <div
      role="tabpanel"
      id={`tabpanel-${value}`}
      aria-labelledby={`tab-${value}`}
      tabIndex={0}
      className={cn('focus-visible:outline-none', className)}
      {...rest}
    >
      {children}
    </div>
  )
}
