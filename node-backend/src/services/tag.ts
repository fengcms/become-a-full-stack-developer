/**
 * src/services/tag.ts
 * 标签领域逻辑：序列化、articleCount 聚合，以及列表/创建/更新/删除。
 *
 * articleCount 聚合策略（呼应 B2 复批「改为关联表精确 IN 查询」建议）：
 * 由 article_tags 关联表 JOIN 已发布且未软删的文章计数，得到每个标签下的有效文章数。
 * 关联表的回填入口（创建/更新文章时同步写入）属 B2/B4 文章提交逻辑，按 B3「禁止项」不在此实现，
 * 故当前 junction 通常为空、articleCount 为 0；待文章提交增强后计数自动生效（见 B3-NOTES）。
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { articles, articleTags, type TagRow, tags } from '@/db/schema';
import { ErrCode } from '@/shared/codes';
import { isUniqueConstraintError } from '@/shared/db-error';
import { AppError } from '@/shared/errors';

/** DB 行 → 契约 Tag（含实时 articleCount）。 */
export const toTag = (t: TagRow, articleCount: number) => ({
  id: t.id,
  name: t.name,
  slug: t.slug,
  articleCount,
});

/**
 * 批量聚合各标签的有效文章数：article_tags JOIN 已发布、未删除文章，按 tagId 分组计数。
 * @returns Map<tagId, count>
 */
export const tagArticleCounts = async (): Promise<Map<number, number>> => {
  const rows = await getDb()
    .select({
      tagId: articleTags.tagId,
      count: sql<number>`count(*)`,
    })
    .from(articleTags)
    .innerJoin(
      articles,
      and(
        eq(articleTags.articleId, articles.id),
        eq(articles.status, 'published'),
        isNull(articles.deletedAt),
      ),
    )
    .groupBy(articleTags.tagId)
    .all();
  return new Map(rows.map((r) => [r.tagId, Number(r.count)]));
};

/** 标签创建/更新入参（name + slug 必填）。 */
export interface TagInput {
  name: string;
  slug: string;
}

/** GET /tags — 标签列表（公开）。 */
export const listTags = async (): Promise<TagRow[]> => {
  return getDb().select().from(tags).all();
};

/** POST /tags — 创建标签（editor/admin）；slug 占用 409(3002)。 */
export const createTag = async (input: TagInput): Promise<TagRow> => {
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
  return created;
};

/** PUT /tags/:id — 更新标签（editor/admin）；slug 冲突（指向他者）409(3002)。 */
export const updateTag = async (id: number, input: TagInput): Promise<TagRow> => {
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
  return updated;
};

/** DELETE /tags/:id — 删除标签（editor/admin）；x-cascade:none，仍有文章引用则拒删 409(3002)。 */
export const deleteTag = async (id: number): Promise<void> => {
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
};
