/** @file Public member profile and published articles only. */
import { notFound } from 'next/navigation'
import { ArticleCard } from '@/components/article/ArticleCard'
import { Sidebar } from '@/components/layout/Sidebar'
import { Empty } from '@/components/ui/Feedback'
import { getMemberProfile } from '@/lib/api/members'
import { categories } from '@/lib/public'
import { ApiError } from '@/lib/request/errors'
export const metadata = { title: '作者主页' }
const Page = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  if (!/^\d+$/.test(id)) notFound()
  const member = await getMemberProfile(id).catch((error) => {
    if (error instanceof ApiError && error.status === 404) notFound()
    throw error
  })
  const tree = await categories().catch(() => [])
  return (
    <>
      <section className="authorhero">
        <div className="avatar large">{member.nickname?.slice(0, 1) || '读'}</div>
        <div>
          <span className="eyebrow">作者主页</span>
          <h1>{member.nickname}</h1>
          <p>{member.articleCount} 篇公开文章</p>
        </div>
      </section>
      <div className="columns">
        <section>
          <div className="sectionhead">
            <h2>作者的文章</h2>
            <small>公开发布</small>
          </div>
          {member.articles?.length ? (
            member.articles.map((a) => <ArticleCard key={a.id} article={a} categories={tree} />)
          ) : (
            <Empty title="作者还没有发布文章" />
          )}
        </section>
        <Sidebar />
      </div>
    </>
  )
}
export default Page
