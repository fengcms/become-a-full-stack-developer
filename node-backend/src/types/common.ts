/**
 * src/types/common.ts
 * 跨多个模块共享的纯类型（types 层为依赖图最底层，仅作类型别名 / 接口，不引入运行时依赖）。
 * 含：契约错误码联合类型（ErrorCode / BizErrorCode）、分页元数据（Pagination）、标准响应信封（Envelope）。
 *
 * 注：ErrorCode / BizErrorCode 由 shared/codes 的 ErrCode 运行时常量派生，此处仅以 `import type` 取其类型，
 * 编译期擦除，不产生 types → shared 的运行时环。
 */
import type { ErrCode } from '@/shared/codes';

/** 所有错误码的字面量联合类型（由 shared/codes 的 ErrCode 常量派生）。 */
export type ErrorCode = (typeof ErrCode)[keyof typeof ErrCode];
/** 非零业务码（即"出错了"的那一族）。 */
export type BizErrorCode = Exclude<ErrorCode, 0>;

/** 分页元数据。契约要求 page / pageSize / total / totalPages 四件套。 */
export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** 标准信封形状。 */
export interface Envelope<T> {
  code: number;
  message: string;
  data: T | null;
  requestId: string;
  timestamp: string;
}
