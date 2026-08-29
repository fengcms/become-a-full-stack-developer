/**
 * src/shared/slug.ts
 * 共享 slug 格式约束（分类 / 标签 / 文章均复用同一契约模式 `^[a-z0-9-]{1,64}$`）。
 * 集中定义，避免各路由散落正则；Zod 字段用于边界校验（失败即 4001）。
 */
import { z } from 'zod';

/** 契约统一 slug 模式（Category.slug / Tag.slug / Article.slug.pattern 同源）。 */
export const SLUG_RE = /^[a-z0-9-]{1,64}$/;

/** slug Zod 字段（边界校验用）。 */
export const slugField = z.string().regex(SLUG_RE, 'slug 仅允许小写字母、数字、连字符，长度 1-64');
