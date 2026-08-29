/**
 * src/services/comment-query.ts
 * 评论路由（read / write 拆分后）共用的轻量查询辅助。
 * 与 services/article.ts 同源模式：services 层持有 DB 查询，避免 comments.ts
 * 两文件互相 import。仅含纯查询，不持有任何 Hono 上下文。
 */
import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { articles, users } from '@/db/schema';

/** 按 id 或 slug 解析未软删文章；不存在返回 null。 */
export const resolveArticle = async (
  key: string,
): Promise<{ id: number; status: string; authorId: number } | null> => {
  const where = /^\d+$/.test(key)
    ? and(eq(articles.id, Number(key)), isNull(articles.deletedAt))
    : and(eq(articles.slug, key), isNull(articles.deletedAt));
  const row = (
    await getDb()
      .select({ id: articles.id, status: articles.status, authorId: articles.authorId })
      .from(articles)
      .where(where)
      .limit(1)
      .all()
  )[0];
  return row ?? null;
};

/** 取当前登录用户名（displayName 优先，降级 username）。 */
export const userNameOf = async (userId: number): Promise<string> => {
  const u = (
    await getDb()
      .select({ displayName: users.displayName, username: users.username })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .all()
  )[0];
  return u?.displayName ?? u?.username ?? '匿名用户';
};
