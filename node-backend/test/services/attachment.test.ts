/**
 * test/services/attachment.test.ts
 * 上传去重（A+）验证：
 * - 存储层内容寻址：同字节 → 同 key，重复上传不重复写盘
 * - 服务层全局去重：不同用户相同字节 → 不同 Attachment id、相同 url（即相同 storageKey）
 * - 删除护栏：多行共享物理文件时，删其一不误删文件；删最后一引才真删
 * 物理文件落在 ./uploads（gitignored），afterEach 兜底清理。
 */

import * as fsPromises from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getActiveEnv } from '@/config/env';
import { getDb } from '@/db/client';
import { attachments, users } from '@/db/schema';
import {
  type CreateAttachmentInput,
  createAttachment,
  deleteAttachment,
} from '@/services/attachment';
import { ErrCode } from '@/shared/codes';
import { createStorage } from '@/shared/storage';

// better-sqlite3 走同步事务；storage.put 复用前一次落盘，需统计 writeFile 调用次数。
// ESM 命名空间不可 spy，故用 vi.mock 把 writeFile 包一层间谍（其余 fs api 透传真实实现）。
vi.mock('node:fs/promises', async (importOriginal) => {
  const mod = await importOriginal<typeof import('node:fs/promises')>();
  return { ...mod, writeFile: vi.fn(mod.writeFile) };
});

const writeFileMock = fsPromises.writeFile as unknown as { mock: { calls: unknown[] } };

const createdKeys: string[] = [];
const keyOf = (url: string): string => url.split('/').pop() ?? '';

const sample: CreateAttachmentInput = {
  userId: 1,
  articleId: null,
  buffer: Buffer.from('dedup-test-bytes-2026'),
  ext: '.png',
  mime: 'image/png',
};

/** 注入 FK 所需的 users 行（attachments.userId 外键指向 users）。 */
const seedUsers = async (): Promise<void> => {
  const now = new Date();
  for (const id of [1, 2]) {
    await getDb()
      .insert(users)
      .values({ id, username: `u${id}`, passwordHash: 'x', createdAt: now, updatedAt: now })
      .onConflictDoNothing();
  }
};

beforeEach(async () => {
  await getDb().delete(attachments).run();
  await seedUsers();
});

afterEach(async () => {
  const storage = createStorage(getActiveEnv());
  for (const k of createdKeys.splice(0)) {
    await storage.delete(k).catch(() => {});
  }
});

describe('storage content-addressing (P1)', () => {
  it('same buffer -> same key, second put does not write file again', async () => {
    const storage = createStorage(getActiveEnv());
    const buf = Buffer.from('hello-dedup-world');

    const before = writeFileMock.mock.calls.length;
    const r1 = await storage.put(buf, '.png');
    const r2 = await storage.put(buf, '.png');

    expect(r1.key).toBe(r2.key);
    expect(r1.url).toBe(r2.url);
    expect(writeFileMock.mock.calls.length - before).toBe(1); // 第二次命中复用，不写盘

    createdKeys.push(r1.key);
  });

  it('different ext -> different key (accepted residual duplication)', async () => {
    const storage = createStorage(getActiveEnv());
    const buf = Buffer.from('same-bytes-different-ext');
    const a = await storage.put(buf, '.png');
    const b = await storage.put(buf, '.jpg');
    expect(a.key).not.toBe(b.key);
    createdKeys.push(a.key, b.key);
  });
});

describe('service global dedup (createAttachment)', () => {
  it('different users, same bytes -> different id, same url', async () => {
    const a = await createAttachment({ ...sample, userId: 1 });
    const b = await createAttachment({ ...sample, userId: 2 });

    expect(a.id).not.toBe(b.id); // 仍落新 Attachment 行（保留语义）
    expect(a.url).toBe(b.url); // 相同 url 即相同 storageKey（全局去重共享物理文件）

    createdKeys.push(keyOf(a.url));
  });
});

describe('delete reference-count guard (P3)', () => {
  it('deleting one of two shared rows keeps the file; last delete removes it', async () => {
    const storage = createStorage(getActiveEnv());

    const a = await createAttachment(sample); // 写盘 + 落行
    const b = await createAttachment(sample); // 复用同一物理文件 + 落新行
    const key = keyOf(a.url);
    expect(await storage.get(key)).not.toBeNull();

    await deleteAttachment(a.id); // 仍有 b 引用 → 不删物理文件
    expect(await storage.get(key)).not.toBeNull();

    await deleteAttachment(b.id); // 无引用 → 真删物理文件
    expect(await storage.get(key)).toBeNull();
  });

  it('single reference delete removes the file', async () => {
    const storage = createStorage(getActiveEnv());

    const a = await createAttachment({
      ...sample,
      buffer: Buffer.from('unique-bytes-for-single-ref'),
    });
    const key = keyOf(a.url);
    expect(await storage.get(key)).not.toBeNull();

    await deleteAttachment(a.id);
    expect(await storage.get(key)).toBeNull();
  });

  it('deleting non-existent id returns 404 (contract-compliant)', async () => {
    await expect(deleteAttachment(9_999_999)).rejects.toMatchObject({
      code: ErrCode.NOT_FOUND,
      httpStatus: 404,
    });
  });
});
