/**
 * @file components/comment/CommentList.tsx
 * @description 评论列表：楼中楼渲染 + 回复 + 删除。
 *   客户端组件：交互（发表/回复/删除）。
 * @module web-frontend/components/comment
 * @date 2026-09-17
 */

'use client'

import { useEffect, useMemo, useState } from 'react'
import { type Comment, createComment, deleteComment } from '@/lib/api/comments'
import { useAuthStore } from '@/store/auth'

interface CommentListProps {
  articleId: number
  initialComments: Comment[]
}

/** 楼中楼节点。 */
interface CommentNode extends Comment {
  replies: CommentNode[]
}

/** 构建楼中楼树。 */
const buildTree = (comments: Comment[]): CommentNode[] => {
  const map = new Map<number, CommentNode>()
  const roots: CommentNode[] = []
  for (const c of comments) {
    map.set(c.id, { ...c, replies: [] })
  }
  for (const c of comments) {
    const node = map.get(c.id)
    if (!node) continue
    const parent = c.parentId ? map.get(c.parentId) : undefined
    if (parent) {
      parent.replies.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

/** 格式化日期时间。 */
const formatDateTime = (dateStr?: string): string => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 16).replace('T', ' ')
}

const CommentList = ({ articleId, initialComments }: CommentListProps) => {
  const [comments, setComments] = useState<Comment[]>(initialComments)
  const [replyTo, setReplyTo] = useState<number | null>(null)
  const [replyContent, setReplyContent] = useState('')
  const [newContent, setNewContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const userId = useAuthStore((s) => s.user?.id)

  const tree = useMemo(() => buildTree(comments), [comments])

  const handleSubmit = async (parentId: number | null) => {
    const content = parentId ? replyContent : newContent
    if (!content.trim()) return
    setSubmitting(true)
    setMessage('')
    try {
      const result = await createComment(articleId, { content, parentId })
      if (result.status === 'rejected') {
        setMessage(result.rejectedReason || '内容未通过审核，未能发布')
      } else {
        setComments((prev) => [...prev, result])
        if (parentId) {
          setReplyTo(null)
          setReplyContent('')
        } else {
          setNewContent('')
        }
      }
    } catch {
      setMessage('发表失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteComment(id)
      setComments((prev) => prev.filter((c) => c.id !== id))
    } catch {
      // 忽略错误
    }
  }

  // 清空提示
  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(''), 5000)
      return () => clearTimeout(t)
    }
  }, [message])

  if (tree.length === 0 && !submitting) {
    return (
      <div>
        <p className="py-8 text-center text-ink-faint">还没有评论，来发表第一条吧</p>
        <CommentForm
          value={newContent}
          onChange={setNewContent}
          onSubmit={() => handleSubmit(null)}
          submitting={submitting}
          message={message}
        />
      </div>
    )
  }

  return (
    <div>
      <div className="space-y-6">
        {tree.map((node) => (
          <CommentItem
            key={node.id}
            node={node}
            depth={0}
            currentUserId={userId}
            replyTo={replyTo}
            replyContent={replyContent}
            onReplyStart={(id) => {
              setReplyTo(id)
              setReplyContent('')
            }}
            onReplyChange={setReplyContent}
            onReplySubmit={() => handleSubmit(node.id)}
            onReplyCancel={() => setReplyTo(null)}
            onDelete={handleDelete}
            submitting={submitting}
          />
        ))}
      </div>

      <div className="mt-8">
        <CommentForm
          value={newContent}
          onChange={setNewContent}
          onSubmit={() => handleSubmit(null)}
          submitting={submitting}
          message={message}
        />
      </div>
    </div>
  )
}

/* ---------------- 子组件 ---------------- */

interface CommentFormProps {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  submitting: boolean
  message?: string
}

const CommentForm = ({ value, onChange, onSubmit, submitting, message }: CommentFormProps) => (
  <div className="rounded-lg border border-line p-4">
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="写下你的评论…"
      rows={3}
      className="w-full resize-none rounded border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-accent"
    />
    {message && <p className="mt-2 text-sm text-ink-soft">{message}</p>}
    <div className="mt-2 flex justify-end">
      <button
        type="button"
        onClick={onSubmit}
        disabled={submitting || !value.trim()}
        className="rounded bg-accent px-4 py-1.5 text-sm font-medium text-surface transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? '发布中…' : '发表评论'}
      </button>
    </div>
  </div>
)

interface CommentItemProps {
  node: CommentNode
  depth: number
  currentUserId?: number
  replyTo: number | null
  replyContent: string
  onReplyStart: (id: number) => void
  onReplyChange: (v: string) => void
  onReplySubmit: () => void
  onReplyCancel: () => void
  onDelete: (id: number) => void
  submitting: boolean
}

const CommentItem = ({
  node,
  depth,
  currentUserId,
  replyTo,
  replyContent,
  onReplyStart,
  onReplyChange,
  onReplySubmit,
  onReplyCancel,
  onDelete,
  submitting,
}: CommentItemProps) => {
  const isOwner = currentUserId === node.userId
  const isReplying = replyTo === node.id

  return (
    <div className={depth > 0 ? 'ml-6 border-l border-line pl-4' : ''}>
      <div className="py-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-ink">{node.userName ?? '匿名'}</span>
          <span className="text-ink-faint">{formatDateTime(node.createdAt)}</span>
        </div>
        <p className="mt-1 text-ink-soft">{node.content}</p>
        <div className="mt-2 flex gap-4 text-xs">
          <button
            type="button"
            onClick={() => (isReplying ? onReplyCancel() : onReplyStart(node.id))}
            className="text-ink-faint transition-colors hover:text-accent"
          >
            {isReplying ? '取消' : '回复'}
          </button>
          {isOwner && (
            <button
              type="button"
              onClick={() => onDelete(node.id)}
              className="text-ink-faint transition-colors hover:text-red-500"
            >
              删除
            </button>
          )}
        </div>

        {isReplying && (
          <div className="mt-3">
            <textarea
              value={replyContent}
              onChange={(e) => onReplyChange(e.target.value)}
              placeholder={`回复 ${node.userName ?? '匿名'}…`}
              rows={2}
              className="w-full resize-none rounded border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-accent"
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={onReplyCancel}
                className="rounded px-3 py-1 text-sm text-ink-soft hover:bg-hover"
              >
                取消
              </button>
              <button
                type="button"
                onClick={onReplySubmit}
                disabled={submitting || !replyContent.trim()}
                className="rounded bg-accent px-3 py-1 text-sm font-medium text-surface transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? '发布中…' : '回复'}
              </button>
            </div>
          </div>
        )}
      </div>

      {node.replies.map((child) => (
        <CommentItem
          key={child.id}
          node={child}
          depth={depth + 1}
          currentUserId={currentUserId}
          replyTo={replyTo}
          replyContent={replyContent}
          onReplyStart={onReplyStart}
          onReplyChange={onReplyChange}
          onReplySubmit={onReplySubmit}
          onReplyCancel={onReplyCancel}
          onDelete={onDelete}
          submitting={submitting}
        />
      ))}
    </div>
  )
}

export default CommentList
