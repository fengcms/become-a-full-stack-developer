/**
 * src/middleware/validate.ts
 * 信任边界统一校验：在路由最外层用 Zod 校验入参，失败直接返回契约 4001 信封
 * （data.errors = [{ field, message }]），不让非法输入进入深层逻辑。
 * 封装 @hono/zod-validator 的 hook：失败时返回自定义响应，成功时放行。
 */
import { zValidator } from '@hono/zod-validator';
import type { ZodTypeAny } from 'zod';
import { ErrCode } from '@/lib/codes';
import { failResponse } from '@/lib/response';

/** 将校验失败转成契约 4001 响应（hook 复用，避免重复构造）。 */
const toValidationResponse = (error: {
  issues: { path: PropertyKey[]; message: string }[];
}): Response => {
  const errors = error.issues.map((issue) => ({
    field: issue.path.join('.') || '_',
    message: issue.message,
  }));
  return failResponse(ErrCode.VALIDATION, 400, { errors });
};

/** 校验辅助对象：json / query / param 三种目标。 */
export const v = {
  /** 校验请求体 JSON。 */
  json: (schema: ZodTypeAny) =>
    zValidator('json', schema, (result) =>
      result.success ? undefined : toValidationResponse(result.error),
    ),
  /** 校验查询参数。 */
  query: (schema: ZodTypeAny) =>
    zValidator('query', schema, (result) =>
      result.success ? undefined : toValidationResponse(result.error),
    ),
  /** 校验路径参数。 */
  param: (schema: ZodTypeAny) =>
    zValidator('param', schema, (result) =>
      result.success ? undefined : toValidationResponse(result.error),
    ),
};
