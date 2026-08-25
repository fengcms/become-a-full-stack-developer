/**
 * src/lib/http-error.ts
 * 应用统一错误类型。任何业务失败都抛 `AppError`，由顶层 error 中间件转成契约信封。
 */
import { type BizErrorCode, ErrorMessages, HttpForCode } from './codes';

/** 应用层错误：携带业务码、HTTP 状态码与可选的明细负载（如 4001 的 errors）。 */
export class AppError extends Error {
  public readonly code: BizErrorCode;
  public readonly httpStatus: number;
  public readonly details?: unknown;

  /**
   * @param code 业务错误码（取 ErrCode）
   * @param httpStatus 可选，覆盖默认的 HTTP 状态码（默认按 HttpForCode 推算）
   * @param message 可选，覆盖默认文案
   * @param details 可选，错误明细（如字段级校验错误列表）
   */
  constructor(code: BizErrorCode, httpStatus?: number, message?: string, details?: unknown) {
    super(message ?? ErrorMessages[code]);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus ?? HttpForCode[code];
    this.details = details;
  }
}

/**
 * 抛出应用错误，返回 `never` 使其可在表达式位置使用（如 `return fail(NOT_FOUND)`）。
 * @param code 业务错误码
 * @param details 错误明细
 * @param httpStatus 可选，覆盖 HTTP 状态码
 */
export const fail = (code: BizErrorCode, details?: unknown, httpStatus?: number): never => {
  throw new AppError(code, httpStatus, undefined, details);
};
