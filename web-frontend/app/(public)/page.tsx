/**
 * @file app/(public)/page.tsx
 * @description 首页：系列介绍 + 最新文章列表。
 *   极简编辑风：居中窄栏、大量留白、衬线大标题。
 *   目前为静态占位，Phase 3 接入真实文章数据。
 * @module web-frontend/app/(public)
 * @date 2026-09-16
 */

import Link from 'next/link'

const RECENT_ARTICLES = [
  {
    category: 'M3 · Next.js 网站前台',
    title: 'App Router 与 CSR 时代的思维差异',
    excerpt: '目录即路由、服务端优先心智。Next.js 把全栈压进一个框架，前端第一次真正"拥有"服务端。',
    date: '2026-09-16',
    readTime: '12 分钟阅读',
  },
  {
    category: 'M2 · React 管理后台',
    title: '前端鉴权闭环：内存令牌、刷新旋转与路由守卫',
    excerpt: 'access token 不落盘、Cookie/请求体双路径、并发刷新与强制登出。C 端与 B 端的异同。',
    date: '2026-09-12',
    readTime: '15 分钟阅读',
  },
  {
    category: 'M1 · Node 后端',
    title: '评论内容安全：敏感词过滤与自动审核流',
    excerpt: '命中转等长星号、违规比率阈值拒绝、reviewing 人工兜底。从数据模型到防刷的完整链路。',
    date: '2026-09-09',
    readTime: '18 分钟阅读',
  },
  {
    category: 'M0 · 开篇规划',
    title: '契约先行：设计一套被七个端复用的 API',
    excerpt:
      'Contract-First、统一响应、错误码、版本化。为什么 API 契约是唯一值得提前投入的硬地基。',
    date: '2026-08-10',
    readTime: '10 分钟阅读',
  },
]

const Home = () => {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-content px-6 py-16 text-center sm:py-20">
        <div className="mb-5 text-xs font-semibold uppercase tracking-widest text-accent">
          系列教程 · 持续更新
        </div>
        <h1 className="font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
          用一个真实系统，
          <br />
          把前端工程师托到全栈
        </h1>
        <p className="mx-auto mt-5 max-w-md text-lg text-ink-soft">
          从只会调接口，到能设计、实现、部署一整套系统。七个子项目，一套 API 契约，波次串行推进。
        </p>
        <div className="mt-7 text-sm text-ink-faint">已发布 53 篇 · 每周二、五更新</div>
      </section>

      {/* 最新文章列表 */}
      <section className="mx-auto max-w-content px-6 pb-20">
        <div className="mb-8 border-b border-line pb-3 text-xs uppercase tracking-wider text-ink-faint">
          最新文章
        </div>

        <div className="divide-y divide-line">
          {RECENT_ARTICLES.map((article) => (
            <article key={article.title} className="py-8">
              <Link
                href="#"
                className="text-xs font-semibold uppercase tracking-wider text-accent no-underline"
              >
                {article.category}
              </Link>
              <h2 className="mt-2 text-2xl leading-snug tracking-tight">
                <Link
                  href="#"
                  className="text-ink no-underline transition-colors hover:text-accent"
                >
                  {article.title}
                </Link>
              </h2>
              <p className="mt-3 text-base text-ink-soft">{article.excerpt}</p>
              <div className="mt-4 flex items-center gap-3 text-sm text-ink-faint">
                <span>{article.date}</span>
                <span className="h-1 w-1 rounded-full bg-ink-faint" />
                <span>{article.readTime}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  )
}

export default Home
