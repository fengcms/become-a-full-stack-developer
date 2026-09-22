/** @file Shared, deterministic formatting and routing helpers. */
import type { components } from '@/types/api.gen'
export type ArticleSummary = components['schemas']['ArticleSummary']
export type Category = components['schemas']['CategoryNode']
/** Keep login returns on this origin, including encoded redirect edge cases. */
export const safeReturn = (value?: string | null): string => {
  if (!value?.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value))
    return '/member/favorites'
  try {
    const decoded = decodeURIComponent(value)
    if (decoded.startsWith('//') || /[\\\r\n]/.test(decoded)) return '/member/favorites'
    if (/^\/(login|register)(\?|$)/.test(decoded)) return '/member/favorites'
  } catch {
    return '/member/favorites'
  }
  return value
}
/** Article URLs preserve slugs, falling back to IDs supported by the API. */
export const articleUrl = (article: { id: number; slug?: string | null }): string =>
  `/articles/${encodeURIComponent(article.slug || String(article.id))}`
/** Flatten a bounded category tree for ID-to-slug mapping. */
export const flattenCategories = (nodes: Category[]): Category[] =>
  nodes.flatMap((node) => [node, ...flattenCategories(node.children || [])])
/** Format dates in the site's Chinese timezone, consistently in SSR and client. */
export const dateLabel = (value?: string | null): string => {
  if (!value || Number.isNaN(Date.parse(value))) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}
/** Normalize positive page numbers; discard unsafe and negative inputs. */
export const pageNumber = (value?: string): number => {
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? number : 1
}
/** Prevent script-closing text in JSON-LD. */
export const jsonLd = (value: unknown): string => JSON.stringify(value).replace(/</g, '\\u003c')
/** Use only web URLs or origin-relative links for configurable destinations. */
export const safeLink = (value?: string | null): string | undefined => {
  if (!value || /[\\\r\n]/.test(value)) return undefined
  if (value.startsWith('/') && !value.startsWith('//')) return value
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined
  } catch {
    return undefined
  }
}
