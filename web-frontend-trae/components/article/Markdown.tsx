/**
 * @file components/article/Markdown.tsx
 * @description Markdown 正文渲染组件。
 *   使用 react-markdown + remark-gfm（表格/任务列表/删除线等）+ rehype-highlight（代码高亮）。
 *   纯 class 实现代码高亮，无内联样式，符合项目规范。
 *   服务端组件（RSC 可直接使用）。
 * @module web-frontend/components/article
 * @date 2026-09-16
 */

import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeSlug from 'rehype-slug'
import remarkGfm from 'remark-gfm'

/** 仅注册常用语言，减小 bundle（highlight.js 按需加载）。 */
import 'highlight.js/lib/common'

interface MarkdownProps {
  /** Markdown 源文本。 */
  content: string
}

/**
 * Markdown 渲染组件。
 *
 * @param content - Markdown 文本。
 */
const Markdown = ({ content }: MarkdownProps) => {
  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug, [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export default Markdown
