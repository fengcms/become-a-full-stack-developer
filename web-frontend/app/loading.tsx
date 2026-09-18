/**
 * @file app/loading.tsx
 * @description 全局加载态。
 *   极简编辑风：居中圆点动画。
 * @module web-frontend/app
 * @date 2026-09-18
 */

const Loading = () => {
  return (
    <main className="flex min-h-[40vh] items-center justify-center">
      <div className="flex gap-1.5" role="status" aria-label="加载中">
        <span className="h-2 w-2 animate-bounce rounded-full bg-ink-faint [animation-delay:-0.3s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-ink-faint [animation-delay:-0.15s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-ink-faint" />
      </div>
    </main>
  )
}

export default Loading
