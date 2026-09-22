/** @file Category archive; API category filtering already includes descendants. */
import { notFound } from 'next/navigation'
import { Archive, type ArchiveParams } from '@/components/article/Archive'
import { categories } from '@/lib/public'
import { flattenCategories } from '@/lib/utils'

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<ArchiveParams>
}
export const generateMetadata = async ({ params }: Props) => {
  const { slug } = await params
  const category = flattenCategories(await categories()).find((c) => c.slug === slug)
  return { title: category?.name || '分类', alternates: { canonical: `/categories/${slug}` } }
}
const Page = async ({ params, searchParams }: Props) => {
  const { slug } = await params
  const category = flattenCategories(await categories()).find((c) => c.slug === slug)
  if (!category) notFound()
  return (
    <Archive
      title={category.name || '分类'}
      description={category.description}
      path={`/categories/${slug}`}
      category={slug}
      params={await searchParams}
      subcategories={category.children}
    />
  )
}
export default Page
