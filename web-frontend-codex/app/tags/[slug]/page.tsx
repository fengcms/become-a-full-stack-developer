/** @file Tag archive with its canonical display name. */
import { notFound } from 'next/navigation'
import { Archive, type ArchiveParams } from '@/components/article/Archive'
import { tags } from '@/lib/public'

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<ArchiveParams>
}
export const generateMetadata = async ({ params }: Props) => {
  const { slug } = await params
  const tag = (await tags()).find((t) => t.slug === slug)
  return { title: tag ? `# ${tag.name}` : '标签', alternates: { canonical: `/tags/${slug}` } }
}
const Page = async ({ params, searchParams }: Props) => {
  const { slug } = await params
  const tag = (await tags()).find((t) => t.slug === slug)
  if (!tag) notFound()
  return (
    <Archive
      title={`# ${tag.name}`}
      description={`围绕 ${tag.name} 的实践与思考，持续积累可以复用的经验。`}
      tag={slug}
      params={await searchParams}
      path={`/tags/${slug}`}
    />
  )
}
export default Page
