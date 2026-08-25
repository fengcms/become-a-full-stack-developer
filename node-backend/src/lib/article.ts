/**
 * src/lib/article.ts
 * 文章领域纯逻辑（与路由解耦，便于单测）：序列化、slug 校验、状态转移矩阵、列表查询。
 * 所有 DB 行 snake_case → 契约 camelCase 在此统一完成。
 */
import { and, eq, isNull, like, or, type SQL, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '@/db/client';
import { type ArticleRow, articles } from '@/db/schema';
import { ErrCode } from '@/lib/codes';
import { AppError } from '@/lib/http-error';
import { buildSortSql, meta, parsePage } from '@/lib/pagination';
import type { Pagination } from '@/lib/response';

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

/** 解析存储的 tags JSON 字符串为字符串数组（NULL → 空数组）。 */
const parseTags = (raw: string | null): string[] => (raw ? (JSON.parse(raw) as string[]) : []);

/** DB 行 → 契约 ArticleSummary（不含 content 全文）。 */
export const toArticleSummary = (a: ArticleRow) => ({
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
  // tags 为 JSON 数组字符串，按 "tag" 子串匹配（slug==name 约定；B3 改造为 article_tags 关联后更精确）
  if (q.tag) conds.push(sql`${articles.tags} LIKE ${`%"${q.tag}"%`}`);
  // category 按 slug 匹配（B2 仅透传存储 category_slug，B3 补全分类表后生效）
  if (q.category) conds.push(eq(articles.categorySlug, q.category));

  const where = and(...conds);
  const rows = await getDb()
    .select()
    .from(articles)
    .where(where)
    .orderBy(buildSortSql(q.c.req.query('sort')))
    .limit(pageSize)
    .offset(offset)
    .all();
  const totalRow = (
    await getDb().select({ count: sql<number>`count(*)` }).from(articles).where(where).all()
  )[0];
  const total = Number(totalRow?.count ?? 0);

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
