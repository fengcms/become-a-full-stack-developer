/** @file Register page without unsupported third-party account options. */
import { AuthForm } from '@/components/auth/AuthForm'
import { siteChrome } from '@/lib/public'
export const metadata = { title: '会员注册', robots: { index: false, follow: false } }
const Page = async ({ searchParams }: { searchParams: Promise<{ redirect?: string }> }) => {
  const { site } = await siteChrome()
  return (
    <AuthForm siteName={site.siteName} mode="register" redirect={(await searchParams).redirect} />
  )
}
export default Page
