/**
 * src/routes/members.ts
 * 会员公开主页：GET /members/{id}。契约 MemberProfile（脱敏，无 email 等）。
 * status=disabled 视为不存在（404，防账号枚举）；其已发布文章仍保留（内容下架走文章状态机）。
 * 挂载于 /api/v1/members。
 * 薄路由：调 getMemberOr404（service，含 disabled→404）与 queryArticles（service）后组装响应。无 DB 查询。
 */
import { Hono } from 'hono';
import { queryArticles } from '@/services/article';
import { getMemberOr404 } from '@/services/user';
import { ok } from '@/shared/response';

const membersRoute = new Hono();

membersRoute.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const user = await getMemberOr404(id);

  // P3-2：会员文章列表分页（与公开列表一致的 page/sort 参数），articleCount 取分页 total。
  // 复用了 services/article.ts 的统一列表查询，避免重复实现投影 / 排序 / 计数逻辑。
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
