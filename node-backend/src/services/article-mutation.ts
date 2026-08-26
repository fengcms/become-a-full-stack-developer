/**
 * src/lib/article-mutation.ts
 * 文章写侧共享领域逻辑：作者名解析、状态/slug 解析、创建/更新文章的 DB 操作。
 * 与 lib/article.ts（读侧：序列化 / 列表查询）职责分离，避免单文件过载（≤200 行铁律）。
 *
 * 创建/更新文章时一并维护 article_tags 关联（B3.5，见 lib/article-tags），
 * 保持 junction 与文章生命周期一致。
 */
import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { type ArticleRow, articles, users } from '@/db/schema';
import type { ArticleStatus } from '@/services/article';
import { assertValidSlug } from '@/services/article';
import { syncArticleTags } from '@/services/article-tags';
import { ErrCode } from '@/shared/codes';
import { isUniqueConstraintError } from '@/shared/db-error';
import { AppError } from '@/shared/errors';

/** 文章创建入参（结构与 routes/articles-write 的 createArticleSchema 对齐）。 */
export interface ArticleCreateInput {
  title: string;
  summary?: string | null;
  content: string;
  coverImage?: string | null;
  categoryId?: number | null;
  tags?: string[];
  slug?: string | null;
  status?: ArticleStatus;
}

/** 文章更新入参（部分字段可选）。 */
export interface ArticleUpdateInput {
  title?: string;
  summary?: string | null;
  content?: string;
  coverImage?: string | null;
  categoryId?: number | null;
  tags?: string[];
  slug?: string | null;
  status?: ArticleStatus;
}

/** 取出作者展示名（仅展示用）。 */
export const authorNameOf = async (authorId: number): Promise<string | null> => {
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

/**
 * 计算新状态（含 member 权限降级 / 已发布编辑退回待审）。
 * @param input 请求传入的状态（可空，空则沿用当前态）
 * @param current 文章当前状态
 * @param privileged 是否 editor/admin（有权直接发布）
 */
export const resolveNewStatus = (
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

/** 判定 slug 是否被占用（排除 exceptId，用于更新时自比较）；占用 → true。 */
export const isSlugTaken = async (slug: string, exceptId?: number): Promise<boolean> => {
  const dup = (
    await getDb()
      .select({ id: articles.id })
      .from(articles)
      .where(and(eq(articles.slug, slug), isNull(articles.deletedAt)))
      .limit(1)
      .all()
  )[0];
  return dup ? dup.id !== exceptId : false;
};

/** 校验 slug 合法且未被占用（排除 exceptId）；空 slug 视为「不设 slug」直接放行。 */
export const assertSlugAvailable = async (
  slug: string | null,
  exceptId?: number,
): Promise<void> => {
  if (!slug) return;
  assertValidSlug(slug);
  if (await isSlugTaken(slug, exceptId)) throw new AppError(ErrCode.CONFLICT, 409); // 3002 slug 占用
};

/** 创建文章并同步标签关联（仅链接已存在 Tag）。 */
export const createArticleRow = async (
  input: ArticleCreateInput,
  authorId: number,
  privileged: boolean,
): Promise<ArticleRow> => {
  const db = getDb();
  const status = resolveNewStatus(input.status, 'draft', privileged);
  let slug: string | null = input.slug ?? null;
  if (!privileged) slug = null; // member 忽略 slug
  await assertSlugAvailable(slug);

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
  if (input.tags?.length) await syncArticleTags(created.id, input.tags); // B3.5：同步标签关联
  return created;
};

/** 更新文章并同步标签关联（标签省略则沿用既有；提供则覆盖式同步）。 */
export const updateArticleRow = async (
  id: number,
  input: ArticleUpdateInput,
  existing: ArticleRow,
  privileged: boolean,
): Promise<ArticleRow> => {
  const db = getDb();
  const status = resolveNewStatus(input.status, existing.status as ArticleStatus, privileged);
  let slug = existing.slug;
  if (privileged && input.slug !== undefined) {
    slug = input.slug ?? null;
    await assertSlugAvailable(slug, id);
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
  if (input.tags !== undefined) await syncArticleTags(existing.id, input.tags); // B3.5：同步标签关联

  const rows = await db.select().from(articles).where(eq(articles.id, id)).limit(1).all();
  const updated = rows[0];
  if (!updated) throw new AppError(ErrCode.INTERNAL, 500);
  return updated;
};
