/**
 * @file app/(public)/tags/page.tsx
 * @description 标签云页：展示所有标签（含文章数）。
 *   SSG（revalidate: 1h）。
 * @module web-frontend/app/(public)/tags
 * @date 2026-09-16
 */

import Link from 'next/link'
import { listTags } from '@/lib/api'

export const revalidate = 3600

const TagsPage = async () => {
  const tags = await listTags().catch(() => [])

  return (
    <div className="mx-auto max-w-content px-6 py-12">
      <div className="mb-8 border-b border-line pb-3">
        <h1 className="text-2xl font-semibold tracking-tight">标签</h1>
        <p className="mt-1 text-sm text-ink-faint">共 {tags.length} 个标签</p>
      </div>

      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-3">
          {tags.map((tag) => (
            <Link
              key={tag.id}
              href={`/tags/${tag.slug}`}
              className="group inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-sm text-ink-soft no-underline transition-colors hover:border-accent hover:text-accent"
            >
              <span>#{tag.name}</span>
              {tag.articleCount !== undefined && tag.articleCount > 0 && (
                <span className="text-xs text-ink-faint group-hover:text-accent">
                  {tag.articleCount}
                </span>
              )}
            </Link>
          ))}
        </div>
      ) : (
        <div className="py-16 text-center text-ink-faint">暂无标签</div>
      )}
    </div>
  )
}

export default TagsPage
