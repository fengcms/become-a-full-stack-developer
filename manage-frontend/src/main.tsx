/**
 * src/main.tsx
 * 挂载入口。Provider 嵌套顺序有讲究：
 *   ThemeProvider（最外，主题类名要作用于整棵树，含 Portal 出去的弹层）
 *     → QueryClientProvider（数据层，路由与页面都要用）
 *       → RouterProvider（数据路由支持未保存稿件的导航拦截）
 *         → App
 */

import { QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { queryClient } from '@/lib/queryClient'
import { router } from '@/router'
import '@/index.css'

const container = document.getElementById('root')
if (!container) throw new Error('#root 节点缺失，检查 index.html')

createRoot(container).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
