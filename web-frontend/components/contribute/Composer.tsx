'use client'
import MDEditor, { type RefMDEditor } from '@uiw/react-md-editor'
import { useEffect, useRef, useState } from 'react'
import { renderMarkdown } from '@/components/article/Markdown'
import { uploadImage } from '@/lib/api/contributions'
import '@uiw/react-md-editor/markdown-editor.css'
import '@uiw/react-markdown-preview/markdown.css'

export default function Composer({
  value,
  onChange,
  articleId,
  onBusy,
  onError,
}: {
  value: string
  onChange: (value: string) => void
  articleId?: number
  onBusy: (busy: boolean) => void
  onError: (message: string) => void
}) {
  const ref = useRef<RefMDEditor>(null)
  const current = useRef(value)
  current.current = value
  const queue = useRef(Promise.resolve())
  const pending = useRef(0)
  const [mode, setMode] = useState<'edit' | 'live' | 'preview'>(() =>
    window.innerWidth > 700 ? 'live' : 'edit',
  )
  useEffect(() => {
    const media = window.matchMedia('(max-width: 700px)')
    const compact = () => {
      if (media.matches) setMode((current) => (current === 'live' ? 'edit' : current))
    }
    media.addEventListener('change', compact)
    return () => media.removeEventListener('change', compact)
  }, [])
  const addFiles = (files: File[]) => {
    if (!files.length) return
    pending.current++
    onBusy(true)
    queue.current = queue.current
      .then(async () => {
        for (const file of files) {
          try {
            const url = await uploadImage(file, articleId)
            const textarea = ref.current?.textarea
            const pos = textarea?.selectionStart ?? current.current.length
            const snippet = `\n![图片](${url})\n`
            current.current = current.current.slice(0, pos) + snippet + current.current.slice(pos)
            onChange(current.current)
            requestAnimationFrame(() =>
              textarea?.setSelectionRange(pos + snippet.length, pos + snippet.length),
            )
          } catch (error) {
            onError(error instanceof Error ? error.message : '图片上传失败，请重新选择或粘贴')
          }
        }
      })
      .finally(() => {
        pending.current--
        onBusy(pending.current > 0)
      })
  }
  return (
    <div className="composer" data-color-mode="light">
      <div className="writing-tools">
        {(['edit', 'live', 'preview'] as const).map((item, i) => (
          <button
            type="button"
            className={mode === item ? 'pbutton' : 'sbutton'}
            key={item}
            onClick={() => setMode(item)}
          >
            {['编辑', '分栏', '预览'][i]}
          </button>
        ))}
        <label className="sbutton">
          上传图片
          <input
            className="sr-only"
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
            multiple
            onChange={(e) => {
              addFiles(Array.from(e.target.files ?? []))
              e.target.value = ''
            }}
          />
        </label>
        <details>
          <summary>Markdown 帮助</summary>
          <p># 标题 · **加粗** · [文字](链接) · 使用三个反引号插入代码块。支持粘贴、拖拽图片。</p>
        </details>
      </div>
      <MDEditor
        ref={ref}
        value={value}
        onChange={(v) => {
          current.current = v ?? ''
          onChange(v ?? '')
        }}
        preview={mode}
        extraCommands={[]}
        height={520}
        components={{ preview: (source) => renderMarkdown(source).body }}
        textareaProps={{
          'aria-label': '文章正文',
          placeholder: '开始写作，支持 Markdown…',
          onPaste: (e) => {
            if (e.clipboardData.files.length) {
              e.preventDefault()
              addFiles(Array.from(e.clipboardData.files))
            }
          },
          onDragOver: (e) => {
            if (e.dataTransfer.types.includes('Files')) e.preventDefault()
          },
          onDrop: (e) => {
            if (e.dataTransfer.files.length) {
              e.preventDefault()
              addFiles(Array.from(e.dataTransfer.files))
            }
          },
        }}
      />
    </div>
  )
}
