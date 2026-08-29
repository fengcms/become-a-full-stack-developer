/**
 * src/shared/storage.ts
 * 存储适配层（对应主计划"适配层"第二处）。STORAGE_DRIVER 决定实现：
 * local = 本地磁盘（开发 / 测试 / 兜底）；r2 = Cloudflare R2（生产，需绑定）。
 * 业务代码只依赖 StorageProvider 接口，不直接接触具体驱动。
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppEnv } from '@/config/env';

/** 存储提供方契约。 */
export interface StorageProvider {
  /** 写入字节流，返回内部 key 与可访问 url。 */
  put(buffer: Buffer, ext: string): Promise<{ key: string; url: string }>;
  /** 按 key 读取，不存在返回 null。 */
  get(key: string): Promise<Buffer | null>;
  /** 按 key 删除（忽略不存在）。 */
  delete(key: string): Promise<void>;
}

/**
 * 安全 key 约束：仅允许基础文件名字符。
 * put 生成的 key 是 `sha256(内容) + 扩展名`（内容寻址，同字节恒同 key），由 hex + 点 + 小写扩展名组成，
 * 天然合法；此处约束的是 get/delete 入参，防御路径遍历（如 '../../etc/passwd'）越权读写 root 之外文件（审阅 B04）。
 */
const SAFE_KEY = /^[A-Za-z0-9._-]+$/;

/** 本地磁盘实现：文件落在 ./uploads，url 以 /files 暴露。 */
class LocalStorage implements StorageProvider {
  constructor(
    private readonly root: string,
    private readonly baseUrl: string,
  ) {}

  /** 解析并校验 key，非法字符一律拒绝（防御路径遍历）。 */
  private resolveKey(key: string): string {
    if (!SAFE_KEY.test(key)) throw new Error(`invalid storage key: ${key}`);
    return join(this.root, key);
  }

  async put(buffer: Buffer, ext: string): Promise<{ key: string; url: string }> {
    const key = `${createHash('sha256').update(buffer).digest('hex')}${ext}`; // 内容寻址：同字节 → 同 key
    const existing = await this.get(key); // 命中则复用，跳过写盘（省 I/O，R2 省 PUT）
    if (existing) return { key, url: `${this.baseUrl}/${key}` };
    await mkdir(this.root, { recursive: true });
    await writeFile(join(this.root, key), buffer);
    return { key, url: `${this.baseUrl}/${key}` };
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.resolveKey(key));
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.resolveKey(key));
    } catch {
      /* 忽略不存在或非法 key */
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
    // 审阅 B10：R2 分支当前为 deferred（裁决 D10：无凭证不实测），仅在 B5 接线前明确待补。
    throw new Error(
      'R2 storage requires Cloudflare binding; use STORAGE_DRIVER=local in dev/test.',
    );
  }
  return new LocalStorage('./uploads', '/files');
};
