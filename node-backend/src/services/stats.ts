/**
 * src/lib/stats.ts
 * 全站统计（B7）：published 文章数 / approved 评论数 / active 用户数 / 阅读量累计。
 * 纯查询，无 HTTP 层依赖。
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { articles, comments, users } from '@/db/schema';

/** 全站统计（SiteStats）。 */
export interface SiteStats {
  articleCount: number;
  commentCount: number;
  memberCount: number;
  viewTotal: number;
}

/** 全站统计：published 文章数 / approved 评论数 / active 用户数 / published 文章阅读量累计。 */
export const getSiteStats = async (): Promise<SiteStats> => {
  const db = getDb();
  const published = and(eq(articles.status, 'published'), isNull(articles.deletedAt));
  const [a, c, m, v] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(articles).where(published).all(),
    db
      .select({ n: sql<number>`count(*)` })
      .from(comments)
      .where(eq(comments.status, 'approved'))
      .all(),
    db.select({ n: sql<number>`count(*)` }).from(users).where(eq(users.status, 'active')).all(),
    db
      .select({ s: sql<number>`coalesce(sum(${articles.viewCount}), 0)` })
      .from(articles)
      .where(published)
      .all(),
  ]);
  return {
    articleCount: Number(a[0]?.n ?? 0),
    commentCount: Number(c[0]?.n ?? 0),
    memberCount: Number(m[0]?.n ?? 0),
    viewTotal: Number(v[0]?.s ?? 0),
  };
};
