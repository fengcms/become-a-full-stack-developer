import { Preview } from '@/components/contribute/Preview'
export const metadata = { title: '稿件预览' }
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <Preview key={id} id={Number(id)} />
}
