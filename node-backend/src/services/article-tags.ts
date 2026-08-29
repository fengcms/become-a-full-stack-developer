/**
 * src/services/article-tags.ts
 * 文章 ↔ 标签关联（article_tags）领域逻辑：标签名解析与关联同步。
 *
 * 解析约定（B3.5）：入库文章里的 tags 字符串按「slug == name」约定解析为已存在的
 * Tag 实体 id；catalog 中不存在的标签名直接跳过——建标签属 editor 职责，提交文章时
 * 不越权自动建 catalog 标签（见任务包禁止项）。
 * 关联写入入口落在本模块，供文章创建/更新路由与回填脚本共同复用，保证语义一致。
 */
import { eq, or } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { articleTags, tags } from '@/db/schema';

/** 按 slug==name 约定把标签名解析为已存在的 Tag.id 列表（不存在的跳过）。 */
export const resolveTagIds = async (tagNames: string[]): Promise<number[]> => {
  const ids: number[] = [];
  for (const name of tagNames) {
    const row = (
      await getDb()
        .select({ id: tags.id })
        .from(tags)
        .where(or(eq(tags.slug, name), eq(tags.name, name)))
        .limit(1)
        .all()
    )[0];
    if (row) ids.push(row.id);
  }
  return ids;
};

/**
 * 同步某文章的标签关联：先清旧、再按新标签名覆盖插入（幂等）。
 * 仅链接已存在的 Tag；写入走 onConflictDoNothing 复用 uniq_article_tag 唯一索引，
 * 避免并发或重复标签抛错。写语句一律 .run()。
 * @param articleId 文章 id
 * @param tagNames 文章提交的新标签名数组（替换式，空数组即清空）
 */
export const syncArticleTags = async (articleId: number, tagNames: string[]): Promise<void> => {
  const db = getDb();
  await db.delete(articleTags).where(eq(articleTags.articleId, articleId)).run();
  const ids = await resolveTagIds(tagNames);
  for (const tagId of ids) {
    await db
      .insert(articleTags)
      .values({ articleId, tagId, createdAt: new Date() })
      .onConflictDoNothing()
      .run();
  }
};
