/**
 * src/lib/pagination.ts
 * 分页与排序解析（对齐契约 components/parameters 的 Page / PageSize / Sort）。
 * Sort 采用「带符号字段名」约定：`-publishedAt` 倒序、`publishedAt` 正序；
 * publishedAt 为 NULL 时以 created_at 参与比较（COALESCE），末位追加 `id DESC` 稳定键避免分页重漏。
 */
import { type SQL, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { Pagination } from '@/lib/response';

/** 允许排序的字段 → 实际列表达式（白名单，杜绝注入）。
 * 统一以 articles. 限定基表列：queryArticles 恒以 articles 为基表，
 * 标签 JOIN（B3.5 article_tags）后 created_at / id 等会歧义，限定基表可根除。 */
const SORT_COLUMNS: Record<string, string> = {
  publishedAt: 'COALESCE(articles.published_at, articles.created_at)',
  viewCount: 'articles.view_count',
  createdAt: 'articles.created_at',
};

/** 解析页码与页大小（带边界钳制，page≥1、pageSize∈[1,100]）。 */
export const parsePage = (c: Context): { page: number; pageSize: number; offset: number } => {
  const page = Math.max(1, Number(c.req.query('page') ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize') ?? 20) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
};

/** 解析排序为 SQL 片段（白名单字段 + 方向，末位追加 id DESC 稳定键）。 */
export const buildSortSql = (sort?: string): SQL => {
  // 先剥离可选的 '-' 前缀得到裸字段名，再查白名单；未知字段回退默认 -publishedAt
  const bare = sort?.startsWith('-') ? sort.slice(1) : sort;
  const raw = bare && bare in SORT_COLUMNS ? (sort ?? '-publishedAt') : '-publishedAt';
  const desc = raw.startsWith('-');
  const field = desc ? raw.slice(1) : raw;
  const column = SORT_COLUMNS[field] ?? 'COALESCE(articles.published_at, articles.created_at)';
  const dir = desc ? 'DESC' : 'ASC';
  return sql`${sql.raw(column)} ${sql.raw(dir)}, articles.id DESC`;
};

/** 构造分页元数据（契约 Pagination 四件套）。 */
export const meta = (page: number, pageSize: number, total: number): Pagination => ({
  page,
  pageSize,
  total,
  totalPages: Math.max(1, Math.ceil(total / pageSize)),
});
