/** @file Markdown and TOC derive from the same parsed tree; raw HTML remains disabled. */
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { assignHeadings, type Heading, type MarkdownNode } from '@/lib/headings'
import { CodeBlock } from './CodeBlock'
/** ReactMarkdown's synchronous server renderer runs the plugin before returning. */
export const renderMarkdown = (content: string) => {
  let headings: Heading[] = []
  const collect = () => (tree: MarkdownNode) => {
    headings = assignHeadings(tree)
  }
  const rendered = ReactMarkdown({
    children: content,
    remarkPlugins: [remarkGfm],
    rehypePlugins: [collect, [rehypeHighlight, { detect: false, ignoreMissing: true }]],
    components: {
      pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
      table: ({ children }) => (
        <div className="table-scroll">
          <table>{children}</table>
        </div>
      ),
      a: ({ href, children }) => (
        <a
          href={href}
          {...(href?.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {children}
        </a>
      ),
    },
  })
  return { headings, body: <div className="prose article-prose">{rendered}</div> }
}
