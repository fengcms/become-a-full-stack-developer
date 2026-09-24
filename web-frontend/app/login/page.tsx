/** @file Login page, preserving only safe origin-relative return locations. */
import { AuthForm } from '@/components/auth/AuthForm'
import { siteChrome } from '@/lib/public'
export const metadata = { title: '会员登录', robots: { index: false, follow: false } }
const Page = async ({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; expired?: string }>
}) => {
  const sp = await searchParams
  const { site } = await siteChrome()
  return (
    <AuthForm
      siteName={site.siteName}
      mode="login"
      redirect={sp.redirect}
      expired={sp.expired === '1'}
    />
  )
}
export default Page
