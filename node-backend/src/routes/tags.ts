/**
 * src/routes/tags.ts
 * 标签路由（B3）/tags 子树：列表（含 articleCount）/ 创建 / 更新 / 删除 共 4 端点。
 *
 * 关键纪律（对齐契约 Tag + x-authz minRole:editor + x-cascade:none）：
 * - 列表公开（security:[]），返回 Tag[]，articleCount 由 article_tags 关联精确聚合。
 * - 写操作（建/改/删）需 editor 及以上；删除前须无文章引用（article_tags 存在则 3002 拒删）。
 * - articleCount 计数的回填入口属 B2/B4 文章提交逻辑，按 B3「禁止项」不在此实现，详见 B3-NOTES。
 */
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '@/db/client';
import { articleTags, type TagRow, tags } from '@/db/schema';
import { ErrCode } from '@/lib/codes';
import { isUniqueConstraintError } from '@/lib/db-error';
import { AppError } from '@/lib/http-error';
import { ok } from '@/lib/response';
import { slugField } from '@/lib/slug';
import { tagArticleCounts, toTag } from '@/lib/tag';
import { type AuthVars, authMiddleware, guard } from '@/middleware/auth';
import { v } from '@/middleware/validate';

/** 标签创建/更新 Schema（name + slug 必填）。 */
const tagSchema = z.object({
  name: z.string().min(1).max(50),
  slug: slugField,
});
type TagInput = z.infer<typeof tagSchema>;

const tagsRoute = new Hono<AuthVars>();

/** GET / — 标签列表（公开，含 articleCount）。 */
tagsRoute.get('/', async () => {
  const rows = await getDb().select().from(tags).all();
  const counts = await tagArticleCounts();
  return ok(rows.map((t: TagRow) => toTag(t, counts.get(t.id) ?? 0)));
});

/** POST / — 创建标签（editor/admin）。 */
tagsRoute.post('/', authMiddleware, guard('editor'), v.json(tagSchema), async (c) => {
  const input = c.req.valid('json') as TagInput;
  const db = getDb();
  const dup = (
    await db.select({ id: tags.id }).from(tags).where(eq(tags.slug, input.slug)).limit(1).all()
  )[0];
  if (dup) throw new AppError(ErrCode.CONFLICT, 409); // 3002 slug 占用

  const now = new Date();
  let inserted: TagRow[];
  try {
    inserted = await db
      .insert(tags)
      .values({ name: input.name, slug: input.slug, createdAt: now, updatedAt: now })
      .returning()
      .all();
  } catch (err) {
    if (isUniqueConstraintError(err)) throw new AppError(ErrCode.CONFLICT, 409); // 3002 并发冲突
    throw err;
  }
  const created = inserted[0];
  if (!created) throw new AppError(ErrCode.INTERNAL, 500);
  return ok(toTag(created, 0));
});

/** PUT /:id — 更新标签（editor/admin）。 */
tagsRoute.put('/:id', authMiddleware, guard('editor'), v.json(tagSchema), async (c) => {
  const id = Number(c.req.param('id'));
  const input = c.req.valid('json') as TagInput;
  const db = getDb();
  const existing = (await db.select().from(tags).where(eq(tags.id, id)).limit(1).all())[0];
  if (!existing) throw new AppError(ErrCode.NOT_FOUND, 404);

  const dup = (
    await db.select({ id: tags.id }).from(tags).where(eq(tags.slug, input.slug)).limit(1).all()
  )[0];
  if (dup && dup.id !== id) throw new AppError(ErrCode.CONFLICT, 409); // 3002 slug 占用

  const now = new Date();
  await db
    .update(tags)
    .set({ name: input.name, slug: input.slug, updatedAt: now })
    .where(eq(tags.id, id))
    .run();
  const updated = (await db.select().from(tags).where(eq(tags.id, id)).limit(1).all())[0];
  if (!updated) throw new AppError(ErrCode.INTERNAL, 500);
  const counts = await tagArticleCounts();
  return ok(toTag(updated, counts.get(id) ?? 0));
});

/** DELETE /:id — 删除标签（editor/admin）；x-cascade:none，仍有文章引用则拒删。 */
tagsRoute.delete('/:id', authMiddleware, guard('editor'), async (c) => {
  const id = Number(c.req.param('id'));
  const db = getDb();
  const existing = (await db.select().from(tags).where(eq(tags.id, id)).limit(1).all())[0];
  if (!existing) throw new AppError(ErrCode.NOT_FOUND, 404);

  const ref = (
    await db
      .select({ id: articleTags.id })
      .from(articleTags)
      .where(eq(articleTags.tagId, id))
      .limit(1)
      .all()
  )[0];
  if (ref) throw new AppError(ErrCode.CONFLICT, 409); // 3002 仍有文章引用

  await db.delete(tags).where(eq(tags.id, id)).run();
  return ok({ success: true });
});

export { tagsRoute };
