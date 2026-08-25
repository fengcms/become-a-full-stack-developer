/**
 * src/app.ts
 * Hono 应用装配：错误 → CORS → 路由。env 显式传入，便于测试复用不同配置。
 * 注意：总把控裁定"契约只读、以契约为准"——此处只装配，不定义业务契约。
 */
import { Hono } from 'hono';
import { type AppEnv, readEnv, setActiveEnv } from './config/env';
import { ok } from './lib/response';
import { authMiddleware, guard } from './middleware/auth';
import { corsMiddleware } from './middleware/cors';
import { errorHandler } from './middleware/error';
import { healthRoute } from './routes/health';

/**
 * 创建应用实例。
 * @param env 运行环境（同时安装为全局 active env，供中间件取用）
 */
export const createApp = (env: AppEnv): Hono => {
  setActiveEnv(env);
  const app = new Hono();

  app.onError(errorHandler);
  app.use('*', corsMiddleware(env));

  app.route('/api/v1/health', healthRoute);

  // 受保护占位路由：仅用于验收门禁 3（无 token 应得 401 包络）。B1 起替换为真实鉴权端点。
  app.get('/api/v1/protected-ping', authMiddleware, guard('member'), () => ok({ pong: true }));

  return app;
};

/** 默认实例（Node 入口用）：从 process.env 构造。 */
export const app = createApp(readEnv(process.env as Record<string, string | undefined>));

/** 应用类型，供前端 / 测试推导路由。 */
export type AppType = typeof app;
