/** @file A single heading-ID algorithm shared by Markdown rendering and the TOC. */
export interface MarkdownNode {
  type: string
  tagName?: string
  value?: string
  children?: MarkdownNode[]
  properties?: Record<string, unknown>
}
export interface Heading {
  id: string
  text: string
  level: number
}
/** Text extraction follows the actual syntax tree, not Markdown regexes. */
export const nodeText = (node: MarkdownNode): string =>
  node.value || node.children?.map(nodeText).join('') || ''
/** Assign deterministic, duplicate-safe identifiers to rendered heading nodes. */
export const assignHeadings = (tree: MarkdownNode): Heading[] => {
  const used = new Set<string>()
  const headings: Heading[] = []
  const visit = (node: MarkdownNode) => {
    if (node.type === 'element' && /^h[1-6]$/.test(node.tagName || '')) {
      const text = nodeText(node)
      const base =
        text
          .toLowerCase()
          .trim()
          .replace(/[^\p{L}\p{N}\s_-]/gu, '')
          .replace(/\s+/g, '-') || 'section'
      let id = base
      let suffix = 1
      while (used.has(id)) id = `${base}-${suffix++}`
      used.add(id)
      node.properties = { ...node.properties, id }
      headings.push({ id, text, level: Number(node.tagName?.slice(1)) })
    }
    node.children?.forEach(visit)
  }
  visit(tree)
  return headings
}
