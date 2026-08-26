/**
 * src/routes/files.ts
 * 本地文件直出路由（仅 STORAGE_DRIVER=local 生效；生产走 R2+CDN，不会挂载实际服务）。
 *
 * 背景（B5 审阅 P3-1）：upload 落盘的本地文件 url 为 /files/{key}，但此前 app 无对应静态路由，
 * 本地开发预览编辑器素材库会 404。生产 URL 为 CDN，不受影响。故在 local 驱动下补一个兜底直出路由。
 *
 * 安全（B5 审阅 P3-5）：SVG 可内联脚本，若以 image/svg+xml 内联提供有 XSS 风险——
 * 故对 svg 强制 Content-Disposition: attachment 并统一加 X-Content-Type-Options: nosniff。
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Hono } from 'hono';
import { getActiveEnv } from '@/config/env';
import { ErrCode } from '@/shared/codes';
import { AppError } from '@/shared/errors';

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
  if (env.STORAGE_DRIVER !== 'local') {
    // 生产（R2）由 CDN 提供文件，本地直出路由不服务
    throw new AppError(ErrCode.NOT_FOUND, 404);
  }
  const key = c.req.param('key');
  if (!SAFE_KEY.test(key)) throw new AppError(ErrCode.NOT_FOUND, 404); // 防路径穿越
  const ext = key.includes('.') ? `.${key.split('.').pop()?.toLowerCase()}` : '';
  const mime = MIME_BY_EXT[ext] ?? 'application/octet-stream';
  const buffer = await readFile(join('./uploads', key)).catch(() => null);
  if (!buffer) throw new AppError(ErrCode.NOT_FOUND, 404);
  // P3-5：svg 强制下载 + 统一 nosniff，杜绝脚本内联 XSS
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Content-Disposition', mime === 'image/svg+xml' ? 'attachment' : 'inline');
  c.header('Content-Type', mime);
  return c.body(new Uint8Array(buffer));
});

export { filesRoute };
