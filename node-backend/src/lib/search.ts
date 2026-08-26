/**
 * src/lib/search.ts
 * 搜索（B7）：文章命中 标题/摘要/正文 的 LIKE；会员命中 昵称/用户名 的 LIKE。
 * 纯查询逻辑，不触碰 HTTP 层；DB 行 snake_case → 契约 camelCase 在此完成。
 */
import { and, asc, eq, inArray, isNull, like, ne, or, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { articles, users } from '@/db/schema';
import { type ArticleSummaryRow, toArticleSummary } from '@/lib/article';
import { buildSortSql, meta } from '@/lib/pagination';
import type { Pagination } from '@/lib/response';

/** 会员公开资料（MemberProfile，搜索结果用，省略 articles 列表）。 */
export interface MemberProfile {
  id: number;
  nickname: string;
  avatar: string | null;
  level: number;
  articleCount: number;
}
/** 会员搜索分页结果（MemberPage）。 */
export interface MemberPage {
  list: MemberProfile[];
  pagination: Pagination;
}

const SEARCH_COLS = {
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
} as const;

/** 文章搜索：命中 标题/摘要/正文 的 LIKE，限 published，分页返回 ArticlePage。 */
export const searchArticles = async (
  q: string,
  page: number,
  pageSize: number,
  offset: number,
  sort?: string,
): Promise<{ list: ReturnType<typeof toArticleSummary>[]; pagination: Pagination }> => {
  const db = getDb();
  const kw = `%${q}%`;
  const where = and(
    eq(articles.status, 'published'),
    isNull(articles.deletedAt),
    or(like(articles.title, kw), like(articles.summary, kw), like(articles.content, kw)),
  );
  const rows = await db
    .select(SEARCH_COLS)
    .from(articles)
    .where(where)
    .orderBy(buildSortSql(sort))
    .limit(pageSize)
    .offset(offset)
    .all();
  const totalRow = (
    await db.select({ count: sql<number>`count(*)` }).from(articles).where(where).all()
  )[0];
  return {
    list: rows.map((r) => toArticleSummary(r as ArticleSummaryRow)),
    pagination: meta(page, pageSize, Number(totalRow?.count ?? 0)),
  };
};

/** 会员搜索：命中 昵称/用户名 的 LIKE，排除 disabled，分页返回 MemberPage（含各人 published 文章数）。 */
export const searchMembers = async (
  q: string,
  page: number,
  pageSize: number,
  offset: number,
): Promise<MemberPage> => {
  const db = getDb();
  const kw = `%${q}%`;
  const where = and(
    or(like(users.displayName, kw), like(users.username, kw)),
    ne(users.status, 'disabled'),
  );
  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      username: users.username,
      avatarUrl: users.avatarUrl,
      level: users.level,
    })
    .from(users)
    .where(where)
    .orderBy(asc(users.id))
    .limit(pageSize)
    .offset(offset)
    .all();
  const totalRow = (
    await db.select({ count: sql<number>`count(*)` }).from(users).where(where).all()
  )[0];
  const ids = rows.map((r) => r.id);
  const counts = ids.length
    ? await db
        .select({ authorId: articles.authorId, c: sql<number>`count(*)` })
        .from(articles)
        .where(
          and(
            eq(articles.status, 'published'),
            isNull(articles.deletedAt),
            inArray(articles.authorId, ids),
          ),
        )
        .groupBy(articles.authorId)
        .all()
    : [];
  const countMap = new Map(counts.map((x) => [x.authorId, Number(x.c)]));
  const list: MemberProfile[] = rows.map((r) => ({
    id: r.id,
    nickname: r.displayName ?? r.username,
    avatar: r.avatarUrl ?? null,
    level: r.level,
    articleCount: countMap.get(r.id) ?? 0,
  }));
  return { list, pagination: meta(page, pageSize, Number(totalRow?.count ?? 0)) };
};
