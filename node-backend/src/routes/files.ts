/**
 * src/routes/files.ts
 * 附件直出路由（local 读磁盘 / r2 读 R2，统一经此路由）。
 *
 * 附件 URL 策略（A）：无论 STORAGE_DRIVER 是 local 还是 r2，attachment.url 一律为 /files/{key}，
 * 由本路由统一直出，前端零感知、本地/生产一致。
 *
 * 安全（B5 审阅 P3-5）：SVG 可内联脚本，若以 image/svg+xml 内联提供有 XSS 风险——
 * 故对 svg 强制 Content-Disposition: attachment 并统一加 X-Content-Type-Options: nosniff。
 */
import { Hono } from 'hono';
import { getActiveEnv } from '@/config/env';
import { ErrCode } from '@/shared/codes';
import { AppError } from '@/shared/errors';
import { createStorage } from '@/shared/storage';

/** 安全 key 约束：仅允许基础文件名字符，防御路径遍历（与 storage.ts 同源）。 */
const SAFE_KEY = /^[A-Za-z0-9._-]+$/;

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
};

const filesRoute = new Hono();

filesRoute.get('/:key', async (c) => {
  const env = getActiveEnv();
  const key = c.req.param('key');
  if (!SAFE_KEY.test(key)) throw new AppError(ErrCode.NOT_FOUND, 404); // 防路径穿越
  // local 读磁盘 / r2 读 R2，统一经此路由直出（附件 URL 策略 A）
  const buffer = await createStorage(env).get(key);
  if (!buffer) throw new AppError(ErrCode.NOT_FOUND, 404);
  // P3-5：svg 强制下载 + 统一 nosniff，杜绝脚本内联 XSS
  const ext = key.includes('.') ? `.${key.split('.').pop()?.toLowerCase()}` : '';
  const mime = MIME_BY_EXT[ext] ?? 'application/octet-stream';
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Content-Disposition', mime === 'image/svg+xml' ? 'attachment' : 'inline');
  c.header('Content-Type', mime);
  return c.body(new Uint8Array(buffer));
});

export { filesRoute };
