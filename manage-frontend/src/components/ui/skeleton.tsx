/**
 * @file src/components/ui/skeleton.tsx
 * @description 骨架屏占位（加载态）。使用 shimmer 渐变动画替代纯色 pulse。
 */
import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'relative isolate overflow-hidden rounded-md bg-muted',
        'after:absolute after:inset-0 after:-translate-x-full',
        'after:animate-[shimmer_1.5s_infinite]',
        'after:bg-gradient-to-r after:from-transparent after:via-white/10 after:to-transparent',
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }
