/**
 * test/routes/files.r2.test.ts
 * 附件 URL 策略 A 端到端验证：STORAGE_DRIVER=r2 时，GET /files/:key 经后端从 R2 读取直出，
 * 与 local 行为一致（前端拿到的 url 始终是 /files/{key}，本地/生产无感知差异）。
 */
process.env.JWT_SECRET ??= 'test-secret';

import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '@/app';
import { readEnv, setActiveEnv } from '@/config/env';
import { createLocalDb, setDb } from '@/db/client';
import { migrate } from '@/db/migrate';
import { createStorage } from '@/shared/storage';

const store = new Map<string, Buffer>();
const fakeBucket = {
  async put(key: string, value: Buffer) {
    store.set(key, Buffer.from(value));
    return {};
  },
  async get(key: string) {
    const v = store.get(key);
    if (!v) return null;
    return {
      arrayBuffer: async () =>
        v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) as ArrayBuffer,
    };
  },
  async delete(key: string) {
    store.delete(key);
  },
};

const env = readEnv({
  JWT_SECRET: 'test-secret',
  STORAGE_DRIVER: 'r2',
  R2_BUCKET: fakeBucket,
} as unknown as Record<string, string>);
setActiveEnv(env);
const db = createLocalDb(':memory:');
migrate(db);
setDb(db);
const app = createApp(env);

beforeEach(() => {
  store.clear();
});

describe('GET /files/:key under r2 driver (策略 A)', () => {
  it('serves R2-stored object via backend route', async () => {
    const storage = createStorage(env);
    const { key } = await storage.put(Buffer.from('r2-bytes-123'), '.png');
    const res = await app.request(`/files/${key}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('r2-bytes-123');
    expect(res.headers.get('content-type')).toContain('image/png');
  });

  it('missing key -> 404', async () => {
    const res = await app.request('/files/nope.png');
    expect(res.status).toBe(404);
  });

  it('unsafe key -> 404 (path traversal guard)', async () => {
    const res = await app.request('/files/..%2f..%2fetc%2fpasswd');
    expect(res.status).toBe(404);
  });
});
