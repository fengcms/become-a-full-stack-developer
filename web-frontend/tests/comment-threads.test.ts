import assert from 'node:assert/strict'
import test from 'node:test'
import type { Comment } from '../lib/api/comments.ts'
import { commentThreads, threadReplies } from '../lib/comment-threads.ts'

const row = (
  id: number,
  parentId: number | null = null,
  status: Comment['status'] = 'approved',
): Comment => ({
  id,
  parentId,
  status,
  articleId: 1,
  userId: id,
  userName: `读者${id}`,
  content: `正文${id}`,
  createdAt: new Date(id * 1000).toISOString(),
})
test('replies spanning pages stay in their root floor and identify their immediate author', () => {
  const comments = [
    row(1),
    row(2),
    ...Array.from({ length: 18 }, (_, i) => row(i + 3)),
    row(21, 1),
    row(22, 21),
  ]
  const threads = commentThreads(comments)
  assert.equal(threads.length, 20)
  const replies = threadReplies(threads[0])
  assert.deepEqual(
    replies.map((r) => [r.node.comment.id, r.depth]),
    [
      [21, 1],
      [22, 2],
    ],
  )
  assert.equal(replies[1].node.parent?.userName, '读者21')
})
test('missing or moderated parents preserve replies without disclosing hidden text', () => {
  const threads = commentThreads([row(1, null, 'rejected'), row(2, 1), row(3, 2)])
  assert.equal(threads[0].missingParent, true)
  assert.equal(threads[0].parent, undefined)
  assert.equal(threadReplies(threads[0])[0].node.comment.id, 3)
  assert.equal(commentThreads([row(2, 1), row(1)])[0].children[0].comment.id, 2)
})
test('overlapping pages deduplicate comments and malformed cycles never recurse forever', () => {
  assert.equal(commentThreads([row(1), row(1), row(2, 1)])[0].children.length, 1)
  assert.equal(commentThreads([row(1, 2), row(2, 1), row(3, 3)]).length, 3)
})
test('very deep replies preserve every comment without recursive rendering', () => {
  const threads = commentThreads(Array.from({ length: 1000 }, (_, i) => row(i + 1, i || null)))
  assert.equal(threads.length, 1)
  assert.equal(threadReplies(threads[0]).length, 999)
})
