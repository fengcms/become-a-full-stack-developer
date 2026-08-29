/**
 * @file src/components/editor/MarkdownEditor.tsx
 * @description 文章正文 Markdown 编辑器（F0.5，管理后台核心组件）。
 *   基于 @uiw/react-md-editor：左写右预览、工具栏、暗色跟随应用主题（next-themes）；
 *   支持粘贴 / 拖拽图片自动走 POST /upload 上传并插入 `![alt](url)`。
 *   以纯 Markdown 字符串读写，对齐契约 Article.content(string, 上限 65535)。
 * @module manage-frontend/components/editor
 * @date 2026-08-29
 */

import MDEditor, { type RefMDEditor } from '@uiw/react-md-editor'
import { useTheme } from 'next-themes'
import { type ClipboardEvent, type DragEvent, useRef, useState } from 'react'
import '@uiw/react-md-editor/markdown-editor.css'
import '@uiw/react-markdown-preview/markdown.css'
import { useImageUpload } from '@/hooks/useImageUpload'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'

/** 编辑器对外入参。受控组件：value + onChange。 */
export interface MarkdownEditorProps {
  /** 当前 Markdown 文本。 */
  value: string
  /** 内容变化回调（返回最新 Markdown）。 */
  onChange: (value: string) => void
  /** 占位提示（编辑区为空时显示）。 */
  placeholder?: string
  /** 编辑器最小高度（px），默认 420。 */
  minHeight?: number
  /** 关联文章 id，随上传一并写入 Attachment.articleId。 */
  articleId?: number
  /** 只读模式：渲染预览，禁止编辑。 */
  disabled?: boolean
  /** 附加类名。 */
  className?: string
}

/**
 * 文章正文 Markdown 编辑器。
 */
export const MarkdownEditor = ({
  value,
  onChange,
  placeholder = '开始撰写正文…支持 Markdown 语法，可粘贴 / 拖拽图片',
  minHeight = 420,
  articleId,
  disabled = false,
  className,
}: MarkdownEditorProps) => {
  const { resolvedTheme } = useTheme()
  const editorRef = useRef<RefMDEditor>(null)
  const { upload, uploading } = useImageUpload({ articleId })
  const toast = useToast()
  const [dragging, setDragging] = useState(false)

  /** 在光标处插入片段，并把光标移到片段之后。 */
  const insertAtCursor = (snippet: string) => {
    const ta = editorRef.current?.textarea
    const start = ta?.selectionStart ?? value.length
    const end = ta?.selectionEnd ?? value.length
    const next = value.slice(0, start) + snippet + value.slice(end)
    onChange(next)
    const pos = start + snippet.length
    requestAnimationFrame(() => {
      ta?.focus()
      ta?.setSelectionRange(pos, pos)
    })
  }

  /** 逐个上传图片文件并插入 Markdown 图片语法；单张失败只 toast，不阻断其余。 */
  const handleFiles = async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith('image/'))
    if (images.length === 0) return
    for (const file of images) {
      try {
        const url = await upload(file)
        insertAtCursor(`\n![${file.name || 'image'}](${url})\n`)
      } catch (err) {
        toast.error(err)
      }
    }
  }

  /** 粘贴板带了图片时拦截默认行为并上传（挂在 textarea 上）。 */
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData?.files ?? [])
    if (files.length === 0) return
    e.preventDefault()
    void handleFiles(files)
  }

  /** 拖拽图片落入编辑区时拦截默认行为并上传；同时收掉拖拽高亮。 */
  const onDrop = (e: DragEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.dataTransfer?.files ?? [])
    setDragging(false)
    if (files.length === 0) return
    e.preventDefault()
    void handleFiles(files)
  }

  /** 拖拽悬停时高亮编辑区（仅当拖的是文件）。 */
  const onDragOver = (e: DragEvent<HTMLTextAreaElement>) => {
    if (Array.from(e.dataTransfer?.types ?? []).includes('Files')) {
      e.preventDefault()
      setDragging(true)
    }
  }

  if (disabled) {
    return (
      <div className={cn('rounded-md border bg-muted/30 p-4', className)}>
        <MDEditor.Markdown source={value || ''} style={{ background: 'transparent' }} />
      </div>
    )
  }

  return (
    <div className={cn('w-full', dragging && 'rounded-md ring-2 ring-primary/50', className)}>
      <MDEditor
        ref={editorRef}
        value={value}
        onChange={(v) => onChange(v ?? '')}
        height={minHeight}
        minHeight={minHeight}
        visibleDragbar
        data-color-mode={resolvedTheme === 'dark' ? 'dark' : 'light'}
        textareaProps={{
          placeholder,
          onPaste,
          onDrop,
          onDragOver,
          onDragLeave: () => setDragging(false),
        }}
      />
      {uploading ? <p className="mt-1 text-xs text-muted-foreground">图片上传中…</p> : null}
    </div>
  )
}
