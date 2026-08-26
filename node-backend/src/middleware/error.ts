/**
 * src/middleware/error.ts
 * 顶层错误处理。AppError → 业务信封；其余未捕获异常 → 5000 内部错误（并落日志）。
 * 挂载在 Hono 的 onError，是"统一包络"的最后一道闸门。
 */
import type { ErrorHandler } from 'hono';
import { ErrCode } from '@/shared/codes';
import { AppError } from '@/shared/errors';
import { failResponse } from '@/shared/response';

export const errorHandler: ErrorHandler = (err, _c) => {
  if (err instanceof AppError) {
    return failResponse(err.code, err.httpStatus, err.details);
  }
  // 兜底：未知异常不应向客户端泄露堆栈
  console.error('[unhandled]', err);
  return failResponse(ErrCode.INTERNAL, 500);
};
