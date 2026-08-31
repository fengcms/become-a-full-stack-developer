/**
 * src/routes/articles-write.ts
 * 文章写路由（B2 核心 /articles 子树写侧）：创建 / 更新 / 软删 / submit。
 * 薄路由：鉴权 + 校验入参 → 调 services/article(-mutation) → ok/toArticle 格式化。读侧见 articles-read.ts。
 *
 * 关键纪律（对齐契约与 02 §2.2/§2.3/§3.3）：
 * - member 创建/更新传入 published → 降级 pending；member 传入 slug → 忽略（见 article-mutation）。
 * - 写标签同步：创建/更新文章时一并维护 article_tags 关联（B3.5，见 services/article-tags）。
 * - 软删：置 deleted_at，并清理 article_tags 关联，保持 junction 与文章生命周期一致。
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { type AuthVars, authMiddleware, guard } from '@/middleware/auth';
import { v } from '@/middleware/validate';
import {
  getArticleOr404,
  resolveArticleOwner,
  softDeleteArticle,
  submitArticle,
  toArticle,
} from '@/services/article';
import {
  type ArticleCreateInput,
  type ArticleUpdateInput,
  createArticleRow,
  updateArticleRow,
} from '@/services/article-mutation';
import { ok } from '@/shared/response';

const createArticleSchema = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().max(500).nullish(),
  content: z.string().min(1).max(65535),
  coverImage: z.string().url().max(512).nullish().or(z.literal('')),
  categoryId: z.number().int().positive().optional().nullable(),
  tags: z.array(z.string()).optional(),
  slug: z.string().nullish(),
  status: z.enum(['draft', 'pending', 'published']).optional(),
});
// 更新复用创建 schema，但 title/content 改为可选（部分更新）
const updateArticleSchema = createArticleSchema.extend({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(65535).optional(),
});

const articlesWriteRoute = new Hono<AuthVars>();

/** POST / — 登录用户创建（默认 draft；member 不可自发布 / 不可指定 slug）。 */
articlesWriteRoute.post(
  '/',
  authMiddleware,
  guard('member'),
  v.json(createArticleSchema),
  async (c) => {
    const me = c.get('user');
    const input = c.req.valid('json') as ArticleCreateInput;
    const authorId = Number(me.id);
    const privileged = me.role === 'editor' || me.role === 'admin';
    const created = await createArticleRow(input, authorId, privileged);
    return ok(toArticle(created));
  },
);

/** PUT /:id — 更新；editor 或 owner；member 编辑已发布自动退回 pending。 */
articlesWriteRoute.put(
  '/:id',
  authMiddleware,
  guard('editor', resolveArticleOwner),
  v.json(updateArticleSchema),
  async (c) => {
    const me = c.get('user');
    const id = Number(c.req.param('id'));
    const existing = await getArticleOr404(id);
    const input = c.req.valid('json') as ArticleUpdateInput;
    const privileged = me.role === 'editor' || me.role === 'admin';
    const updated = await updateArticleRow(id, input, existing, privileged);
    return ok(toArticle(updated));
  },
);

/** DELETE /:id — 软删除（置 deleted_at），slug 释放可复用；清理 article_tags 关联。 */
articlesWriteRoute.delete(
  '/:id',
  authMiddleware,
  guard('editor', resolveArticleOwner),
  async (c) => {
    const id = Number(c.req.param('id'));
    await softDeleteArticle(id);
    return ok({ success: true });
  },
);

/** POST /:id/submit — draft→pending（仅作者/owner 或 admin）。 */
articlesWriteRoute.post(
  '/:id/submit',
  authMiddleware,
  guard('admin', resolveArticleOwner),
  async (c) => {
    const id = Number(c.req.param('id'));
    return ok(await submitArticle(id));
  },
);

export { articlesWriteRoute };
