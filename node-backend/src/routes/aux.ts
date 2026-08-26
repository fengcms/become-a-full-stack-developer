/**
 * src/routes/aux.ts
 * 辅助接口（B7 辅助/站点）：上一篇/下一篇、相关文章、目录、全站统计、搜索。
 * 全部公开（security: []）；adjacent/related/toc 对未发布文章按公开可见性铁律返回 404。
 * 挂载于 /api/v1（路径 /articles/{id}/adjacent|related|toc、/stats、/search）。
 */
import { Hono } from 'hono';
import type { AuthVars } from '@/middleware/auth';
import { getAdjacent, getPublishedArticle, getRelated } from '@/services/related';
import { searchArticles, searchMembers } from '@/services/search';
import { getSiteStats } from '@/services/stats';
import { ErrCode } from '@/shared/codes';
import { AppError } from '@/shared/errors';
import { parsePage } from '@/shared/pagination';
import { ok } from '@/shared/response';
import { parseToc } from '@/shared/toc';

const auxRoute = new Hono<AuthVars>();

/** 解析路径 id；非整数 → 404（与「资源不存在」一致）。 */
const parseId = (raw: string): number => {
  const id = Number(raw);
  if (!Number.isInteger(id)) throw new AppError(ErrCode.NOT_FOUND, 404);
  return id;
};

/** GET /articles/:id/adjacent — 上一篇/下一篇（仅 published 参与）。 */
auxRoute.get('/articles/:id/adjacent', async (c) => {
  const id = parseId(c.req.param('id'));
  const article = await getPublishedArticle(id);
  return ok(await getAdjacent(article));
});

/** GET /articles/:id/related — 相关文章（共享标签 + 同分类打分；?limit 默认 5，封顶 10）。 */
auxRoute.get('/articles/:id/related', async (c) => {
  const id = parseId(c.req.param('id'));
  const limit = Math.min(10, Math.max(1, Number(c.req.query('limit') ?? 5) || 5));
  const article = await getPublishedArticle(id);
  return ok(await getRelated(article, limit));
});

/** GET /articles/:id/toc — 目录（解析正文 Markdown 标题）。 */
auxRoute.get('/articles/:id/toc', async (c) => {
  const id = parseId(c.req.param('id'));
  const article = await getPublishedArticle(id);
  return ok(parseToc(article.content));
});

/** GET /stats — 全站统计（published 文章 / approved 评论 / active 用户 / 阅读量累计）。 */
auxRoute.get('/stats', async () => ok(await getSiteStats()));

/** GET /search — 搜索（?q 必填；?type=article|member 默认 article；?sort 仅文章生效）。 */
auxRoute.get('/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  if (!q) throw new AppError(ErrCode.VALIDATION, 400); // 关键词为空 → 4001
  const type = c.req.query('type') === 'member' ? 'member' : 'article';
  const { page, pageSize, offset } = parsePage(c);
  if (type === 'member') {
    const result = await searchMembers(q, page, pageSize, offset);
    return ok({ members: result, articles: null });
  }
  const result = await searchArticles(q, page, pageSize, offset, c.req.query('sort'));
  return ok({ articles: { list: result.list, pagination: result.pagination }, members: null });
});

export { auxRoute };
