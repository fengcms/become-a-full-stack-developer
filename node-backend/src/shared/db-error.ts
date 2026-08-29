/**
 * src/shared/db-error.ts
 * 数据库错误识别工具。
 *
 * 把底层驱动（better-sqlite3 / libsql）抛出的原生错误映射为领域语义，
 * 让业务层据以确定返回何种业务码，而不必在路由里散落 `any` 或字符串嗅探。
 * B1 注册并发唯一冲突、B2 文章 slug 唯一冲突等场景统一复用此判定。
 */

/** 唯一约束冲突时底层驱动抛出的错误码集合。 */
const UNIQUE_CONSTRAINT_CODES = ['SQLITE_CONSTRAINT_UNIQUE', 'SQLITE_CONSTRAINT'] as const;

/** 判断给定错误是否由唯一约束冲突引起（并发插入 / 重复键）。 */
export const isUniqueConstraintError = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' && (UNIQUE_CONSTRAINT_CODES as readonly string[]).includes(code);
};
