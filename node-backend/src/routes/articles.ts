/**
 * src/routes/articles.ts
 * 文章核心路由（B2）/articles 子树：列表 / 创建 / 详情 / 更新 / 删除 / submit / view 共 7 端点。
 *
 * 注：本文件略超 200 行属「特殊情况」——这 7 个端点共用同一套 Zod Schema、slug 校验与
 * 状态解析助手，强拆会迫使这些复用逻辑在多个文件间重复，反而违背"可抽象复用"纪律，故保持内聚。
 * /me/articles 与 /admin/articles 子树已拆分到 articles-me.ts / articles-admin.ts。
 *
 * 关键纪律（对齐契约与 02 §2.2/§2.3/§3.3）：
 * - 公开列表/详情仅返 published；未发布详情对匿名 404（隐瞒存在性）。
 * - submit(draft→pending) 非法前态→3003；阅读量去重 24h 冷却。
 * - member 创建/更新传入 published → 降级 pending；member 传入 slug → 忽略。
 */
import { and, eq, gte, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '@/db/client';
import { type ArticleRow, articles, articleViewDedup, users } from '@/db/schema';
import {
  type ArticleStatus,
  assertValidSlug,
  fnv1a,
  queryArticles,
  resolveArticleOwner,
  toArticle,
} from '@/lib/article';
import { ErrCode } from '@/lib/codes';
import { isUniqueConstraintError } from '@/lib/db-error';
import { AppError } from '@/lib/http-error';
import { ok, paginate } from '@/lib/response';
import { type AuthVars, authMiddleware, guard, optionalAuthMiddleware } from '@/middleware/auth';
import { v } from '@/middleware/validate';

const VIEW_DEDUP_MS = 24 * 60 * 60 * 1000;

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
type CreateInput = z.infer<typeof createArticleSchema>;
type UpdateInput = z.infer<typeof updateArticleSchema>;

/** 取出作者展示名（仅展示用）。 */
const authorNameOf = async (authorId: number): Promise<string | null> => {
  const u = (
    await getDb()
      .select({ displayName: users.displayName, username: users.username })
      .from(users)
      .where(eq(users.id, authorId))
      .limit(1)
      .all()
  )[0];
  return u?.displayName ?? u?.username ?? null;
};

/** 计算新状态（含 member 权限降级 / 已发布编辑退回待审）。 */
const resolveNewStatus = (
  input: ArticleStatus | undefined,
  current: ArticleStatus,
  privileged: boolean,
): ArticleStatus => {
  let next: ArticleStatus = input ?? current;
  if (!privileged) {
    if (next === 'published') next = 'pending';
    if (current === 'published') next = 'pending'; // 会员编辑已发布→退回待审
  }
  return next;
};

const articlesRoute = new Hono<AuthVars>();

/** GET / — 公开列表，强制仅 published（?status= 被忽略）。 */
articlesRoute.get('/', async (c) => {
  const result = await queryArticles({
    c,
    forcedStatus: 'published',
    keyword: c.req.query('keyword') ?? undefined,
    tag: c.req.query('tag') ?? undefined,
    category: c.req.query('category') ?? undefined,
  });
  return paginate(result.list, result.pagination);
});

/** POST / — 登录用户创建（默认 draft；member 不可自发布 / 不可指定 slug）。 */
articlesRoute.post('/', authMiddleware, guard('member'), v.json(createArticleSchema), async (c) => {
  const me = c.get('user');
  const input = c.req.valid('json') as CreateInput;
  const db = getDb();
  const authorId = Number(me.id);
  const privileged = me.role === 'editor' || me.role === 'admin';

  const status = resolveNewStatus(input.status, 'draft', privileged);
  let slug: string | null = input.slug ?? null;
  if (!privileged) slug = null; // member 忽略 slug
  if (slug) {
    assertValidSlug(slug);
    const dup = (
      await db
        .select({ id: articles.id })
        .from(articles)
        .where(and(eq(articles.slug, slug), isNull(articles.deletedAt)))
        .limit(1)
        .all()
    )[0];
    if (dup) throw new AppError(ErrCode.CONFLICT, 409); // 3002 slug 占用
  }

  const now = new Date();
  let inserted: ArticleRow[];
  try {
    inserted = await db
      .insert(articles)
      .values({
        title: input.title,
        slug,
        summary: input.summary ?? null,
        content: input.content,
        coverImage: input.coverImage ? input.coverImage : null,
        authorId,
        authorName: await authorNameOf(authorId),
        categoryId: input.categoryId ?? null,
        categoryName: null, // B3 落地分类表后补全
        categorySlug: null,
        status,
        tags: input.tags ? JSON.stringify(input.tags) : null,
        viewCount: 0,
        likeCount: 0,
        publishedAt: status === 'published' ? now : null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .all();
  } catch (err) {
    if (isUniqueConstraintError(err)) throw new AppError(ErrCode.CONFLICT, 409); // 3002 并发 slug 冲突
    throw err;
  }
  const created = inserted[0];
  if (!created) throw new AppError(ErrCode.INTERNAL, 500);
  return ok(toArticle(created));
});

/** GET /:idOrSlug — 详情；id 或 slug 解析；匿名仅 published；owner/admin 可见任意态。 */
articlesRoute.get('/:idOrSlug', optionalAuthMiddleware, async (c) => {
  const key = c.req.param('idOrSlug');
  const db = getDb();
  const where = /^\d+$/.test(key)
    ? and(eq(articles.id, Number(key)), isNull(articles.deletedAt))
    : and(eq(articles.slug, key), isNull(articles.deletedAt));
  const row = (await db.select().from(articles).where(where).limit(1).all())[0];
  if (!row) throw new AppError(ErrCode.NOT_FOUND, 404);

  const me = c.get('user') as AuthVars['Variables']['user'] | undefined;
  const owner = me && String(row.authorId) === me.id;
  const visible = row.status === 'published' || owner || me?.role === 'admin';
  if (!visible) throw new AppError(ErrCode.NOT_FOUND, 404); // 未发布对非授权者隐瞒
  return ok(toArticle(row));
});

/** PUT /:id — 更新；editor 或 owner；member 编辑已发布自动退回 pending。 */
articlesRoute.put(
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

    const input = c.req.valid('json') as UpdateInput;
    const privileged = me.role === 'editor' || me.role === 'admin';
    const status = resolveNewStatus(input.status, existing.status as ArticleStatus, privileged);

    let slug = existing.slug;
    if (privileged && input.slug !== undefined) {
      slug = input.slug ?? null;
      if (slug) {
        assertValidSlug(slug);
        const dup = (
          await db
            .select({ id: articles.id })
            .from(articles)
            .where(and(eq(articles.slug, slug), isNull(articles.deletedAt)))
            .limit(1)
            .all()
        )[0];
        if (dup && dup.id !== id) throw new AppError(ErrCode.CONFLICT, 409); // 3002
      }
    }

    const now = new Date();
    const publishedAt = status === 'published' ? (existing.publishedAt ?? now) : null;
    await db
      .update(articles)
      .set({
        title: input.title ?? existing.title,
        slug,
        summary: input.summary !== undefined ? input.summary : existing.summary,
        content: input.content ?? existing.content,
        coverImage: input.coverImage !== undefined ? input.coverImage || null : existing.coverImage,
        categoryId: input.categoryId !== undefined ? input.categoryId : existing.categoryId,
        tags: input.tags ? JSON.stringify(input.tags) : existing.tags,
        status,
        publishedAt,
        updatedAt: now,
      })
      .where(eq(articles.id, id))
      .run();

    const rows = await db.select().from(articles).where(eq(articles.id, id)).limit(1).all();
    const updated = rows[0];
    if (!updated) throw new AppError(ErrCode.INTERNAL, 500);
    return ok(toArticle(updated));
  },
);

/** DELETE /:id — 软删除（置 deleted_at），slug 释放可复用。 */
articlesRoute.delete('/:id', authMiddleware, guard('editor', resolveArticleOwner), async (c) => {
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
  await db
    .update(articles)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(articles.id, id))
    .run();
  return ok({ success: true });
});

/** POST /:id/submit — draft→pending（仅作者/owner 或 admin）。 */
articlesRoute.post(
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
    const updated = rows[0];
    if (!updated) throw new AppError(ErrCode.INTERNAL, 500);
    return ok(toArticle(updated));
  },
);

/** POST /:id/view — 阅读量 +1（带去重）；仅 published 可计数，否则 404。 */
articlesRoute.post('/:id/view', optionalAuthMiddleware, async (c) => {
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
  if (existing?.status !== 'published') throw new AppError(ErrCode.NOT_FOUND, 404);

  const me = c.get('user') as AuthVars['Variables']['user'] | undefined;
  const ip =
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip') ?? '';
  const dedupKey = me ? `u:${me.id}` : `a:${fnv1a(`${ip}|${c.req.header('user-agent') ?? ''}`)}`;

  const recent = await db
    .select({ id: articleViewDedup.id })
    .from(articleViewDedup)
    .where(
      and(
        eq(articleViewDedup.articleId, id),
        eq(articleViewDedup.dedupKey, dedupKey),
        gte(articleViewDedup.createdAt, new Date(Date.now() - VIEW_DEDUP_MS)),
      ),
    )
    .limit(1)
    .all();
  if (recent.length === 0) {
    await db
      .insert(articleViewDedup)
      .values({ articleId: id, dedupKey, createdAt: new Date() })
      .run();
    await db
      .update(articles)
      .set({ viewCount: sql`${articles.viewCount} + 1` })
      .where(eq(articles.id, id))
      .run();
  }
  const rows = await db
    .select({ viewCount: articles.viewCount })
    .from(articles)
    .where(eq(articles.id, id))
    .limit(1)
    .all();
  const updated = rows[0];
  if (!updated) throw new AppError(ErrCode.INTERNAL, 500);
  return ok({ viewCount: updated.viewCount });
});

export { articlesRoute };
