/**
 * @file app/(public)/categories/page.tsx
 * @description 分类导航页：展示分类树（递归）。
 *   SSG（revalidate: 1h）。
 * @module web-frontend/app/(public)/categories
 * @date 2026-09-16
 */

import Link from 'next/link'
import { type CategoryNode, getCategoryTree } from '@/lib/api'

export const revalidate = 3600

/** 递归渲染分类树节点。 */
const CategoryTree = ({ nodes }: { nodes: CategoryNode[] }) => (
  <ul className="space-y-1">
    {nodes.map((node) => (
      <li key={node.id}>
        <Link
          href={`/categories/${node.slug}`}
          className="inline-block rounded px-2 py-1 text-ink no-underline transition-colors hover:bg-hover hover:text-accent"
        >
          {node.name}
        </Link>
        {node.children && node.children.length > 0 && (
          <div className="ml-5 border-l border-line pl-3">
            <CategoryTree nodes={node.children} />
          </div>
        )}
      </li>
    ))}
  </ul>
)

const CategoriesPage = async () => {
  const categories = await getCategoryTree().catch(() => [])

  return (
    <div className="mx-auto max-w-content px-6 py-12">
      <div className="mb-8 border-b border-line pb-3">
        <h1 className="text-2xl font-semibold tracking-tight">分类</h1>
        <p className="mt-1 text-sm text-ink-faint">浏览所有文章分类</p>
      </div>

      {categories.length > 0 ? (
        <CategoryTree nodes={categories} />
      ) : (
        <div className="py-16 text-center text-ink-faint">暂无分类</div>
      )}
    </div>
  )
}

export default CategoriesPage
