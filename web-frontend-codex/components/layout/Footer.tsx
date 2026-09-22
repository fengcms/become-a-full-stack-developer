/** @file Site footer with real configuration rather than mock copyright metadata. */
import Link from 'next/link'
import { siteChrome } from '@/lib/public'
/** Shared footer remains reachable after bounded automatic loading. */
export const Footer = async () => {
  const { site } = await siteChrome()
  return (
    <footer className="foot">
      <div className="container">
        <nav aria-label="页脚导航">
          <Link href="/about">关于网站</Link>
          <Link href="/articles">全部文章</Link>
          <Link href="/categories">分类导航</Link>
          <Link href="/tags">标签索引</Link>
        </nav>
        <div>
          {'copyright' in site && site.copyright
            ? site.copyright
            : `© ${new Date().getFullYear()} ${site.siteName}`}
        </div>
      </div>
    </footer>
  )
}
