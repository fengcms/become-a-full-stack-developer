/**
 * src/routes/members.ts
 * 会员公开主页：GET /members/{id}。契约 MemberProfile（脱敏，无 email 等）。
 * status=disabled 视为不存在（404，防账号枚举）；其已发布文章仍保留（内容下架走文章状态机）。
 * 挂载于 /api/v1/members。
 */
import { and, desc, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb } from '@/db/client';
import { articles, users } from '@/db/schema';
import { type ArticleSummaryRow, toArticleSummary } from '@/lib/article';
import { ErrCode } from '@/lib/codes';
import { AppError } from '@/lib/http-error';
import { ok } from '@/lib/response';

const membersRoute = new Hono();

membersRoute.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const user = (await getDb().select().from(users).where(eq(users.id, id)).limit(1).all())[0];
  if (!user || user.status === 'disabled') throw new AppError(ErrCode.NOT_FOUND, 404);

  const rows = await getDb()
    .select({
      id: articles.id,
      title: articles.title,
      slug: articles.slug,
      summary: articles.summary,
      coverImage: articles.coverImage,
      authorId: articles.authorId,
      authorName: articles.authorName,
      categoryId: articles.categoryId,
      categoryName: articles.categoryName,
      tags: articles.tags,
      status: articles.status,
      viewCount: articles.viewCount,
      likeCount: articles.likeCount,
      publishedAt: articles.publishedAt,
      createdAt: articles.createdAt,
      updatedAt: articles.updatedAt,
    })
    .from(articles)
    .where(
      and(eq(articles.authorId, id), eq(articles.status, 'published'), isNull(articles.deletedAt)),
    )
    .orderBy(desc(articles.publishedAt), desc(articles.id))
    .all();

  return ok({
    id: user.id,
    nickname: user.displayName ?? user.username,
    avatar: user.avatarUrl ?? null,
    level: user.level,
    articleCount: rows.length,
    articles: rows.map((r) => toArticleSummary(r as ArticleSummaryRow)),
  });
});

export { membersRoute };
