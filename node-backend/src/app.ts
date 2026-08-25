/**
 * src/app.ts
 * Hono 应用装配：错误 → CORS → 路由。env 显式传入，便于测试复用不同配置。
 * 注意：总把控裁定"契约只读、以契约为准"——此处只装配，不定义业务契约。
 *
 * 关键约束（审阅 B02）：本模块只导出工厂 `createApp`，**不在顶层创建默认 app 实例**。
 * Cloudflare Workers 导入本模块时若触发 process.env 求值会崩溃（CF 不保证 process.env），
 * 故默认实例的创建下沉到各运行时入口（index.ts / worker.ts 各自调用 createApp）。
 */
import { Hono } from 'hono';
import { type AppEnv, setActiveEnv } from '@/config/env';
import { corsMiddleware } from '@/middleware/cors';
import { errorHandler } from '@/middleware/error';
import { adminArticlesRoute } from '@/routes/articles-admin';
import { meArticlesRoute } from '@/routes/articles-me';
import { articlesReadRoute } from '@/routes/articles-read';
import { articlesWriteRoute } from '@/routes/articles-write';
import { authRoute } from '@/routes/auth';
import { categoriesReadRoute } from '@/routes/categories-read';
import { categoriesWriteRoute } from '@/routes/categories-write';
import { commentsReadRoute } from '@/routes/comments-read';
import { commentsWriteRoute } from '@/routes/comments-write';
import { filesRoute } from '@/routes/files';
import { healthRoute } from '@/routes/health';
import { meRoute } from '@/routes/me';
import { membersRoute } from '@/routes/members';
import { tagsRoute } from '@/routes/tags';
import { uploadRoute } from '@/routes/upload';
import { usersRoute } from '@/routes/users';
import { usersAdminRoute } from '@/routes/users-admin';

/**
 * 创建应用实例（纯工厂，无副作用之外的全局状态依赖）。
 * @param env 运行环境（同时安装为全局 active env，供中间件取用）
 */
export const createApp = (env: AppEnv): Hono => {
  setActiveEnv(env);
  const app = new Hono();

  app.onError(errorHandler);
  app.use('*', corsMiddleware(env));

  app.route('/api/v1/health', healthRoute);
  app.route('/api/v1/auth', authRoute);
  app.route('/api/v1/articles', articlesReadRoute);
  app.route('/api/v1/articles', articlesWriteRoute);
  app.route('/api/v1/me/articles', meArticlesRoute);
  app.route('/api/v1/admin/articles', adminArticlesRoute);
  app.route('/api/v1/categories', categoriesReadRoute);
  app.route('/api/v1/categories', categoriesWriteRoute);
  app.route('/api/v1/tags', tagsRoute);
  app.route('/api/v1', commentsReadRoute);
  app.route('/api/v1', commentsWriteRoute);
  app.route('/api/v1/users', usersRoute);
  app.route('/api/v1/admin/users', usersAdminRoute);
  app.route('/api/v1/me', meRoute);
  app.route('/api/v1/members', membersRoute);
  app.route('/api/v1', uploadRoute);
  // 本地文件直出（仅 STORAGE_DRIVER=local 生效；生产走 CDN），供本地开发预览上传素材（B5 P3-1）
  app.route('/files', filesRoute);

  return app;
};
