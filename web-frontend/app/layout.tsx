/** @file Shared application shell and configured SEO defaults. */
import type { Metadata } from 'next'
import { Providers } from '@/components/auth/Providers'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { siteChrome } from '@/lib/public'
import './globals.css'
/** Use site settings as the authoritative public identity. */
export const generateMetadata = async (): Promise<Metadata> => {
  const { site } = await siteChrome()
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:13001'),
    title: {
      default: site.siteTitle || site.siteName || '成为全栈开发工程师',
      template: `%s · ${site.siteName}`,
    },
    keywords: site.siteKeywords || undefined,
    description: site.siteDescription || '用一个真实系统，串起全栈开发的每一步。',
  }
}
/** Render common navigation on public and member pages. */
const Layout = ({ children }: { children: React.ReactNode }) => (
  <html lang="zh-CN">
    <body>
      <Providers>
        <a className="skip-link" href="#main-content">
          跳到主要内容
        </a>
        <div className="shell">
          <Header />
          <main className="main container" id="main-content">
            {children}
          </main>
          <Footer />
        </div>
      </Providers>
    </body>
  </html>
)
export default Layout
