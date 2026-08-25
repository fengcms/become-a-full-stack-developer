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
 */
import { z } from 'zod';
import type { CommentRow } from '@/db/schema';

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
