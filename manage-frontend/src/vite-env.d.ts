/**
 * @file src/vite-env.d.ts
 * @description Vite 注入的前端环境类型声明（import.meta.env 形状）。属 Vite 资产，
 *   按开发规范 §5 豁免箭头函数 / TSDoc 强制要求，仅保留本来源头。
 * @module manage-frontend
 * @date 2026-08-29
 */

/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 接口前缀。留空时用相对路径 /api/v1，走 vite 同源代理。 */
  readonly VITE_API_BASE?: string
  /** 开发期登录页自动填充用户名。只放 .env.local，不进版本库。 */
  readonly VITE_DEV_LOGIN_USERNAME?: string
  /** 开发期登录页自动填充密码。只放 .env.local，不进版本库。 */
  readonly VITE_DEV_LOGIN_PASSWORD?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
