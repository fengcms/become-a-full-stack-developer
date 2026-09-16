/**
 * @file app/(public)/about/page.tsx
 * @description 关于页：介绍本站定位、内容结构与更新节奏。
 *   极简编辑风：居中窄栏、衬线标题。
 * @module web-frontend/app/(public)
 * @date 2026-09-16
 */

import { getCategoryTree } from '@/lib/api'

/** 关于页缓存策略：1 小时重新验证。 */
export const revalidate = 3600

const AboutPage = async () => {
  const categories = await getCategoryTree().catch(() => [])

  return (
    <article className="mx-auto max-w-content px-6 py-16">
      <header className="mb-10 text-center">
        <div className="mb-4 text-xs font-semibold uppercase tracking-widest text-accent">
          关于本站
        </div>
        <h1 className="font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
          成为全栈开发工程师
        </h1>
        <p className="mx-auto mt-5 max-w-lg text-lg text-ink-soft">
          一个以真实系统为载体的全栈开发系列教程，从前端出发，逐步覆盖后端、数据库、部署与运维。
        </p>
      </header>

      <div className="prose prose-neutral mx-auto max-w-none">
        <section>
          <h2>我们在做什么</h2>
          <p>
            本教程不堆砌零散知识点，而是围绕一个完整的内容管理系统（CMS）展开。
            每一篇文章都对应真实系统中的一个模块，从需求分析、接口设计到前后端实现与部署，全程可复现。
          </p>
        </section>

        <section>
          <h2>内容结构</h2>
          <ul>
            <li>
              <strong>前端</strong>：Next.js + TypeScript + Tailwind
              CSS，覆盖组件设计、状态管理、性能优化等。
            </li>
            <li>
              <strong>后端</strong>：Node.js + Hono + Drizzle ORM，涵盖 REST API
              设计、数据库建模、认证鉴权等。
            </li>
            <li>
              <strong>部署</strong>：Cloudflare Workers / Pages，包含 CI/CD、监控与成本控制。
            </li>
          </ul>
        </section>

        <section>
          <h2>分类导航</h2>
          <p>目前已开设以下分类，持续更新中：</p>
          <ul>
            {categories.map((c) => (
              <li key={c.id}>
                <a href={`/categories/${c.slug}`}>{c.name}</a>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2>如何使用</h2>
          <ol>
            <li>从首页或分类页挑选感兴趣的主题。</li>
            <li>按文章顺序阅读，每篇都有可运行的代码示例。</li>
            <li>遇到问题可在文章下方评论区留言。</li>
          </ol>
        </section>
      </div>
    </article>
  )
}

export default AboutPage
