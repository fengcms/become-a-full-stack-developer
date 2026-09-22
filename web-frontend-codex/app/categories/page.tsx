/** @file Category index, displaying real descriptions and tree hierarchy. */
import Link from 'next/link'
import { Empty } from '@/components/ui/Feedback'
import { categories } from '@/lib/public'
import type { Category } from '@/lib/utils'
export const metadata = { title: '分类导航', alternates: { canonical: '/categories' } }
/** Preserve deep category access even outside the header menu. */
const Branches = ({ items }: { items: Category[] }) => (
  <ul className="category-tree">
    {items.map((c) => (
      <li key={c.id || c.slug}>
        <Link href={`/categories/${c.slug}`}>{c.name}</Link>
        {!!c.children?.length && <Branches items={c.children} />}
      </li>
    ))}
  </ul>
)
const Page = async () => {
  const tree = await categories()
  return (
    <>
      <div className="intro">
        <span className="eyebrow">内容导航</span>
        <h1>按领域，找到你想读的内容</h1>
        <p>从熟悉的方向开始，逐步连接全栈开发的每一部分。</p>
      </div>
      {tree.length ? (
        <div className="grid2">
          {tree.map((c) => (
            <section className="categorybox" key={c.id || c.slug}>
              <h2>
                <Link href={`/categories/${c.slug}`}>{c.name}</Link>
              </h2>
              {c.description && <p>{c.description}</p>}
              {!!c.children?.length && <Branches items={c.children} />}
              <Link href={`/categories/${c.slug}`}>浏览栏目文章 →</Link>
            </section>
          ))}
        </div>
      ) : (
        <Empty title="栏目正在准备中" />
      )}
    </>
  )
}
export default Page
