/**
 * test/routes/health.test.ts
 * B0 验收门禁：health 信封、未授权 401、CORS 预检白名单头。
 */
import { describe, expect, it } from 'vitest';
import { createApp } from '@/app';
import { readEnv } from '@/config/env';

// 测试以非 development 环境运行（setup 已置 NODE_ENV=test），
// 故 CORS 走白名单分支：显式给出具体源，凭据请求才合法（审阅 B05）。
process.env.CORS_ORIGINS = 'http://example.com';

const app = createApp(readEnv(process.env as Record<string, string | undefined>));

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
    const res = await app.request('/api/v1/auth/me');
    expect(res.status).toBe(401);

    const body = (await res.json()) as { code: number };
    expect(body.code).toBe(1004);
  });

  it('OPTIONS 预检返回白名单 CORS 头（带凭据）', async () => {
    const res = await app.request('/api/v1/health', {
      method: 'OPTIONS',
      headers: { Origin: 'http://example.com', 'Access-Control-Request-Method': 'GET' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('http://example.com');
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
  });
});
