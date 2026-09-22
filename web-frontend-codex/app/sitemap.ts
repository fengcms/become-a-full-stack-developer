/** @file Public sitemap enumerates complete article pagination, categories and tags. */
import type { MetadataRoute } from 'next'
import { listArticles } from '@/lib/api/articles'
import { categories, tags } from '@/lib/public'
import { articleUrl, flattenCategories } from '@/lib/utils'
export const revalidate = 300
/** Private account and search routes are intentionally excluded. */
const sitemap = async (): Promise<MetadataRoute.Sitemap> => {
  const origin = process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:13001'
  const entries: MetadataRoute.Sitemap = ['/', '/articles', '/categories', '/tags', '/about'].map(
    (path) => ({ url: new URL(path, origin).href }),
  )
  const [tree, allTags] = await Promise.all([categories(), tags()])
  for (const c of flattenCategories(tree))
    if (c.slug) entries.push({ url: new URL(`/categories/${c.slug}`, origin).href })
  for (const t of allTags) entries.push({ url: new URL(`/tags/${t.slug}`, origin).href })
  let page = 1
  let total = 1
  const authors = new Set<number>()
  do {
    const data = await listArticles({ page, pageSize: 100 })
    for (const a of data.list) {
      entries.push({
        url: new URL(articleUrl(a), origin).href,
        ...(a.updatedAt ? { lastModified: a.updatedAt } : {}),
      })
      authors.add(a.authorId)
    }
    total = data.pagination.totalPages
    page++
  } while (page <= total)
  for (const id of authors) entries.push({ url: new URL(`/members/${id}`, origin).href })
  return entries
}
export default sitemap
