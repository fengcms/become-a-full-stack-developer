/**
 * @file app/(public)/search/page.tsx
 * @description 全文搜索页（文章 + 会员）。
 *   RSC：从 query 读取 q，调用搜索 API，展示结果。
 * @module web-frontend/app/(public)
 * @date 2026-09-17
 */

import Link from 'next/link'
import { search } from '@/lib/api/search'

/** 格式化日期。 */
const formatDate = (dateStr?: string | null): string => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

interface SearchPageProps {
  searchParams: Promise<{ q?: string }>
}

const SearchPage = async ({ searchParams }: SearchPageProps) => {
  const { q = '' } = await searchParams
  const trimmed = q.trim()

  let articles: SearchArticle[] = []
  let members: SearchMember[] = []

  if (trimmed) {
    try {
      const result = await search({ q: trimmed })
      articles = result.articles?.list ?? []
      members = result.members?.list ?? []
    } catch {
      // 搜索失败时展示空结果
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-semibold tracking-tight">搜索</h1>

      <form action="/search" method="get" className="mb-8">
        <div className="flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={trimmed}
            placeholder="输入关键词搜索文章或会员…"
            className="flex-1 rounded border border-line bg-surface px-4 py-2 text-ink outline-none focus:border-accent"
            aria-label="搜索关键词"
          />
          <button
            type="submit"
            className="rounded bg-accent px-5 py-2 font-medium text-surface transition-opacity hover:opacity-90"
          >
            搜索
          </button>
        </div>
      </form>

      {trimmed && (
        <p className="mb-6 text-sm text-ink-faint">
          关键词「<span className="text-ink-soft">{trimmed}</span>」的搜索结果
        </p>
      )}

      {/* 文章结果 */}
      {articles.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold tracking-tight">文章</h2>
          <ul className="divide-y divide-line">
            {articles.map((a) => (
              <li key={a.id} className="py-4">
                <Link
                  href={a.slug ? `/articles/${a.slug}` : `/articles/${a.id}`}
                  className="no-underline"
                >
                  <h3 className="font-medium text-ink transition-colors hover:text-accent">
                    {a.title}
                  </h3>
                  {a.summary && (
                    <p className="mt-1 line-clamp-2 text-sm text-ink-soft">{a.summary}</p>
                  )}
                  <div className="mt-2 flex items-center gap-3 text-xs text-ink-faint">
                    <span>{formatDate(a.publishedAt || a.createdAt)}</span>
                    {a.viewCount != null && <span>{a.viewCount} 次阅读</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 会员结果 */}
      {members.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold tracking-tight">会员</h2>
          <ul className="divide-y divide-line">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-4">
                {m.avatar ? (
                  <img
                    src={m.avatar}
                    alt={m.nickname}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-hover text-ink-faint">
                    {m.nickname.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="font-medium text-ink">{m.nickname}</p>
                  {m.articleCount != null && (
                    <p className="text-sm text-ink-soft">{m.articleCount} 篇文章</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {trimmed && articles.length === 0 && members.length === 0 && (
        <p className="py-16 text-center text-ink-faint">没有找到相关结果</p>
      )}

      {!trimmed && <p className="py-16 text-center text-ink-faint">输入关键词开始搜索</p>}
    </main>
  )
}

/* ---------------- 类型 ---------------- */

interface SearchArticle {
  id: number
  title: string
  slug?: string | null
  summary?: string | null
  publishedAt?: string | null
  createdAt?: string
  viewCount?: number
}

interface SearchMember {
  id: number
  nickname: string
  avatar?: string | null
  articleCount?: number
}

export default SearchPage
