/**
 * Drizzle Kit 配置。
 * 用途：生产（Cloudflare D1）迁移由 `drizzle-kit generate` 生成 SQL，再于 deploy 阶段 `migrate` 应用。
 * 本地 / 测试不走此配置，直接由 src/db/migrate.ts 的 `migrate()` 执行建表。
 */
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
