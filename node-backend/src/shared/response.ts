/**
 * src/shared/response.ts
 * 统一响应信封构造器（对齐契约 components.schemas.ApiResponse）。
 * 返回原生 Response，与 Hono 解耦，便于单测与跨运行时复用。
 */
import { ErrorMessages } from '@/shared/codes';
import type { BizErrorCode, Envelope, Pagination } from '@/types/common';

/** 生成请求 ID（优先 Web Crypto 的 UUID，降级用时间戳）。 */
const requestId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `req_${Date.now().toString(36)}`;

/** 组装信封。requestId / timestamp 每次响应即时生成。 */
const envelope = <T>(code: number, message: string, data: T | null): Envelope<T> => ({
  code,
  message,
  data,
  requestId: requestId(),
  timestamp: new Date().toISOString(),
});

/** 成功：单对象 / 无数据。HTTP 200。 */
export const ok = <T>(data: T, message = 'ok'): Response =>
  Response.json(envelope(0, message, data), { status: 200 });

/** 成功：资源已创建。HTTP 201（B1 注册 / 新建用）。 */
export const created = <T>(data: T, message = 'created'): Response =>
  Response.json(envelope(0, message, data), { status: 201 });

/** 成功：分页列表，data 内含 list + pagination。 */
export const paginate = <T>(list: T[], pagination: Pagination, message = 'ok'): Response =>
  Response.json(
    envelope(0, message, { list, pagination } satisfies { list: T[]; pagination: Pagination }),
    { status: 200 },
  );

/** 失败：业务错误包络。HTTP 状态码由调用方依据 HttpForCode 给定。 */
export const failResponse = (code: BizErrorCode, httpStatus: number, details?: unknown): Response =>
  Response.json(envelope(code, ErrorMessages[code], details ?? null), { status: httpStatus });
