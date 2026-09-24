'use client'
import { useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'
import type { ArticleSummary } from '@/lib/api/articles'
import {
  deleteManuscript,
  readManuscript,
  saveManuscript,
  submitManuscript,
} from '@/lib/api/contributions'
import { validateDraft } from '@/lib/contribution-model'
export function ManuscriptActions({ article }: { article: ArticleSummary }) {
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const client = useQueryClient()
  const act = async (action: 'submit' | 'withdraw' | 'delete') => {
    if (busy) return
    if (
      !window.confirm(
        action === 'delete'
          ? '确定删除这篇草稿？'
          : action === 'withdraw'
            ? '撤回后将停止审核，稿件保留为草稿。确定撤回？'
            : '确定将当前已保存稿件提交审核？',
      )
    )
      return
    setBusy(true)
    setNotice('')
    try {
      const current = await readManuscript(article.id)
      if (current.status !== article.status) throw new Error('稿件状态已变化，请刷新列表后操作')
      if (action === 'submit') {
        const error = validateDraft(current, true)
        if (error) throw new Error(`${error}，请先编辑文章`)
        await submitManuscript(article.id)
      } else if (action === 'withdraw')
        await saveManuscript(
          article.id,
          { title: current.title, content: current.content },
          'draft',
        )
      else await deleteManuscript(article.id)
      await client.invalidateQueries({ queryKey: ['member'] })
      await client.invalidateQueries({ queryKey: ['manuscript'] })
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '操作失败，请重试')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="manuscript-actions">
      <Link className="textbutton" href={`/member/articles/${article.id}/edit`}>
        {article.status === 'published' ? '修改并重新送审' : '编辑'}
      </Link>
      <Link className="textbutton" href={`/member/articles/${article.id}/preview`}>
        预览
      </Link>
      {article.status === 'draft' && (
        <>
          <button
            type="button"
            className="textbutton"
            disabled={busy}
            onClick={() => {
              void act('submit')
            }}
          >
            提交审核
          </button>
          <button
            type="button"
            className="textbutton"
            disabled={busy}
            onClick={() => {
              void act('delete')
            }}
          >
            删除草稿
          </button>
        </>
      )}
      {article.status === 'pending' && (
        <button
          type="button"
          className="textbutton"
          disabled={busy}
          onClick={() => {
            void act('withdraw')
          }}
        >
          撤回为草稿
        </button>
      )}
      {notice && <span role="alert">{notice}</span>}
    </div>
  )
}
