/** @file Optional, independently recoverable public sidebar modules. */
import Link from 'next/link'
import { homeContent } from '@/config/home'
import { getArticle, listArticles } from '@/lib/api/articles'
import { tags } from '@/lib/public'
import { articleUrl } from '@/lib/utils'
/** Cumulative popularity is labelled honestly; editorial picks require configuration. */
export const Sidebar = async () => {
  const [popular, allTags, picks] = await Promise.all([
    listArticles({ sort: '-viewCount', pageSize: 5 }).catch(() => null),
    tags().catch(() => []),
    Promise.all(homeContent.editorPicks.map((id) => getArticle(id).catch(() => null))),
  ])
  return (
    <aside className="side">
      <section className="box">
        <div className="sectionhead">
          <h3>热门文章</h3>
          <small>累计阅读</small>
        </div>
        {popular ? (
          popular.list.length ? (
            popular.list.map((item, i) => (
              <div className="rank" key={item.id}>
                <b>{String(i + 1).padStart(2, '0')}</b>
                <Link href={articleUrl(item)}>{item.title}</Link>
              </div>
            ))
          ) : (
            <p className="muted">暂无文章</p>
          )
        ) : (
          <p className="muted">热门文章暂时无法加载</p>
        )}
      </section>
      {picks.some(Boolean) && (
        <section className="box">
          <h3>编辑精选</h3>
          {picks.map(
            (item) =>
              item && (
                <div className="rank" key={item.id}>
                  <Link href={articleUrl(item)}>{item.title}</Link>
                </div>
              ),
          )}
        </section>
      )}
      {allTags.length > 0 && (
        <section className="box">
          <div className="sectionhead">
            <h3>热门标签</h3>
            <Link className="muted" href="/tags">
              全部 →
            </Link>
          </div>
          {allTags
            .slice()
            .sort((a, b) => (b.articleCount || 0) - (a.articleCount || 0))
            .slice(0, 12)
            .map((tag) => (
              <Link href={`/tags/${tag.slug}`} className="tag" key={tag.id}>
                {tag.name}
              </Link>
            ))}
        </section>
      )}
      <section className="box">
        <h3>开始系统阅读</h3>
        <p className="muted">从一个真实项目出发，逐步连接前端、后端与部署。</p>
        <Link href="/about">了解这个系列 →</Link>
      </section>
    </aside>
  )
}
