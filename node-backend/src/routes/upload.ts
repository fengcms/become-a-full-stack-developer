/**
 * src/routes/upload.ts
 * 上传与附件管理（挂载于 /api/v1）：
 * - POST /upload：登录用户上传文件，经 StorageProvider 双存储（R2 主 / 本地兜底），落 attachments 表
 * - GET /me/attachments：我的附件（分页）
 * - DELETE /attachments/{id}：上传者本人或 admin 删；尽力删底层对象，失败不阻塞行删除
 *
 * 文件校验在信任边界内手动完成（multipart 无 JSON schema），不合法返回契约 4001（data.errors）。
 * Hono 4.x 用 `c.req.parseBody({ all: true })` 解析 multipart（文件以 File 形式呈现）。
 * 薄路由：仅做「信任边界校验（parseUpload）/ 授权（guard 调 service 解析归属）/ 调 service / 格式化」。
 * 双存储写入与删行逻辑已下沉到 services/attachment.ts，本路由不出现 getDb / storage 直接调用。
 */
import type { Context } from 'hono';
import { Hono } from 'hono';
import { type AuthVars, authMiddleware, guard } from '@/middleware/auth';
import {
  createAttachment,
  deleteAttachment,
  getAttachmentOwnerId,
  queryMyAttachments,
} from '@/services/attachment';
import { ErrCode } from '@/shared/codes';
import { AppError } from '@/shared/errors';
import { ok, paginate } from '@/shared/response';

const uploadRoute = new Hono<AuthVars>();

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
]);

/** 信任边界：校验上传文件大小/类型，返回 buffer、扩展名、mime 与可选 articleId（一次性解析）。 */
const parseUpload = async (
  c: Context,
): Promise<{ buffer: Buffer; ext: string; mime: string; articleId: number | null }> => {
  const form = await c.req.parseBody({ all: true });
  const file = form.file;
  if (typeof file === 'string' || Array.isArray(file) || !(file instanceof File)) {
    throw new AppError(ErrCode.VALIDATION, 400, undefined, {
      errors: [{ field: 'file', message: '缺少文件' }],
    });
  }
  if (!ACCEPTED.has(file.type)) {
    throw new AppError(ErrCode.VALIDATION, 400, undefined, {
      errors: [{ field: 'file', message: '文件类型不合法（须为图片或 PDF）' }],
    });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) {
    throw new AppError(ErrCode.VALIDATION, 400, undefined, {
      errors: [{ field: 'file', message: '文件大小超过 10MB' }],
    });
  }
  const name = file.name ?? 'file';
  const ext = name.includes('.') ? `.${name.split('.').pop()}` : '.bin';
  // P3-3：articleId 与 file 同一份 multipart 内一并解析，避免二次 parseBody 浪费 IO。
  const rawId = form.articleId;
  const articleId = typeof rawId === 'string' && rawId !== '' ? Number(rawId) : null;
  if (articleId !== null && !Number.isInteger(articleId)) {
    throw new AppError(ErrCode.VALIDATION, 400, undefined, {
      errors: [{ field: 'articleId', message: 'articleId 须为整数' }],
    });
  }
  return { buffer: buf, ext, mime: file.type, articleId };
};

/** POST /upload — 上传文件（member，StorageProvider 双存储）。 */
uploadRoute.post('/upload', authMiddleware, async (c) => {
  const me = c.get('user');
  const { buffer, ext, mime, articleId } = await parseUpload(c);
  const att = await createAttachment({
    userId: Number(me.id),
    articleId,
    buffer,
    ext,
    mime,
  });
  return ok(att);
});

/** GET /me/attachments — 我的附件（分页）。 */
uploadRoute.get('/me/attachments', authMiddleware, async (c) => {
  const me = c.get('user');
  const result = await queryMyAttachments(c, Number(me.id));
  return paginate(result.list, result.pagination);
});

/** 解析附件归属：加载并校验存在性（缺失 → 404），返回 userId 供 ownerOverride。 */
const resolveAttachmentOwner = async (c: Context<AuthVars>): Promise<string | null> => {
  const id = Number(c.req.param('id'));
  const ownerId = await getAttachmentOwnerId(id);
  if (ownerId === null) throw new AppError(ErrCode.NOT_FOUND, 404);
  return ownerId;
};

/** DELETE /attachments/:id — 上传者本人或 admin 删；尽力删底层对象。 */
uploadRoute.delete(
  '/attachments/:id',
  authMiddleware,
  guard('editor', resolveAttachmentOwner),
  async (c) => {
    const id = Number(c.req.param('id'));
    await deleteAttachment(id);
    return ok({});
  },
);

export { uploadRoute };
