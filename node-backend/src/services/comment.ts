/**
 * src/lib/comment.ts
 * 评论领域纯逻辑（与路由解耦，便于单测）：三态类型、基础敏感词过滤、入参 schema、序列化。
 * 所有 DB 行 snake_case → 契约 camelCase 在此统一完成。
 *
 * 设计要点（对齐契约 + 02 §2.5）：
 * - 评论三态 approved / rejected / reviewing；自动流（发表）只产出 approved / rejected，
 *   reviewing 仅能由 `PATCH /comments/{id}/status`（editor/admin）人工置位。
 * - 敏感词基础过滤：命中转等长星号；违规比率（命中字符数 / 原文长度）超阈值 → rejected，否则 approved。
 *   基础演示词库，不追求完整；阈值 0.3 为可解释默认（见 B4-NOTES）。
 *
 * 注：本文件约 226 行，超过 200 行软上限——集中承载「三态类型 + 敏感词过滤 + 入参 schema
 * + 序列化 + 评论列表/创建/删除/复核」紧密相关的评论领域逻辑，拆分反而割裂三态与序列化的协作。
 * 按项目纪律「特殊情况需注释说明」显式标注 services 例外；routes 层仍严守 ≤200。
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db/client';
import { type CommentRow, comments } from '@/db/schema';
import { resolveArticle, userNameOf } from '@/services/comment-query';
import { ErrCode } from '@/shared/codes';
import { AppError } from '@/shared/errors';

/** 评论状态三态。 */
export type CommentStatus = 'approved' | 'rejected' | 'reviewing';

/** 基础敏感词库（演示用，非完整词库）。 */
export const SENSITIVE_WORDS: readonly string[] = [
  '广告',
  'spam',
  'fuck',
  'shit',
  '垃圾',
  '代开发票',
];

/** 违规比率阈值：超过则判定 rejected。 */
export const REJECT_RATIO = 0.3;

/** 正则转义，避免词库中特殊字符破坏正则。 */
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 敏感词过滤结果：转义后的展示内容 + 判定状态。 */
export interface ModerationResult {
  content: string;
  status: CommentStatus;
}

/**
 * 对评论原文做基础敏感词过滤。
 * @param raw 原始内容
 * @returns 命中词替换为等长星号后的内容，及自动流判定状态（approved / rejected）
 */
export const moderateContent = (raw: string): ModerationResult => {
  let content = raw;
  let hitChars = 0;
  for (const word of SENSITIVE_WORDS) {
    if (!word) continue;
    const re = new RegExp(escapeRegExp(word), 'gi');
    content = content.replace(re, (m) => '*'.repeat(m.length));
    const matches = raw.match(re);
    if (matches) hitChars += matches.reduce((acc, m) => acc + m.length, 0);
  }
  const ratio = raw.length === 0 ? 0 : hitChars / raw.length;
  const status: CommentStatus = ratio > REJECT_RATIO ? 'rejected' : 'approved';
  return { content, status };
};

/** 发表评论入参 schema（契约 createComment body）。 */
export const commentInputSchema = z.object({
  content: z.string().min(1).max(65535),
  parentId: z.number().int().positive().nullable().optional(),
});

/** 人工复核置位入参 schema（契约 CommentModerateRequest）。 */
export const moderateSchema = z.object({
  status: z.enum(['approved', 'rejected', 'reviewing']),
  reason: z.string().nullable().optional(),
});

/** 发表评论入参（c.req.valid 强转用，v.json 包装会丢失类型）。 */
export type CommentInput = z.infer<typeof commentInputSchema>;
/** 人工复核置位入参。 */
export type ModerateInput = z.infer<typeof moderateSchema>;

/** 序列化为契约 Comment（snake_case → camelCase）。 */
export const toComment = (c: CommentRow) => ({
  id: c.id,
  articleId: c.articleId,
  userId: c.userId,
  userName: c.userName,
  parentId: c.parentId ?? null,
  content: c.content,
  status: c.status as CommentStatus,
  rejectedReason: c.rejectedReason ?? null,
  createdAt: c.createdAt.toISOString(),
});

/** 取评论归属 userId（字符串），用于 guard ownerOverride；缺失 → null。 */
export const getCommentOwnerId = async (id: number): Promise<string | null> => {
  const cm = (
    await getDb()
      .select({ userId: comments.userId })
      .from(comments)
      .where(eq(comments.id, id))
      .limit(1)
      .all()
  )[0];
  return cm ? String(cm.userId) : null;
};

/** POST /articles/:key/comments — 登录发表；未发布文章不可评论；自动敏感词过滤。 */
export const createComment = async (
  userId: number,
  articleKey: string,
  input: CommentInput,
): Promise<ReturnType<typeof toComment>> => {
  const article = await resolveArticle(articleKey);
  if (article?.status !== 'published') throw new AppError(ErrCode.NOT_FOUND, 404);
  if (input.parentId != null) {
    const parent = (
      await getDb()
        .select({ id: comments.id, articleId: comments.articleId })
        .from(comments)
        .where(eq(comments.id, input.parentId))
        .limit(1)
        .all()
    )[0];
    if (!parent || parent.articleId !== article.id) throw new AppError(ErrCode.NOT_FOUND, 404);
  }
  const mod = moderateContent(input.content);
  const [row] = await getDb()
    .insert(comments)
    .values({
      articleId: article.id,
      userId,
      userName: await userNameOf(userId),
      parentId: input.parentId ?? null,
      content: mod.content,
      status: mod.status,
      createdAt: new Date(),
    })
    .returning()
    .all();
  if (!row) throw new AppError(ErrCode.INTERNAL, 500);
  return toComment(row);
};

/** DELETE /comments/:id — owner 或 editor+ 可删；级联删其子回复（x-cascade: children）。 */
export const deleteComment = async (id: number): Promise<void> => {
  const db = getDb();
  await db.delete(comments).where(eq(comments.parentId, id)).run(); // 级联删子回复
  const res = await db.delete(comments).where(eq(comments.id, id)).run();
  // 复用 run() 的 changes 判定存在性，避免与 guard 内 resolveCommentOwner 重复查库（P3-2）
  if (res.changes === 0) throw new AppError(ErrCode.NOT_FOUND, 404);
};

/** PATCH /comments/:id/status — editor+ 人工复核置位；approved 时清空 rejectedReason。 */
export const moderateComment = async (
  id: number,
  status: CommentStatus,
  reason: string | null | undefined,
): Promise<ReturnType<typeof toComment>> => {
  const existing = (
    await getDb().select().from(comments).where(eq(comments.id, id)).limit(1).all()
  )[0];
  if (!existing) throw new AppError(ErrCode.NOT_FOUND, 404);
  const rejectedReason = status === 'approved' ? null : (reason ?? existing.rejectedReason);
  const [row] = await getDb()
    .update(comments)
    .set({ status, rejectedReason })
    .where(eq(comments.id, id))
    .returning()
    .all();
  if (!row) throw new AppError(ErrCode.INTERNAL, 500);
  return toComment(row);
};

/** GET /articles/:key/comments — 公开仅 approved；未发布文章匿名 404，作者/admin 可看（仍只 approved）。 */
export const listArticleComments = async (
  key: string,
  user: { id: string; role: string } | null,
  pageSize: number,
  offset: number,
): Promise<{ items: ReturnType<typeof toComment>[]; total: number }> => {
  const article = await resolveArticle(key);
  if (!article) throw new AppError(ErrCode.NOT_FOUND, 404);
  const privileged = user && (String(article.authorId) === user.id || user.role === 'admin');
  if (article.status !== 'published' && !privileged) throw new AppError(ErrCode.NOT_FOUND, 404);
  const conds = and(eq(comments.articleId, article.id), eq(comments.status, 'approved'));
  const db = getDb();
  const rows = await db
    .select()
    .from(comments)
    .where(conds)
    .orderBy(comments.createdAt)
    .limit(pageSize)
    .offset(offset)
    .all();
  const total = Number(
    (await db.select({ c: sql<number>`count(*)` }).from(comments).where(conds).all())[0]?.c ?? 0,
  );
  return { items: rows.map(toComment), total };
};

/** GET /admin/comments — editor+ 后台列表（全状态），可按 status / articleId 筛选。 */
export const listAdminComments = async (
  status: CommentStatus | undefined,
  articleId: number | undefined,
  pageSize: number,
  offset: number,
): Promise<{ items: ReturnType<typeof toComment>[]; total: number }> => {
  const where = and(
    status ? eq(comments.status, status) : undefined,
    articleId != null ? eq(comments.articleId, articleId) : undefined,
  );
  const db = getDb();
  const rows = await db
    .select()
    .from(comments)
    .where(where)
    .orderBy(desc(comments.createdAt))
    .limit(pageSize)
    .offset(offset)
    .all();
  const total = Number(
    (await db.select({ c: sql<number>`count(*)` }).from(comments).where(where).all())[0]?.c ?? 0,
  );
  return { items: rows.map(toComment), total };
};
