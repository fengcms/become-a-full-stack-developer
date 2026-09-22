/** @file Private section layout never exposes account content to search indexing. */
import { MemberShell } from '@/components/member/MemberShell'
export const metadata = { title: '会员中心', robots: { index: false, follow: false } }
const Layout = ({ children }: { children: React.ReactNode }) => (
  <MemberShell>{children}</MemberShell>
)
export default Layout
