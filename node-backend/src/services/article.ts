/**
 * src/lib/article.ts
 * 文章领域纯逻辑（与路由解耦，便于单测）：序列化、slug 校验、状态转移矩阵、列表查询。
 * 所有 DB 行 snake_case → 契约 camelCase 在此统一完成。
 *
 * 注：本文件约 252 行，略超 200 行软上限——它集中承载「序列化 + slug 黑名单 + 状态机
 * + 统一列表查询」四类紧密相关的领域逻辑，拆分反而会割裂这些单一职责的协作（如状态机被
 * 序列化与更新共用）。按项目纪律「特殊情况需注释说明」显式标注；routes 层仍严守 ≤200。
 */
import { and, eq, isNull, like, or, type SQL, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '@/db/client';
import { type ArticleRow, articles, articleTags, articleViewDedup, tags } from '@/db/schema';
import { ErrCode } from '@/shared/codes';
import { isUniqueConstraintError } from '@/shared/db-error';
import { AppError } from '@/shared/errors';
import { buildSortSql, meta, parsePage } from '@/shared/pagination';
import type { Pagination } from '@/types/common';

/** 文章三态（与契约 Article.status 枚举一致）。 */
export type ArticleStatus = 'draft' | 'pending' | 'published';

/** slug 合法模式（契约 Article.slug.pattern）。 */
const SLUG_PATTERN = /^[a-z0-9-]{1,64}$/;

/** 预留子路径黑名单：slug 命中这些会污染 REST 路由，必须拒绝（契约 createArticle 400）。 */
export const RESERVED_SLUGS = new Set<string>([
  'me',
  'admin',
  'categories',
  'tags',
  'comments',
  'view',
  'submit',
  'adjacent',
  'related',
  'toc',
  'like',
  'unlike',
  'history',
  'favorites',
  'notifications',
  'search',
  'site',
  'upload',
  'users',
  'members',
  'tree',
]);

/** 校验 slug 合法性与黑名单，非法抛 4001（VALIDATION）。 */
export const assertValidSlug = (slug: string): void => {
  if (!SLUG_PATTERN.test(slug) || RESERVED_SLUGS.has(slug)) {
    throw new AppError(ErrCode.VALIDATION, 400, `slug 非法或处于预留路径黑名单：${slug}`);
  }
};

/**
 * 状态转移矩阵（契约 N9-2，Article.status.x-allowed-transitions 六条）。
 * 返回某次转移是否合法；同态转移（from===to）视为合法（幂等）。
 */
export const canTransition = (from: ArticleStatus, to: ArticleStatus): boolean => {
  if (from === to) return true;
  const allowed: ReadonlyArray<[ArticleStatus, ArticleStatus]> = [
    ['draft', 'pending'],
    ['draft', 'published'],
    ['pending', 'published'],
    ['pending', 'draft'],
    ['published', 'draft'],
    ['published', 'pending'],
  ];
  return allowed.some(([f, t]) => f === from && t === to);
};

/** 解析存储的 tags JSON 字符串为字符串数组（NULL / 非法 → 空数组）。 */
export const parseTags = (raw: string | null): string[] => {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? (arr.filter((t) => typeof t === 'string') as string[]) : [];
  } catch {
    return [];
  }
};

/** 列表/摘要所需列的子集（投影：不取 content 等长文本，对应 BE11「投影」护栏）。 */
export type ArticleSummaryRow = Pick<
  ArticleRow,
  | 'id'
  | 'title'
  | 'slug'
  | 'summary'
  | 'coverImage'
  | 'authorId'
  | 'authorName'
  | 'categoryId'
  | 'categoryName'
  | 'tags'
  | 'status'
  | 'viewCount'
  | 'likeCount'
  | 'publishedAt'
  | 'createdAt'
  | 'updatedAt'
>;

/** DB 行 → 契约 ArticleSummary（不含 content 全文）。 */
export const toArticleSummary = (a: ArticleSummaryRow) => ({
  id: a.id,
  title: a.title,
  slug: a.slug ?? null,
  summary: a.summary ?? null,
  coverImage: a.coverImage ?? null,
  authorId: a.authorId,
  authorName: a.authorName ?? null,
  categoryId: a.categoryId ?? null,
  categoryName: a.categoryName ?? null,
  tags: parseTags(a.tags),
  status: a.status as ArticleStatus,
  viewCount: a.viewCount,
  likeCount: a.likeCount,
  publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null,
  createdAt: a.createdAt.toISOString(),
  updatedAt: a.updatedAt.toISOString(),
});

/** DB 行 → 契约 Article（含 content 全文，仅详情/管理接口返回）。 */
export const toArticle = (a: ArticleRow) => ({
  ...toArticleSummary(a),
  content: a.content,
});

/** 文章列表查询入参。 */
export interface ArticleQuery {
  /** 强制状态（公开列表置 'published'，忽略调用方传入的 status）。 */
  forcedStatus?: ArticleStatus;
  /** 显式状态筛选（后台 / 我的文章）。 */
  status?: ArticleStatus;
  /** 按作者筛选（我的文章）。 */
  authorId?: number;
  keyword?: string;
  tag?: string;
  category?: string;
  c: Context;
}

/** 列表查询结果（摘要数组 + 分页元数据）。 */
export interface ArticlePage {
  list: ReturnType<typeof toArticleSummary>[];
  pagination: Pagination;
}

/** 模糊搜索计数扫描量上限（DB-01，见 BE11）：超出仅显示封顶值，防全表 LIKE 扫描。 */
const SCAN_LIMIT = 2000;

/**
 * 统一列表查询：组合过滤条件 + 分页 + 排序，返回摘要数组与分页元数据。
 * 过滤：deleted_at IS NULL 基础条件；公开/后台/我的文章通过 forcedStatus / status / authorId 区分。
 * @param q 查询入参（含 Hono 上下文以读取分页/排序参数）
 */
export const queryArticles = async (q: ArticleQuery): Promise<ArticlePage> => {
  const { page, pageSize, offset } = parsePage(q.c);
  const conds: SQL[] = [isNull(articles.deletedAt)];
  if (q.forcedStatus) conds.push(eq(articles.status, q.forcedStatus));
  if (q.status) conds.push(eq(articles.status, q.status));
  if (q.authorId !== undefined) conds.push(eq(articles.authorId, q.authorId));
  if (q.keyword) {
    const kw = or(like(articles.title, `%${q.keyword}%`), like(articles.summary, `%${q.keyword}%`));
    if (kw) conds.push(kw); // or() 在全部参数为 undefined 时返回 undefined，此处恒有值但需收窄类型
  }
  // 标签过滤：从 articles.tags 子串 LIKE 改为 article_tags 关联精确匹配（B3.5，关闭 B2 P3 子串误匹配）。
  // q.tag 约定为 catalog 标签的 slug 或 name；解析不到对应 catalog 标签 → 直接返回空列表
  // （精确语义：未收录的标签不再「碰巧」子串命中，且避免了 `js` 误匹配 `json` 这类问题）。
  if (q.tag) {
    const tagRow = (
      await getDb()
        .select({ id: tags.id })
        .from(tags)
        .where(or(eq(tags.slug, q.tag), eq(tags.name, q.tag)))
        .limit(1)
        .all()
    )[0];
    if (!tagRow) return { list: [], pagination: meta(page, pageSize, 0) };
    conds.push(eq(articleTags.tagId, tagRow.id));
  }
  // category 按 slug 匹配（B2 仅透传存储 category_slug，B3 补全分类表后生效）
  if (q.category) conds.push(eq(articles.categorySlug, q.category));

  const where = and(...conds);
  // 投影：列表仅取摘要所需列，不拉 content 长文本（BE11 投影护栏）
  const rowsQuery = getDb()
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
    .from(articles);
  if (q.tag) rowsQuery.innerJoin(articleTags, eq(articleTags.articleId, articles.id));
  const rows = await rowsQuery
    .where(where)
    .orderBy(buildSortSql(q.c.req.query('sort')))
    .limit(pageSize)
    .offset(offset)
    .all();

  // 计数：keyword 触发 LIKE 模糊扫描时套 DB-01 护栏，扫描量封顶 SCAN_LIMIT，
  // 命中超量总数显示封顶值（搜索可用性 vs 性能取舍，见 BE11）。
  let total: number;
  if (q.keyword) {
    const scannedQuery = getDb().select({ id: articles.id }).from(articles);
    if (q.tag) scannedQuery.innerJoin(articleTags, eq(articleTags.articleId, articles.id));
    const scanned = await scannedQuery.where(where).limit(SCAN_LIMIT).all();
    total = scanned.length;
  } else {
    const totalQuery = getDb().select({ count: sql<number>`count(*)` }).from(articles);
    if (q.tag) totalQuery.innerJoin(articleTags, eq(articleTags.articleId, articles.id));
    const totalRow = (await totalQuery.where(where).all())[0];
    total = Number(totalRow?.count ?? 0);
  }

  return { list: rows.map(toArticleSummary), pagination: meta(page, pageSize, total) };
};

/**
 * 解析文章资源归属（供 guard 的 ownerOverride 使用）。
 * 文章不存在或不命中 → 抛 404（NOT_FOUND），让「不存在」与「无权限」区分明确。
 * @param c Hono 上下文
 */
export const resolveArticleOwner = async (c: Context): Promise<string | null> => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return null;
  const row = (
    await getDb()
      .select({ authorId: articles.authorId })
      .from(articles)
      .where(and(eq(articles.id, id), isNull(articles.deletedAt)))
      .limit(1)
      .all()
  )[0];
  if (!row) throw new AppError(ErrCode.NOT_FOUND, 404);
  return String(row.authorId);
};

/** FNV-1a 哈希（匿名去重键用，同步、零依赖；碰撞仅降低去重精度，不影响正确性）。 */
export const fnv1a = (str: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
};

const VIEW_DEDUP_MS = 24 * 60 * 60 * 1000;

/** GET /:idOrSlug 详情：id 或 slug 解析；匿名仅 published；owner/admin 可见任意态。 */
export const getArticleByKey = async (
  key: string,
  user: { id: string; role: string } | null,
): Promise<ReturnType<typeof toArticle>> => {
  const where = /^\d+$/.test(key)
    ? and(eq(articles.id, Number(key)), isNull(articles.deletedAt))
    : and(eq(articles.slug, key), isNull(articles.deletedAt));
  const row = (await getDb().select().from(articles).where(where).limit(1).all())[0];
  if (!row) throw new AppError(ErrCode.NOT_FOUND, 404);
  const owner = user && String(row.authorId) === user.id;
  const visible = row.status === 'published' || owner || user?.role === 'admin';
  if (!visible) throw new AppError(ErrCode.NOT_FOUND, 404); // 未发布对非授权者隐瞒
  return toArticle(row);
};

/** POST /:id/view 阅读量 +1（去重 24h 冷却）；仅 published 可计数，否则 404。 */
export const incrementViewCount = async (
  id: number,
  userId: number | null,
  ip: string,
  ua: string,
): Promise<{ viewCount: number }> => {
  const db = getDb();
  const existing = (
    await db
      .select()
      .from(articles)
      .where(and(eq(articles.id, id), isNull(articles.deletedAt)))
      .limit(1)
      .all()
  )[0];
  if (existing?.status !== 'published') throw new AppError(ErrCode.NOT_FOUND, 404);
  // 去重采用「24h 时间桶」：dedupKey = baseKey#bucket，bucket = floor(now/WINDOW)。
  // 冷却过后桶号自然变化 → 不再撞旧记录，根除「永久唯一约束 vs 24h 冷却」的 500；
  // 同窗口并发插入撞唯一约束 → isUniqueConstraintError 兜底，跳过增量、返回 200，不重复计数。
  const baseKey = userId != null ? `u:${userId}` : `a:${fnv1a(`${ip}|${ua}`)}`;
  const bucket = Math.floor(Date.now() / VIEW_DEDUP_MS); // 每 24h 一个桶
  const dedupKey = `${baseKey}#${bucket}`;
  const recent = await db
    .select({ id: articleViewDedup.id })
    .from(articleViewDedup)
    .where(and(eq(articleViewDedup.articleId, id), eq(articleViewDedup.dedupKey, dedupKey)))
    .limit(1)
    .all();
  if (recent.length === 0) {
    try {
      await db
        .insert(articleViewDedup)
        .values({ articleId: id, dedupKey, createdAt: new Date() })
        .run();
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        // 同窗口并发重复插入：视作已计数，跳过增量（不重复计数、不抛 500）
        const cur = (
          await db
            .select({ viewCount: articles.viewCount })
            .from(articles)
            .where(eq(articles.id, id))
            .limit(1)
            .all()
        )[0];
        return { viewCount: cur?.viewCount ?? existing.viewCount };
      }
      throw err;
    }
    await db
      .update(articles)
      .set({ viewCount: sql`${articles.viewCount} + 1` })
      .where(eq(articles.id, id))
      .run();
  }
  const rows = await db
    .select({ viewCount: articles.viewCount })
    .from(articles)
    .where(eq(articles.id, id))
    .limit(1)
    .all();
  const updated = rows[0];
  if (!updated) throw new AppError(ErrCode.INTERNAL, 500);
  return { viewCount: updated.viewCount };
};

/** PUT /:id 前取现存文章行（软删过滤），不存在 → 404。 */
export const getArticleOr404 = async (id: number): Promise<ArticleRow> => {
  const row = (
    await getDb()
      .select()
      .from(articles)
      .where(and(eq(articles.id, id), isNull(articles.deletedAt)))
      .limit(1)
      .all()
  )[0];
  if (!row) throw new AppError(ErrCode.NOT_FOUND, 404);
  return row;
};

/** DELETE /:id 软删：置 deleted_at，清理 article_tags 关联。 */
export const softDeleteArticle = async (id: number): Promise<void> => {
  const db = getDb();
  await db.delete(articleTags).where(eq(articleTags.articleId, id)).run();
  await db
    .update(articles)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(articles.id, id))
    .run();
};

/** POST /:id/submit draft→pending（仅作者/owner 或 admin）。 */
export const submitArticle = async (id: number): Promise<ReturnType<typeof toArticle>> => {
  const db = getDb();
  const existing = (
    await db
      .select()
      .from(articles)
      .where(and(eq(articles.id, id), isNull(articles.deletedAt)))
      .limit(1)
      .all()
  )[0];
  if (!existing) throw new AppError(ErrCode.NOT_FOUND, 404);
  if (existing.status !== 'draft') throw new AppError(ErrCode.STATE_CONFLICT, 409); // 3003 非法前态
  const now = new Date();
  await db
    .update(articles)
    .set({ status: 'pending', updatedAt: now })
    .where(eq(articles.id, id))
    .run();
  const updated = (await db.select().from(articles).where(eq(articles.id, id)).limit(1).all())[0];
  if (!updated) throw new AppError(ErrCode.INTERNAL, 500);
  return toArticle(updated);
};

/** POST /:id/approve pending→published（editor/admin），非 pending 前态→3003。 */
export const approveArticle = async (id: number): Promise<ReturnType<typeof toArticle>> => {
  const db = getDb();
  const existing = (
    await db
      .select()
      .from(articles)
      .where(and(eq(articles.id, id), isNull(articles.deletedAt)))
      .limit(1)
      .all()
  )[0];
  if (!existing) throw new AppError(ErrCode.NOT_FOUND, 404);
  if (existing.status !== 'pending') throw new AppError(ErrCode.STATE_CONFLICT, 409); // 3003
  const now = new Date();
  await db
    .update(articles)
    .set({ status: 'published', publishedAt: existing.publishedAt ?? now, updatedAt: now })
    .where(eq(articles.id, id))
    .run();
  const updated = (await db.select().from(articles).where(eq(articles.id, id)).limit(1).all())[0];
  if (!updated) throw new AppError(ErrCode.INTERNAL, 500);
  return toArticle(updated);
};

/** POST /:id/status admin 任意置位（不受矩阵限制），同态幂等 200。 */
export const setArticleStatus = async (
  id: number,
  status: ArticleStatus,
): Promise<ReturnType<typeof toArticle>> => {
  const db = getDb();
  const existing = (
    await db
      .select()
      .from(articles)
      .where(and(eq(articles.id, id), isNull(articles.deletedAt)))
      .limit(1)
      .all()
  )[0];
  if (!existing) throw new AppError(ErrCode.NOT_FOUND, 404);
  if (status === existing.status) return toArticle(existing); // 幂等
  const now = new Date();
  const publishedAt = status === 'published' ? (existing.publishedAt ?? now) : null;
  await db
    .update(articles)
    .set({ status, publishedAt, updatedAt: now })
    .where(eq(articles.id, id))
    .run();
  const updated = (await db.select().from(articles).where(eq(articles.id, id)).limit(1).all())[0];
  if (!updated) throw new AppError(ErrCode.INTERNAL, 500);
  return toArticle(updated);
};
