/**
 * @file open-next.config.ts
 * @description OpenNext for Cloudflare 适配器配置。
 *   基础配置即可，OpenNext 会自动适配 Next.js 构建产物为 Cloudflare Workers 格式。
 * @module web-frontend
 * @date 2026-09-16
 */

import { defineCloudflareConfig } from '@opennextjs/cloudflare'

export default defineCloudflareConfig({})
