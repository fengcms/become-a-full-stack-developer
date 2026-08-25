/**
 * src/lib/codes.ts
 * 契约错误码单一事实源（对齐 docs/api/openapi.v1.yaml v1.11.0 的 ErrorCode 枚举）。
 * 所有业务错误都必须从这里取值，禁止在别处硬编码数字。
 */

/** 错误码常量。`as const` 让字面量类型被保留，可被 ErrorMessages / HttpForCode 用作键。 */
export const ErrCode = {
  OK: 0,
  USERNAME_OR_PASSWORD_ERROR: 1001,
  TOKEN_INVALID: 1002,
  REFRESH_TOKEN_INVALID: 1003,
  TOKEN_MISSING: 1004,
  ACCOUNT_DISABLED: 1005,
  FORBIDDEN: 2001,
  NOT_FOUND: 3001,
  CONFLICT: 3002,
  STATE_CONFLICT: 3003,
  VALIDATION: 4001,
  INTERNAL: 5000,
  RATE_LIMITED: 5001,
} as const;

/** 所有错误码的字面量联合类型。 */
export type ErrorCode = (typeof ErrCode)[keyof typeof ErrCode];
/** 非零业务码（即"出错了"的那一族）。 */
export type BizErrorCode = Exclude<ErrorCode, 0>;

/**
 * 业务码 → 中文文案。运行时返回给用户，取契约 example 中的描述文案。
 * 用 `[ErrCode.XXX]` 计算属性键：契约新增码而此处漏配，会在编译期立刻报错。
 */
export const ErrorMessages: Record<BizErrorCode, string> = {
  [ErrCode.USERNAME_OR_PASSWORD_ERROR]: '用户名或密码错误',
  [ErrCode.TOKEN_INVALID]: '令牌无效或已过期',
  [ErrCode.REFRESH_TOKEN_INVALID]: '刷新令牌失效，请重新登录',
  [ErrCode.TOKEN_MISSING]: '未携带访问令牌',
  [ErrCode.ACCOUNT_DISABLED]: '账号已被禁用',
  [ErrCode.FORBIDDEN]: '无权限执行该操作',
  [ErrCode.NOT_FOUND]: '资源不存在',
  [ErrCode.CONFLICT]: '资源冲突（唯一约束或引用占用）',
  [ErrCode.STATE_CONFLICT]: '当前状态不允许该操作',
  [ErrCode.VALIDATION]: '参数校验失败',
  [ErrCode.INTERNAL]: '服务内部错误',
  [ErrCode.RATE_LIMITED]: '请求过于频繁，请稍后重试',
};

/**
 * 业务码 → HTTP 状态码（双层码：HTTP 码给网关 / 浏览器，业务码给前端细分）。
 * 同样用计算属性键，确保与 ErrCode 同步。
 */
export const HttpForCode: Record<BizErrorCode, number> = {
  [ErrCode.USERNAME_OR_PASSWORD_ERROR]: 401,
  [ErrCode.TOKEN_INVALID]: 401,
  [ErrCode.REFRESH_TOKEN_INVALID]: 401,
  [ErrCode.TOKEN_MISSING]: 401,
  [ErrCode.ACCOUNT_DISABLED]: 403,
  [ErrCode.FORBIDDEN]: 403,
  [ErrCode.NOT_FOUND]: 404,
  [ErrCode.CONFLICT]: 409,
  [ErrCode.STATE_CONFLICT]: 409,
  [ErrCode.VALIDATION]: 422,
  [ErrCode.INTERNAL]: 500,
  [ErrCode.RATE_LIMITED]: 429,
};
