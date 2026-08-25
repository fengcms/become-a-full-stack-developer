/**
 * src/routes/articles-write.ts
 * 文章写路由（B2 核心 /articles 子树写侧）：创建 / 更新 / 软删 / submit。
 * 读侧见 articles-read.ts，二者在 app.ts 同挂 /api/v1/articles。
 * 共享写逻辑（状态/slug 解析、创建/更新 DB 操作、标签同步）已抽到 lib/article-mutation.ts。
 *
 * 关键纪律（对齐契约与 02 §2.2/§2.3/§3.3）：
 * - member 创建/更新传入 published → 降级 pending；member 传入 slug → 忽略（见 article-mutation）。
 * - 写标签同步：创建/更新文章时一并维护 article_tags 关联（B3.5，见 lib/article-tags）。
 * - 软删：置 deleted_at，并清理 article_tags 关联，保持 junction 与文章生命周期一致。
 */
import { and, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '@/db/client';
import { type ArticleRow, articles, articleTags } from '@/db/schema';
import { resolveArticleOwner, toArticle } from '@/lib/article';
import {
  type ArticleCreateInput,
  type ArticleUpdateInput,
  createArticleRow,
  updateArticleRow,
} from '@/lib/article-mutation';
import { ErrCode } from '@/lib/codes';
import { AppError } from '@/lib/http-error';
import { ok } from '@/lib/response';
import { type AuthVars, authMiddleware, guard } from '@/middleware/auth';
import { v } from '@/middleware/validate';

const createArticleSchema = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().max(500).optional(),
  content: z.string().min(1).max(65535),
  coverImage: z.string().url().max(512).optional().or(z.literal('')),
  categoryId: z.number().int().positive().optional().nullable(),
  tags: z.array(z.string()).optional(),
  slug: z.string().optional(),
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
    const db = getDb();
    const existing = (
      await db
        .select()
        .from(articles)
        .where(and(eq(articles.id, id), isNull(articles.deletedAt)))
        .limit(1)
        .all()
    )[0];
    if (!existing) throw new AppError(ErrCode.NOT_FOUND, 404);
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
    const db = getDb();
    const existing = (
      await db
        .select({ id: articles.id })
        .from(articles)
        .where(and(eq(articles.id, id), isNull(articles.deletedAt)))
        .limit(1)
        .all()
    )[0];
    if (!existing) throw new AppError(ErrCode.NOT_FOUND, 404);
    await db.delete(articleTags).where(eq(articleTags.articleId, id)).run();
    await db
      .update(articles)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(articles.id, id))
      .run();
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
    const db = getDb();
    const existing = (
      await db
        .select()
        .from(articles)
        .where(and(eq(articles.id, id), isNull(articles.deletedAt)))
        .limit(1)
        .all()
    )[0];
    if (!existing) throw new AppError(ErrCode.NOT_FOUND, 404);
    if (existing.status !== 'draft') throw new AppError(ErrCode.STATE_CONFLICT, 409); // 3003 非法前态
    await db
      .update(articles)
      .set({ status: 'pending', updatedAt: new Date() })
      .where(eq(articles.id, id))
      .run();
    const rows = await db.select().from(articles).where(eq(articles.id, id)).limit(1).all();
    const updated = rows[0] as ArticleRow;
    if (!updated) throw new AppError(ErrCode.INTERNAL, 500);
    return ok(toArticle(updated));
  },
);

export { articlesWriteRoute };
