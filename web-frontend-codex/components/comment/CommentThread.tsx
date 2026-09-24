'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { type CommentNode, threadReplies } from '@/lib/comment-threads'
import { dateLabel } from '@/lib/utils'

interface Props {
  node: CommentNode
  revealId?: number
  userId?: number
  deleting: boolean
  onReply: (id: number, name: string, excerpt: string) => void
  onDelete: (id: number) => void
}
function CommentMessage({ node, userId, deleting, onReply, onDelete }: Props) {
  const c = node.comment
  const name = c.userName || '读者'
  return (
    <article className="comment" id={`comment-${c.id}`} aria-label={`${name}的评论`}>
      <div className="avatar" aria-hidden="true">
        {name.slice(0, 1)}
      </div>
      <div className="grow">
        <div className="comment-byline">
          <Link href={`/members/${c.userId}`}>
            <strong>{name}</strong>
          </Link>
          <time className="muted" dateTime={c.createdAt}>
            {dateLabel(c.createdAt)}
          </time>
        </div>
        {node.parent && (
          <a className="comment-context" href={`#comment-${node.parent.id}`}>
            <span>回复 {node.parent.userName || '读者'}</span>
            <q>
              {node.parent.content.slice(0, 90)}
              {node.parent.content.length > 90 ? '…' : ''}
            </q>
          </a>
        )}
        {node.missingParent && <p className="comment-unavailable">回复的原评论暂不可见</p>}
        <p className="comment-body">{c.content}</p>
        <div className="comment-actions">
          <button
            className="textbutton"
            type="button"
            onClick={() => onReply(c.id, name, c.content.slice(0, 90))}
          >
            回复
          </button>
          {userId === c.userId && (
            <button
              className="textbutton"
              type="button"
              disabled={deleting}
              onClick={() => {
                if (window.confirm('删除这条评论？其下的回复也可能一并删除。')) onDelete(c.id)
              }}
            >
              删除
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
export function CommentThread(props: Props) {
  const [expanded, setExpanded] = useState(false)
  const replies = threadReplies(props.node)
  const reveal = replies.some((entry) => entry.node.comment.id === props.revealId)
  useEffect(() => {
    if (reveal && props.revealId) setExpanded(true)
  }, [reveal, props.revealId])
  const visible = expanded ? replies : replies.slice(0, 4)
  return (
    <div className="comment-floor">
      <CommentMessage {...props} />
      {replies.length > 0 && (
        <section className="comment-replies" aria-label="楼内回复">
          <p className="comment-reply-count">{replies.length} 条已加载回复</p>
          {visible.map(({ node, depth }) => (
            <div className={depth > 1 ? 'comment-nested' : ''} key={node.comment.id}>
              <CommentMessage {...props} node={node} />
            </div>
          ))}
          {replies.length > 4 && (
            <button
              className="textbutton comment-expand"
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? '收起回复' : `展开其余 ${replies.length - 4} 条回复`}
            </button>
          )}
        </section>
      )}
    </div>
  )
}
