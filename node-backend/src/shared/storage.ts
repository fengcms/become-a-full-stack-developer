/**
 * src/shared/storage.ts
 * 存储适配层（对应主计划"适配层"第二处）。STORAGE_DRIVER 决定实现：
 * local = 本地磁盘（开发 / 测试 / 兜底）；r2 = Cloudflare R2（生产，需绑定）。
 * 业务代码只依赖 StorageProvider 接口，不直接接触具体驱动。
 *
 * 附件 URL 策略（A）：无论 local 还是 r2，put 返回的 url 一律为 /files/{key}，
 * 由 GET /files/:key 路由统一直出（local 读磁盘 / r2 读 R2），前端零感知，本地/生产一致。
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
 * 最小 R2 binding 契约，规避引入 @cloudflare/workers-types（与 client.ts 的 D1 处理一致，
 * 保证本地 tsc 在无 workers 类型时仍通过）。真实运行环境注入的是 CF 的 R2Bucket。
 */
interface R2BucketLike {
  put(
    key: string,
    value: Buffer | ArrayBuffer | string | ReadableStream,
    opts?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<{
    arrayBuffer(): Promise<ArrayBuffer>;
    httpMetadata?: { contentType?: string };
  } | null>;
  delete(key: string): Promise<void> | void;
}

/** 安全 key 约束：仅允许基础文件名字符。 */
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
 * Cloudflare R2 实现：对象存 R2 bucket，url 仍返回 /files/{key}，由后端 /files 路由统一直出（策略 A）。
 * 内容寻址去重与 local 同语义：同字节 → 同 key，二次 put 命中复用省一次 PUT。
 * R2 对象的 contentType 元数据由 /files 路由按响应需要决定，此处不强制。
 */
class R2Storage implements StorageProvider {
  constructor(
    private readonly bucket: R2BucketLike,
    private readonly baseUrl: string,
  ) {}

  async put(buffer: Buffer, ext: string): Promise<{ key: string; url: string }> {
    const key = `${createHash('sha256').update(buffer).digest('hex')}${ext}`;
    const existing = await this.get(key); // 命中复用，省一次 PUT
    if (existing) return { key, url: `${this.baseUrl}/${key}` };
    await this.bucket.put(key, buffer);
    return { key, url: `${this.baseUrl}/${key}` };
  }

  async get(key: string): Promise<Buffer | null> {
    const obj = await this.bucket.get(key);
    if (!obj) return null;
    return Buffer.from(await obj.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }
}

/**
 * 按环境选择存储实现。
 * @param env 运行环境
 */
export const createStorage = (env: AppEnv): StorageProvider => {
  if (env.STORAGE_DRIVER === 'r2') {
    const bucket = env.R2_BUCKET as R2BucketLike | undefined;
    if (!bucket) {
      throw new Error(
        'STORAGE_DRIVER=r2 但 R2_BUCKET 未绑定；请在 wrangler.toml 配置 [[r2_buckets]]。',
      );
    }
    return new R2Storage(bucket, '/files');
  }
  return new LocalStorage('./uploads', '/files');
};
