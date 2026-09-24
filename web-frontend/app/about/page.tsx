/** @file Site introduction grounded in the existing repository's product purpose. */
import Link from 'next/link'
import { siteChrome } from '@/lib/public'
export const metadata = { title: '关于网站', alternates: { canonical: '/about' } }
const Page = async () => {
  const { site } = await siteChrome()
  return (
    <div className="aboutbody">
      <div className="aboutbanner">
        <span className="eyebrow">关于这个系列</span>
        <h1>
          用一个真实系统，
          <br />
          把知识连接起来。
        </h1>
        <p className="muted">{site.siteName}</p>
      </div>
      <h2>为什么做这个网站</h2>
      <p>
        {site.siteDescription ||
          '掌握一项技术和交付一个完整产品之间，还有很多需要亲手走过的路。这个系列以文章系统为线索，记录从产品规划到多端实现的完整过程。'}
      </p>
      <h2>你可以在这里读到什么</h2>
      <div className="grid2">
        <section className="box">
          <h3>前端与交互</h3>
          <p className="muted">页面、组件、状态与用户体验。</p>
          <Link href="/categories">浏览分类 →</Link>
        </section>
        <section className="box">
          <h3>后端与工程</h3>
          <p className="muted">接口、数据、测试与部署上线。</p>
          <Link href="/articles">浏览文章 →</Link>
        </section>
      </div>
      <h2>如何开始阅读</h2>
      <p>
        你可以按分类选择感兴趣的方向，也可以从最新文章开始。登录后可收藏文章、记录阅读历史，并参与评论交流。
      </p>
      <div className="actionrow">
        <Link className="pbutton" href="/categories">
          按分类开始
        </Link>
        <Link className="sbutton" href="/articles">
          查看全部文章
        </Link>
      </div>
    </div>
  )
}
export default Page
