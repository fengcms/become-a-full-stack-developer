/**
 * test/shared/storage.r2.test.ts
 * R2 驱动（策略 A）验证：STORAGE_DRIVER=r2 走 R2Storage；
 * 内容寻址去重（同字节只 PUT 一次）、get 命中/缺失、delete、url 为 /files/{key}。
 * 用内存 fake R2Bucket 模拟，不依赖真实 CF 绑定（与 client.ts 的 D1 处理一致，规避 workers-types）。
 */

import { describe, expect, it, vi } from 'vitest';
import { readEnv } from '@/config/env';
import { createStorage } from '@/shared/storage';

/** 最小 R2 bucket 模拟（与 storage.ts 的 R2BucketLike 对齐）。 */
const makeBucket = () => {
  const store = new Map<string, Buffer>();
  const put = vi.fn(async (key: string, value: Buffer) => {
    store.set(key, Buffer.from(value));
    return {};
  });
  const bucket = {
    put,
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
  return { bucket, put };
};

const r2Env = (bucket: unknown) =>
  readEnv({ JWT_SECRET: 't', STORAGE_DRIVER: 'r2', R2_BUCKET: bucket } as unknown as Record<
    string,
    string
  >);

describe('R2 storage (STORAGE_DRIVER=r2)', () => {
  it('put returns /files/{key} and content-addressing dedupes PUT', async () => {
    const { bucket, put } = makeBucket();
    const storage = createStorage(r2Env(bucket));

    const buf = Buffer.from('r2-dedup-bytes');
    const before = put.mock.calls.length;
    const r1 = await storage.put(buf, '.png');
    const r2 = await storage.put(buf, '.png');

    expect(r1.key).toBe(r2.key);
    expect(r1.url).toBe(`/files/${r1.key}`);
    expect(put.mock.calls.length - before).toBe(1); // 二次命中复用，不 PUT
  });

  it('get returns bytes on hit, null on miss', async () => {
    const { bucket } = makeBucket();
    const storage = createStorage(r2Env(bucket));

    const r = await storage.put(Buffer.from('abc'), '.png');
    const got = await storage.get(r.key);
    expect(got).not.toBeNull();
    expect(got?.toString()).toBe('abc');

    expect(await storage.get('missing.png')).toBeNull();
  });

  it('delete removes object', async () => {
    const { bucket } = makeBucket();
    const storage = createStorage(r2Env(bucket));

    const r = await storage.put(Buffer.from('todelete'), '.png');
    expect(await storage.get(r.key)).not.toBeNull();
    await storage.delete(r.key);
    expect(await storage.get(r.key)).toBeNull();
  });

  it('different bytes -> different key', async () => {
    const { bucket } = makeBucket();
    const storage = createStorage(r2Env(bucket));

    const a = await storage.put(Buffer.from('aaaa'), '.png');
    const b = await storage.put(Buffer.from('bbbb'), '.png');
    expect(a.key).not.toBe(b.key);
  });
});
