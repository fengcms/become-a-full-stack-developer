/** @file Tag directory with genuine names, slugs and counts. */
import Link from 'next/link'
import { Sidebar } from '@/components/layout/Sidebar'
import { Empty } from '@/components/ui/Feedback'
import { tags } from '@/lib/public'
export const metadata = { title: '标签索引', alternates: { canonical: '/tags' } }
const Page = async () => {
  const all = await tags()
  return (
    <>
      <div className="intro">
        <span className="eyebrow">主题索引</span>
        <h1>标签</h1>
        <p>围绕一个技术或话题，发现相关的实践与思考。</p>
      </div>
      <div className="columns">
        <section>
          <div className="sectionhead">
            <h3>全部标签</h3>
            <small>{all.length} 个主题</small>
          </div>
          {all.length ? (
            <div className="tagtiles">
              {all.map((t) => (
                <Link href={`/tags/${t.slug}`} className="tagtile" key={t.id}>
                  <strong># {t.name}</strong>
                  {t.articleCount !== undefined && <span>{t.articleCount} 篇文章 →</span>}
                </Link>
              ))}
            </div>
          ) : (
            <Empty title="暂无标签" />
          )}
        </section>
        <Sidebar />
      </div>
    </>
  )
}
export default Page
