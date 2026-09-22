/**
 * @file lib/api/articles.ts
 * @description 文章相关端点。对齐契约 v1.11.0。
 *   公开接口走 serverFetch（RSC 直连后端 + ISR 缓存）；
 *   互动接口（点赞/收藏）由客户端 request 层处理。
 * @module web-frontend/lib/api
 * @date 2026-09-16
 */

import { serverFetch } from '@/lib/api/server'
import type { components } from '@/types/api.gen'

/** 文章摘要（列表用）。 */
export type ArticleSummary = components['schemas']['ArticleSummary']
/** 文章分页结果。 */
export type ArticlePage = components['schemas']['ArticlePage']
/** 文章完整对象（详情用）。 */
export type Article = components['schemas']['Article']
/** 分页信息。 */
export type Pagination = components['schemas']['Pagination']
/** 文章精简桩（上下篇用）。 */
export type ArticleStub = components['schemas']['ArticleStub']
/** 上下篇结果。 */
export type ArticleAdjacent = components['schemas']['ArticleAdjacent']
/** 相关文章项。 */
export type ArticleRelatedItem = components['schemas']['ArticleRelatedItem']

/** listArticles 查询参数。 */
export interface ListArticlesParams {
  page?: number
  pageSize?: number
  /** 排序字段，前缀 - 表示降序。如 -publishedAt。 */
  sort?: string
  /** 分类 slug。 */
  category?: string
  /** 标签 slug。 */
  tag?: string
  /** 关键词（title + summary 子串）。 */
  keyword?: string
}

/**
 * 获取文章列表（仅 published）。
 *
 * @param params - 分页/筛选参数。
 * @param tags - Next.js 缓存标签（用于 ISR 按需重新验证）。
 */
export const listArticles = (
  params: ListArticlesParams = {},
  tags: string[] = ['articles'],
): Promise<ArticlePage> =>
  serverFetch<ArticlePage>('/articles', {
    query: params as Record<string, string | number | boolean | null | undefined>,
    cache: 'force-cache',
    next: { tags },
  })

/**
 * 获取文章详情（按 id 或 slug）。
 *
 * @param idOrSlug - 文章 id 或 slug。
 */
export const getArticle = (idOrSlug: string | number): Promise<Article> =>
  serverFetch<Article>(`/articles/${idOrSlug}`, {
    cache: 'force-cache',
    next: { tags: [`article:${idOrSlug}`] },
  })

/**
 * 获取文章的上下篇（同排序 -publishedAt 下的相邻两篇，仅 published）。
 *
 * @param id - 文章 id。
 */
export const getArticleAdjacent = (id: number): Promise<ArticleAdjacent> =>
  serverFetch<ArticleAdjacent>(`/articles/${id}/adjacent`, {
    cache: 'force-cache',
    next: { tags: [`article:${id}:adjacent`] },
  })

/**
 * 获取相关文章（基于共享标签 + 同分类打分，排除自身，仅 published）。
 *
 * @param id - 文章 id。
 * @param limit - 返回数量，默认 4。
 */
export const getArticleRelated = (id: number, limit = 4): Promise<ArticleRelatedItem[]> =>
  serverFetch<ArticleRelatedItem[]>(`/articles/${id}/related`, {
    query: { limit },
    cache: 'force-cache',
    next: { tags: [`article:${id}:related`] },
  })
