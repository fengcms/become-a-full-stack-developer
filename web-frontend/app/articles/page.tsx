/** @file Article archive with shareable sorting/category filters. */
import { Archive, type ArchiveParams } from '@/components/article/Archive'
export const metadata = { title: '全部文章', alternates: { canonical: '/articles' } }
const Page = async ({ searchParams }: { searchParams: Promise<ArchiveParams> }) => (
  <Archive title="全部文章" path="/articles" params={await searchParams} />
)
export default Page
