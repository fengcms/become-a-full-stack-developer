/** @file Public header: configured identity, nested categories, search and account. */
import Link from 'next/link'
import { Picture } from '@/components/ui/Picture'
import { siteChrome } from '@/lib/public'
import { safeLink } from '@/lib/utils'
import { Navigation } from './Navigation'
import { UserMenu } from './UserMenu'
/** Server-render public navigation while isolating account interactivity. */
export const Header = async () => {
  const { site, categories } = await siteChrome()
  const logo = 'logoUrl' in site ? safeLink(site.logoUrl) : undefined
  return (
    <header className="site-header">
      <div className="head container">
        <Link className="brand" href="/">
          {logo ? (
            <span className="brand-image">
              <Picture src={logo} alt="" />
            </span>
          ) : (
            <span className="mark">F</span>
          )}
          <span>{site.siteName || '成为全栈开发工程师'}</span>
        </Link>
        <Navigation categories={categories} />
        <form className="headersearch" action="/search">
          <input aria-label="搜索文章" name="q" placeholder="搜索文章" required />
          <button type="submit">搜索</button>
        </form>
        <UserMenu />
      </div>
    </header>
  )
}
