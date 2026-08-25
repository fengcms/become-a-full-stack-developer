/**
 * src/routes/members.ts
 * 会员公开主页：GET /members/{id}。契约 MemberProfile（脱敏，无 email 等）。
 * status=disabled 视为不存在（404，防账号枚举）；其已发布文章仍保留（内容下架走文章状态机）。
 * 挂载于 /api/v1/members。
 */
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb } from '@/db/client';
import { users } from '@/db/schema';
import { queryArticles } from '@/lib/article';
import { ErrCode } from '@/lib/codes';
import { AppError } from '@/lib/http-error';
import { ok } from '@/lib/response';

const membersRoute = new Hono();

membersRoute.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const user = (await getDb().select().from(users).where(eq(users.id, id)).limit(1).all())[0];
  if (!user || user.status === 'disabled') throw new AppError(ErrCode.NOT_FOUND, 404);

  // P3-2：会员文章列表分页（与公开列表一致的 page/sort 参数），articleCount 取分页 total。
  // 复用了 lib/article.ts 的统一列表查询，避免重复实现投影 / 排序 / 计数逻辑。
  const page = await queryArticles({ c, authorId: id, forcedStatus: 'published' });

  return ok({
    id: user.id,
    nickname: user.displayName ?? user.username,
    avatar: user.avatarUrl ?? null,
    level: user.level,
    articleCount: page.pagination.total,
    articles: page.list,
  });
});

export { membersRoute };
