/**
 * @file components/article/TableOfContents.tsx
 * @description 文章目录：从 Markdown 文本中提取标题生成锚点导航。
 *   纯前端解析，不依赖额外插件。
 * @module web-frontend/components/article
 * @date 2026-09-16
 */

interface TocItem {
  /** 标题层级（1-6）。 */
  level: number
  /** 标题文本。 */
  text: string
  /** 锚点 id（slug 化）。 */
  id: string
}

/** 中文 slug：保留中英文数字，空格转连字符。 */
const slugify = (text: string): string =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^\w\u4e00-\u9fa5\s-]/g, '')
    .replace(/\s+/g, '-')

/**
 * 从 Markdown 文本中提取标题（## 开头的行）。
 * 忽略代码块内的标题。
 *
 * @param markdown - Markdown 源文本。
 */
export const extractToc = (markdown: string): TocItem[] => {
  const lines = markdown.split('\n')
  const items: TocItem[] = []
  let inCodeBlock = false

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) continue

    const match = line.match(/^(#{1,6})\s+(.+)$/)
    if (match) {
      const level = match[1].length
      const text = match[2].trim()
      items.push({ level, text, id: slugify(text) })
    }
  }

  return items
}

/** 标题层级到左侧缩进 class 的映射。 */
const LEVEL_PADDING: Record<number, string> = {
  1: 'pl-0',
  2: 'pl-0',
  3: 'pl-4',
  4: 'pl-8',
  5: 'pl-12',
  6: 'pl-16',
}

interface TableOfContentsProps {
  /** Markdown 源文本。 */
  content: string
}

/**
 * 文章目录组件。
 *
 * @param content - Markdown 文本。
 */
const TableOfContents = ({ content }: TableOfContentsProps) => {
  const items = extractToc(content)

  if (items.length === 0) return null

  return (
    <nav className="mb-10 rounded-lg border border-line bg-surface/50 p-4" aria-label="目录">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-faint">目录</div>
      <ul className="space-y-1.5 text-sm">
        {items.map((item, idx) => (
          <li
            key={`${item.id}-${idx}`}
            className={`leading-relaxed ${LEVEL_PADDING[item.level] ?? 'pl-0'}`}
          >
            <a href={`#${item.id}`} className="text-ink-soft no-underline hover:text-accent">
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export default TableOfContents
