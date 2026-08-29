/**
 * @file src/pages/errors/index.ts
 * @description 错误页统一出口。路由表从 `@/pages/errors` 取三个状态页，不直接依赖具体文件。
 * @module manage-frontend/pages/errors
 * @date 2026-08-29
 */

export { default as ForbiddenPage } from '@/pages/errors/ForbiddenPage'
export { default as NoAccessPage } from '@/pages/errors/NoAccessPage'
export { default as NotFoundPage } from '@/pages/errors/NotFoundPage'
