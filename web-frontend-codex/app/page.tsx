/** @file Approved portal homepage, using real public content and optional editorial slots. */
import Link from 'next/link'
import { Feed } from '@/components/home/Feed'
import { Focus } from '@/components/home/Focus'
import { Sidebar } from '@/components/layout/Sidebar'
import { Picture } from '@/components/ui/Picture'
import { homeContent } from '@/config/home'
import { getArticle, listArticles } from '@/lib/api/articles'
import { categories } from '@/lib/public'
import { articleUrl, dateLabel, safeLink } from '@/lib/utils'
export const revalidate = 60
/** Render latest articles server-side, then progressively enhance the lower feed. */
const Home = async () => {
  const [page, tree, configured] = await Promise.all([
    listArticles({ pageSize: 10, sort: '-publishedAt' }),
    categories(),
    Promise.all(homeContent.focusItems.map((id) => getArticle(id).catch(() => null))),
  ])
  const picks = configured.filter((a) => a !== null)
  const focus = picks.length
    ? picks.slice(0, 5)
    : [...page.list.filter((a) => a.coverImage), ...page.list.filter((a) => !a.coverImage)].slice(
        0,
        3,
      )
  const banner = homeContent.banner
  return (
    <>
      <div className="homestart">
        <Focus articles={focus} />
        <section className="box">
          <div className="sectionhead">
            <h3>最新发布</h3>
            <Link className="muted" href="/articles">
              更多 →
            </Link>
          </div>
          {page.list.slice(0, 6).map((a) => (
            <div className="newest" key={a.id}>
              <time>{dateLabel(a.publishedAt || a.createdAt).slice(5)}</time>
              <Link href={articleUrl(a)}>{a.title}</Link>
            </div>
          ))}
          {!page.list.length && <p className="muted">文章正在准备中，敬请期待。</p>}
        </section>
      </div>
      <Link
        className={`adbanner ${banner.image ? 'has-image' : ''}`}
        href={safeLink(banner.href) || '/about'}
        aria-label={banner.alt}
      >
        {banner.image ? (
          <Picture hero mobileSrc={banner.mobileImage} src={banner.image} alt={banner.alt} />
        ) : (
          <>
            <div>
              <strong>{banner.title}</strong>
              <span>{banner.description}</span>
            </div>
            <span className="sbutton">探索系列 →</span>
          </>
        )}
        <small>系列导读</small>
      </Link>
      <div className="columns">
        <Feed initial={page} categories={tree} />
        <Sidebar />
      </div>
    </>
  )
}
export default Home
