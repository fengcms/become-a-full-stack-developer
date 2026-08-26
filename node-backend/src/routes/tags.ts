/**
 * src/routes/tags.ts
 * 标签路由（B3）/tags 子树：列表（含 articleCount）/ 创建 / 更新 / 删除 共 4 端点。
 *
 * 关键纪律（对齐契约 Tag + x-authz minRole:editor + x-cascade:none）：
 * - 列表公开（security:[]），返回 Tag[]，articleCount 由 article_tags 关联精确聚合。
 * - 写操作（建/改/删）需 editor 及以上；删除前须无文章引用（article_tags 存在则 3002 拒删）。
 * - articleCount 计数的回填入口属 B2/B4 文章提交逻辑，按 B3「禁止项」不在此实现，详见 B3-NOTES。
 * 薄路由：校验入参 → 调恰好一个 service → ok 格式化。无 DB 查询、无业务规则。
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { type AuthVars, authMiddleware, guard } from '@/middleware/auth';
import { v } from '@/middleware/validate';
import { createTag, deleteTag, listTags, tagArticleCounts, toTag, updateTag } from '@/services/tag';
import { ok } from '@/shared/response';
import { slugField } from '@/shared/slug';

/** 标签创建/更新 Schema（name + slug 必填）。 */
const tagSchema = z.object({
  name: z.string().min(1).max(50),
  slug: slugField,
});
type TagInput = z.infer<typeof tagSchema>;

const tagsRoute = new Hono<AuthVars>();

/** GET / — 标签列表（公开，含 articleCount）。 */
tagsRoute.get('/', async () => {
  const rows = await listTags();
  const counts = await tagArticleCounts();
  return ok(rows.map((t) => toTag(t, counts.get(t.id) ?? 0)));
});

/** POST / — 创建标签（editor/admin）。 */
tagsRoute.post('/', authMiddleware, guard('editor'), v.json(tagSchema), async (c) => {
  const input = c.req.valid('json') as TagInput;
  const created = await createTag(input);
  return ok(toTag(created, 0));
});

/** PUT /:id — 更新标签（editor/admin）。 */
tagsRoute.put('/:id', authMiddleware, guard('editor'), v.json(tagSchema), async (c) => {
  const id = Number(c.req.param('id'));
  const input = c.req.valid('json') as TagInput;
  const updated = await updateTag(id, input);
  const counts = await tagArticleCounts();
  return ok(toTag(updated, counts.get(id) ?? 0));
});

/** DELETE /:id — 删除标签（editor/admin）；x-cascade:none，仍有文章引用则拒删。 */
tagsRoute.delete('/:id', authMiddleware, guard('editor'), async (c) => {
  const id = Number(c.req.param('id'));
  await deleteTag(id);
  return ok({ success: true });
});

export { tagsRoute };
