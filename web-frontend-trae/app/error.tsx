/**
 * @file app/error.tsx
 * @description 全局错误边界。
 *   客户端组件：捕获渲染错误，展示友好提示 + 重试按钮。
 * @module web-frontend/app
 * @date 2026-09-18
 */

'use client'

import { useEffect } from 'react'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

const Error = ({ error, reset }: ErrorProps) => {
  useEffect(() => {
    // 开发环境输出错误，便于排查
    console.error(error)
  }, [error])

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="font-serif text-6xl font-semibold text-ink">500</p>
      <h1 className="mt-4 text-xl font-semibold text-ink">页面出错了</h1>
      <p className="mt-2 text-ink-soft">抱歉，页面渲染时遇到问题，请稍后重试。</p>
      <button
        type="button"
        onClick={reset}
        className="mt-8 rounded border border-accent px-5 py-2 text-accent transition-colors hover:bg-accent hover:text-surface"
      >
        重试
      </button>
    </main>
  )
}

export default Error
