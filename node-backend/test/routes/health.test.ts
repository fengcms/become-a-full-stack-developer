/**
 * test/routes/health.test.ts
 * B0 验收门禁：health 信封、未授权 401、CORS 预检头。
 */
import { describe, expect, it } from 'vitest';
import { app } from '../../src/app';

/** health 响应的信封类型（无 data 内容约束，只验信封形状）。 */
interface Envelope {
  code: number;
  message: string;
  data: { status: string } | null;
  requestId: string;
  timestamp: string;
}

describe('B0 工程基座', () => {
  it('GET /api/v1/health 返回 200 + 标准信封', async () => {
    const res = await app.request('/api/v1/health');
    expect(res.status).toBe(200);

    const body = (await res.json()) as Envelope;
    expect(body.code).toBe(0);
    expect(body.message).toBe('ok');
    expect(body.data?.status).toBe('ok');
    expect(typeof body.requestId).toBe('string');
    expect(typeof body.timestamp).toBe('string');
  });

  it('未带令牌访问受保护路由 → 401 + code 1004', async () => {
    const res = await app.request('/api/v1/protected-ping');
    expect(res.status).toBe(401);

    const body = (await res.json()) as { code: number };
    expect(body.code).toBe(1004);
  });

  it('OPTIONS 预检返回 CORS 头（dev 放开 *）', async () => {
    const res = await app.request('/api/v1/health', {
      method: 'OPTIONS',
      headers: { Origin: 'http://example.com', 'Access-Control-Request-Method': 'GET' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
});
