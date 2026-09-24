/** Reconstruct threads from approved flat pages without assuming parent rows are visible. */
import type { Comment } from '@/lib/api/comments'
export interface CommentNode {
  comment: Comment
  parent?: Comment
  missingParent: boolean
  children: CommentNode[]
}
export function commentThreads(comments: Comment[]): CommentNode[] {
  const nodes = new Map<number, CommentNode>()
  for (const comment of comments) {
    if (comment.status === 'approved')
      nodes.set(comment.id, { comment, missingParent: false, children: [] })
  }
  const roots: CommentNode[] = []
  for (const node of nodes.values()) {
    const parent = node.comment.parentId ? nodes.get(node.comment.parentId) : undefined
    const seen = new Set([node.comment.id])
    let ancestor = parent
    while (ancestor && !seen.has(ancestor.comment.id)) {
      seen.add(ancestor.comment.id)
      ancestor = ancestor.comment.parentId ? nodes.get(ancestor.comment.parentId) : undefined
    }
    if (parent && !ancestor && parent.comment.articleId === node.comment.articleId) {
      node.parent = parent.comment
      parent.children.push(node)
    } else {
      node.missingParent = Boolean(node.comment.parentId)
      roots.push(node)
    }
  }
  const order = (a: CommentNode, b: CommentNode) =>
    (a.comment.createdAt ?? '').localeCompare(b.comment.createdAt ?? '') ||
    a.comment.id - b.comment.id
  roots.sort(order)
  for (const node of nodes.values()) node.children.sort(order)
  return roots
}
/** Iterative traversal avoids deep component nesting; visual indentation is capped separately. */
export function threadReplies(root: CommentNode): { node: CommentNode; depth: number }[] {
  const result: { node: CommentNode; depth: number }[] = []
  const stack = root.children
    .slice()
    .reverse()
    .map((node) => ({ node, depth: 1 }))
  while (stack.length) {
    const entry = stack.pop()
    if (!entry) break
    result.push(entry)
    for (const node of entry.node.children.slice().reverse())
      stack.push({ node, depth: entry.depth + 1 })
  }
  return result
}
