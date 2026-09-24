/**
 * @file app/sitemap.ts
 * @description 动态生成 sitemap.xml。
 *   包含首页、文章列表、所有已发布文章、分类、标签。
 * @module web-frontend/app
 * @date 2026-09-16
 */

import type { MetadataRoute } from 'next'
import { getCategoryTree, listArticles, listTags } from '@/lib/api'

/** 站点基础 URL。 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:13000'

const sitemap = async (): Promise<MetadataRoute.Sitemap> => {
  const now = new Date()
  const entries: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/articles`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/categories`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/tags`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.6,
    },
  ]

  // 所有已发布文章
  try {
    const articlesPage = await listArticles({ sort: '-publishedAt', pageSize: 100 })
    for (const article of articlesPage.list) {
      const slug = article.slug || String(article.id)
      entries.push({
        url: `${SITE_URL}/articles/${slug}`,
        lastModified: article.updatedAt ? new Date(article.updatedAt) : now,
        changeFrequency: 'weekly',
        priority: 0.7,
      })
    }
  } catch {
    // 构建时后端不可达，跳过文章条目
  }

  // 分类（拍平树）
  try {
    const categories = await getCategoryTree()
    const flatten = (nodes: { slug: string }[]): void => {
      for (const node of nodes) {
        entries.push({
          url: `${SITE_URL}/categories/${node.slug}`,
          lastModified: now,
          changeFrequency: 'weekly',
          priority: 0.5,
        })
        if (
          'children' in node &&
          Array.isArray((node as { children?: { slug: string }[] }).children)
        ) {
          flatten((node as { children: { slug: string }[] }).children)
        }
      }
    }
    flatten(categories as { slug: string }[])
  } catch {
    // 跳过
  }

  // 标签
  try {
    const tags = await listTags()
    for (const tag of tags) {
      entries.push({
        url: `${SITE_URL}/tags/${tag.slug}`,
        lastModified: now,
        changeFrequency: 'weekly',
        priority: 0.4,
      })
    }
  } catch {
    // 跳过
  }

  return entries
}

export default sitemap
