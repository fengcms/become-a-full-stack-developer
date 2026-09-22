'use client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { renderMarkdown } from '@/components/article/Markdown'
import { Failure, Skeleton } from '@/components/ui/Feedback'
import {
  type DraftFields,
  type Manuscript,
  readManuscript,
  saveManuscript,
  submitManuscript,
} from '@/lib/api/contributions'
import { draftFields, saveStatus, statusLabel, validateDraft } from '@/lib/contribution-model'
import { useAuthStore } from '@/store/auth'
import { ArticleSettings } from './ArticleSettings'
import { useRecovery } from './useRecovery'

const Composer = dynamic(() => import('./Composer'), {
  ssr: false,
  loading: () => <p>编辑器加载中…</p>,
})

export function Editor({ id }: { id?: number }) {
  const user = useAuthStore((s) => s.user)
  const cache = useQueryClient()
  const [article, setArticle] = useState<Manuscript>()
  const [fields, setFields] = useState<DraftFields>(draftFields())
  const [baseline, setBaseline] = useState(JSON.stringify(draftFields()))
  const [ready, setReady] = useState(id === undefined)
  const [tab, setTab] = useState('content')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [bodyBusy, setBodyBusy] = useState(false)
  const [coverBusy, setCoverBusy] = useState(false)
  const lock = useRef(false)
  const hydrated = useRef(false)
  const query = useQuery({
    queryKey: ['manuscript', user?.id, id],
    queryFn: () => readManuscript(id ?? 0),
    enabled: !!id && Number.isSafeInteger(id) && !!user,
    retry: false,
  })
  useEffect(() => {
    if (!query.data || hydrated.current || query.data.authorId !== user?.id) return
    hydrated.current = true
    setArticle(query.data)
    setFields(draftFields(query.data))
    setBaseline(JSON.stringify(draftFields(query.data)))
    setReady(true)
  }, [query.data, user?.id])
  const dirty = JSON.stringify(fields) !== baseline
  const busy = saving || bodyBusy || coverBusy
  const recoveryKey = `codex-writing:${user?.id}:${id ?? 'new'}`
  const recovery = useRecovery(recoveryKey, fields, ready, dirty, busy)
  const change = (patch: Partial<DraftFields>) => setFields((current) => ({ ...current, ...patch }))
  const save = async (submit: boolean) => {
    if (busy || lock.current || !ready) return
    const error = validateDraft(fields, submit || article?.status === 'published')
    if (error) {
      setNotice(error)
      if (error.includes('分类') || error.includes('摘要')) setTab('settings')
      else setTab('content')
      return
    }
    if (
      article?.status === 'published' &&
      !window.confirm(
        '保存后文章将转为待审核，公开版本会受影响（缓存可能短暂保留）。确认修改并重新送审？',
      )
    )
      return
    lock.current = true
    setSaving(true)
    setNotice('')
    try {
      if (article) {
        const latest = await readManuscript(article.id)
        if (latest.status !== article.status || latest.updatedAt !== article.updatedAt)
          throw new Error('服务器稿件已被修改或审核，请保留本机副本后刷新页面核对。')
      }
      let saved = await saveManuscript(
        article?.id ?? id,
        { ...fields, title: fields.title.trim() },
        saveStatus(article?.status),
      )
      setArticle(saved)
      setFields(draftFields(saved))
      setBaseline(JSON.stringify(draftFields(saved)))
      recovery.discard()
      if (id === undefined)
        window.history.replaceState(window.history.state, '', `/member/articles/${saved.id}/edit`)
      if (submit && saved.status === 'draft') {
        try {
          saved = await submitManuscript(saved.id)
          setArticle(saved)
        } catch (error) {
          setNotice(
            `草稿已保存，提交审核失败：${error instanceof Error ? error.message : '请重试'}`,
          )
          return
        }
      }
      setNotice(
        `${statusLabel[saved.status]}已保存到服务器 · ${new Date().toLocaleTimeString('zh-CN')}`,
      )
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '保存失败，内容已保留')
    } finally {
      lock.current = false
      setSaving(false)
      void cache.invalidateQueries({ queryKey: ['member'] })
      void cache.invalidateQueries({ queryKey: ['manuscript'] })
    }
  }
  if (id !== undefined && (!Number.isSafeInteger(id) || id < 1))
    return <p role="alert">文章地址无效</p>
  if (query.isError)
    return (
      <Failure
        message={query.error.message}
        retry={() => {
          void query.refetch()
        }}
      />
    )
  if (query.data && query.data.authorId !== user?.id)
    return <p role="alert">只能编辑自己的稿件。</p>
  if (!ready) return <Skeleton />
  return (
    <div className="writing-page">
      <div className="writing-heading">
        <Link href="/member/articles">← 返回我的文章</Link>
        <span>{article ? statusLabel[article.status] : '新草稿'}</span>
      </div>
      <h1>{article ? '编辑文章' : '写文章'}</h1>
      {article?.status === 'published' && (
        <p className="hint">修改后需重新审核。提交前，现有公开版本保持不变。</p>
      )}
      {recovery.recovery && (
        <div className="hint">
          发现本账号的本机恢复副本，是否恢复？
          <button
            type="button"
            className="textbutton"
            onClick={() => {
              setFields(draftFields(recovery.recovery ?? undefined))
              recovery.discard()
            }}
          >
            恢复内容
          </button>
          <button type="button" className="textbutton" onClick={recovery.discard}>
            使用服务器内容
          </button>
        </div>
      )}
      {recovery.storageError && <p role="alert">{recovery.storageError}</p>}
      <fieldset disabled={saving} className="writing-fields">
        <label className="writing-title">
          文章标题
          <input
            aria-label="文章标题"
            value={fields.title}
            maxLength={200}
            onChange={(e) => change({ title: e.target.value })}
            placeholder="给文章起一个清晰的标题"
          />
        </label>
        <div className="tabs">
          {[
            ['content', '正文'],
            ['settings', '文章设置'],
            ['preview', '完整预览'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={tab === value ? 'selected' : ''}
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div hidden={tab !== 'content'}>
          <Composer
            value={fields.content}
            onChange={(content) => change({ content })}
            articleId={article?.id}
            onBusy={setBodyBusy}
            onError={setNotice}
          />
          <p className="subtitle">正文 {fields.content.length.toLocaleString()} / 65,535 字符</p>
        </div>
        <div hidden={tab !== 'settings'}>
          <fieldset disabled={coverBusy}>
            <ArticleSettings
              fields={fields}
              change={change}
              articleId={article?.id}
              onBusy={setCoverBusy}
              onError={setNotice}
            />
          </fieldset>
        </div>
        {tab === 'preview' && (
          <article className="writing-preview">
            <p className="subtitle">私人预览 · 当前编辑内容</p>
            <h1>{fields.title || '未命名文章'}</h1>
            {fields.summary && <p className="intro">{fields.summary}</p>}
            {fields.coverImage && (
              <Image
                unoptimized
                width={880}
                height={495}
                className="writing-cover"
                src={fields.coverImage}
                alt="文章封面"
              />
            )}
            {renderMarkdown(fields.content).body}
          </article>
        )}
      </fieldset>
      {notice && (
        <p className="hint" role="status">
          {notice}
        </p>
      )}
      <div className="writing-actions">
        <span role="status">
          {busy
            ? '正在保存或上传…'
            : dirty
              ? '有未保存修改 · 本机恢复副本不等于服务器保存'
              : '暂无未保存修改'}
        </span>
        <button className="sbutton" type="button" onClick={() => setTab('preview')}>
          预览
        </button>
        <button
          className="sbutton"
          type="button"
          disabled={busy || (!dirty && !!article)}
          onClick={() => {
            void save(false)
          }}
        >
          {article?.status === 'published'
            ? '保存并重新送审'
            : article?.status === 'pending'
              ? '保存修改'
              : '保存草稿'}
        </button>
        {(!article || article.status === 'draft') && (
          <button
            className="pbutton"
            type="button"
            disabled={busy}
            onClick={() => {
              void save(true)
            }}
          >
            提交审核
          </button>
        )}
      </div>
    </div>
  )
}
