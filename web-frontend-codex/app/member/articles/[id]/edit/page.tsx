import { Editor } from '@/components/contribute/Editor'
export const metadata = { title: '编辑文章' }
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <Editor key={id} id={Number(id)} />
}
