/**
 * src/lib/storage.ts
 * 存储适配层（对应主计划"适配层"第二处）。STORAGE_DRIVER 决定实现：
 * local = 本地磁盘（开发 / 测试 / 兜底）；r2 = Cloudflare R2（生产，需绑定）。
 * 业务代码只依赖 StorageProvider 接口，不直接接触具体驱动。
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppEnv } from '../config/env';

/** 存储提供方契约。 */
export interface StorageProvider {
  /** 写入字节流，返回内部 key 与可访问 url。 */
  put(buffer: Buffer, ext: string): Promise<{ key: string; url: string }>;
  /** 按 key 读取，不存在返回 null。 */
  get(key: string): Promise<Buffer | null>;
  /** 按 key 删除（忽略不存在）。 */
  delete(key: string): Promise<void>;
}

/** 本地磁盘实现：文件落在 ./uploads，url 以 /files 暴露。 */
class LocalStorage implements StorageProvider {
  constructor(
    private readonly root: string,
    private readonly baseUrl: string,
  ) {}

  async put(buffer: Buffer, ext: string): Promise<{ key: string; url: string }> {
    const key = `${randomUUID()}${ext}`;
    await mkdir(this.root, { recursive: true });
    await writeFile(join(this.root, key), buffer);
    return { key, url: `${this.baseUrl}/${key}` };
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(join(this.root, key));
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(join(this.root, key));
    } catch {
      /* 忽略不存在 */
    }
  }
}

/**
 * 按环境选择存储实现。
 * @param env 运行环境
 */
export const createStorage = (env: AppEnv): StorageProvider => {
  if (env.STORAGE_DRIVER === 'r2') {
    // R2 需 Cloudflare 运行时绑定；Node 开发 / 测试一律走 local。
    throw new Error(
      'R2 storage requires Cloudflare binding; use STORAGE_DRIVER=local in dev/test.',
    );
  }
  return new LocalStorage('./uploads', '/files');
};
