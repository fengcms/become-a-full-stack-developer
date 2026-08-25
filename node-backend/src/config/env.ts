/**
 * src/config/env.ts
 * 运行环境单一入口。所有外部配置（JWT 密钥、DB 路径、CORS…）都收口到这里，
 * 业务 / 中间件不直接读 process.env，统一经 readEnv 解析校验后注入。
 */
import { z } from 'zod';

/** 配置 schema。新增配置项在此声明，缺省值集中在 default。 */
const schema = z.object({
  JWT_SECRET: z.string().min(1, 'JWT_SECRET 必填'),
  DB_FILE: z.string().default(':memory:'),
  STORAGE_DRIVER: z.enum(['local', 'r2']).default('local'),
  CORS_ORIGINS: z.string().default('*'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
  // CF 绑定（本地为 undefined）
  R2_BUCKET: z.unknown().optional(),
  DB: z.unknown().optional(),
});

/** 应用运行环境类型（由 schema 推导，保证与校验一致）。 */
export type AppEnv = z.infer<typeof schema>;

/**
 * 从任意键值源（process.env / CF env）解析并校验运行配置。
 * @param src 键值源
 */
export const readEnv = (src: Record<string, string | undefined>): AppEnv => schema.parse(src);

let active: AppEnv | null = null;

/** 安装当前环境（应用启动时调用一次）。 */
export const setActiveEnv = (env: AppEnv): void => {
  active = env;
};

/** 取当前环境；未安装时抛错，防止配置被悄悄遗漏。 */
export const getActiveEnv = (): AppEnv => {
  if (!active) throw new Error('Env not installed; call setActiveEnv() first.');
  return active;
};
