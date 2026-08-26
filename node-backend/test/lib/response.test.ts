/**
 * test/lib/response.test.ts
 * 信封构造器单测（审阅 B07）：验证 ok / failResponse / paginate 的产物符合契约 ApiResponse 形状。
 */
import { describe, expect, it } from 'vitest';
import { type BizErrorCode, ErrCode } from '@/shared/codes';
import { failResponse, ok, paginate } from '@/shared/response';

/** 信封基础字段断言。 */
const assertEnvelopeShape = (body: Record<string, unknown>): void => {
  expect(typeof body.code).toBe('number');
  expect(typeof body.message).toBe('string');
  expect(typeof body.requestId).toBe('string');
  expect(typeof body.timestamp).toBe('string');
  expect('data' in body).toBe(true);
};

describe('响应信封构造器', () => {
  it('ok() 返回 200 + 标准信封', async () => {
    const res = ok({ status: 'ok' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    assertEnvelopeShape(body);
    expect(body.code).toBe(0);
    expect(body.message).toBe('ok');
  });

  it('failResponse() 返回业务码 + 对应 HTTP 状态 + data 明细', async () => {
    const res = failResponse(ErrCode.VALIDATION as BizErrorCode, 400, {
      errors: [{ field: 'email', message: 'x' }],
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    assertEnvelopeShape(body);
    expect(body.code).toBe(4001);
    expect(body.data).toMatchObject({ errors: [{ field: 'email', message: 'x' }] });
  });

  it('paginate() 的 data 内含 list + pagination', async () => {
    const res = paginate([{ id: 1 }], { page: 1, pageSize: 10, total: 1, totalPages: 1 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { list: unknown[]; pagination: unknown } };
    expect(Array.isArray(body.data.list)).toBe(true);
    expect(body.data.pagination).toMatchObject({ page: 1, total: 1 });
  });
});
