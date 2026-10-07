import { useEffect, useRef, useState } from 'react'
import Taro, { useRouter, useUnload } from '@tarojs/taro'
import { View, Text, Button } from '@tarojs/components'
import { Screen, State } from '../../components/ui'
import { Private } from '../../components/private'
import { EditorForm } from '../../features/editor-form'
import { Markdown } from '../../features/markdown'
import { useResource } from '../../hooks/data'
import { api, message } from '../../core/api'
import { session, sessionEpoch } from '../../core/session'
import { emptyDraft, readDraft, saveDraft, deleteDraft, validateDraft, draftPayload, type Draft } from '../../core/drafts'
import type { Article, Category } from '../../core/models'
function Editor({ initialId }: { initialId?: string }) {
  const owner = session()!.user.id, epoch = sessionEpoch()
  const [id, setId] = useState(initialId), [draft, setDraft] = useState<Draft>(emptyDraft), [ready, setReady] = useState(false), [preview, setPreview] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [note, setNote] = useState(''), [status, setStatus] = useState('draft')
  const [uncertain, setUncertain] = useState(false)
  const currentId = useRef(initialId), currentDraft = useRef(draft), dirty = useRef(false), locked = useRef(false), baseline = useRef('')
  currentDraft.current = draft
  const categories = useResource<Category[]>('/categories/tree')
  function protect() { Taro.enableAlertBeforeUnload({ message: '文章尚未保存到服务器，本机草稿会保留。', fail: () => {} }) }
  function persist() { if (dirty.current) { try { saveDraft(owner, currentId.current || 'new', currentDraft.current) } catch { setError('本机存储已满，草稿未能保存。请尽快保存至服务器。') } } }
  async function initialize() {
    setReady(false); setError('')
    try {
      let value = emptyDraft()
      if (initialId) {
        const a = await api<Article>(`/articles/${encodeURIComponent(initialId)}`)
        if (a.authorId !== owner) throw new Error('只能编辑自己的文章')
        value = { title: a.title, summary: a.summary || '', content: a.content || '', categoryId: a.categoryId, tags: a.tags.join(', '), coverImage: a.coverImage || '' }
        baseline.current = a.updatedAt; setStatus(a.status)
      }
      const local = readDraft(owner, initialId || 'new')
      if (local) {
        const r = await Taro.showModal({ title: '发现本机草稿', content: `保存于 ${local.updatedAt?.replace('T', ' ').slice(0, 19) || '此前'}，是否恢复？`, confirmText: '恢复草稿', cancelText: '使用云端' })
        if (r.confirm) { value = local; dirty.current = true; protect() } else deleteDraft(owner, initialId || 'new')
      }
      if (epoch !== sessionEpoch()) return
      setDraft(value); setReady(true)
    } catch (e) { setError(message(e)) }
  }
  useEffect(() => { void initialize() }, [])
  useEffect(() => { if (!ready || !dirty.current) return; const timer = setTimeout(persist, 600); return () => clearTimeout(timer) }, [draft, ready])
  useUnload(persist)
  useEffect(() => () => { persist(); Taro.disableAlertBeforeUnload({ fail: () => {} }) }, [])
  function change(value: Draft) { dirty.current = true; setDraft(value); protect(); setNote('修改自动保存到本机草稿') }
  async function save(submit: boolean) {
    if (locked.current || uncertain) return
    const invalid = validateDraft(draft); if (invalid) { setError(invalid); return }
    locked.current = true; setBusy(true); setError(''); persist()
    let creating = !currentId.current
    try {
      if (currentId.current) {
        const latest = await api<Article>(`/articles/${currentId.current}`)
        if (baseline.current && latest.updatedAt !== baseline.current) {
          const overwrite = await Taro.showModal({ title: '云端文章已更新', content: '其他设备或审核可能已修改文章。是否用当前内容覆盖？取消后可保留本机草稿。', confirmText: '覆盖内容' })
          if (!overwrite.confirm) return
        }
        if (latest.status === 'published') {
          const r = await Taro.showModal({ title: '保存已发布文章', content: '会员修改已发布文章后将重新进入审核。是否继续？' })
          if (!r.confirm) return
        }
      }
      let article = await api<Article>(currentId.current ? `/articles/${currentId.current}` : '/articles', currentId.current ? 'PUT' : 'POST', { ...draftPayload(draft), ...(creating ? { status: 'draft' } : {}) })
      if (epoch !== sessionEpoch()) return
      if (creating) { currentId.current = String(article.id); setId(currentId.current); saveDraft(owner, currentId.current, draft); deleteDraft(owner, 'new'); creating = false }
      baseline.current = article.updatedAt; setStatus(article.status)
      // 先固定新稿 ID，再投稿；第二步失败可以继续提交同一稿件。
      if (submit && article.status === 'draft') { article = await api<Article>(`/articles/${article.id}/submit`, 'POST'); baseline.current = article.updatedAt; setStatus(article.status) }
      dirty.current = false; deleteDraft(owner, currentId.current!); Taro.disableAlertBeforeUnload({ fail: () => {} })
      setNote(submit ? '文章已提交，等待审核' : '文章已保存到服务器'); Taro.showToast({ title: submit ? '已提交审核' : '保存成功', icon: 'success' })
    } catch (e) {
      if (creating && !(e instanceof Error && 'status' in e)) { setUncertain(true); setError('创建结果未确认，已保留本机草稿。请先到“我的文章”检查是否已创建，避免重复投稿。') }
      else setError(message(e))
    } finally { locked.current = false; setBusy(false) }
  }
  return <><View className='row between'><View className='section-title'>{id ? '编辑文章' : '写一篇文章'}</View><Text className='pill'>{status === 'draft' ? '草稿' : status === 'pending' ? '审核中' : '已发布'}</Text></View>{!ready ? <State loading={!error} error={error} retry={() => void initialize()} /> : <><View className='chips'><Text className={`chip ${!preview ? 'selected' : ''}`} onClick={() => setPreview(false)}>编辑</Text><Text className={`chip ${preview ? 'selected' : ''}`} onClick={() => setPreview(true)}>预览</Text></View>{preview ? <View><View className='article-title'>{draft.title || '未命名文章'}</View><Markdown source={draft.content} /></View> : <EditorForm draft={draft} onChange={change} categories={categories.data || []} disabled={busy} />}{categories.error && <Text className='error' onClick={() => categories.reload(true)}>分类加载失败，点击重试</Text>}{error && <View className='error'>{error}</View>}{note && <View className='muted'>{note}</View>}<View className='editor-actions'><Button className='button secondary' disabled={busy} onClick={() => { dirty.current = true; persist(); setNote('已保存本机草稿') }}>存本机</Button><Button className='button secondary' disabled={busy || uncertain} loading={busy} onClick={() => void save(false)}>保存文章</Button><Button className='button' disabled={busy || uncertain} loading={busy} onClick={() => void save(true)}>提交审核</Button></View><Text className='muted'>投稿经审核后公开展示。本机草稿按会员隔离，清理阅读缓存不会删除草稿。</Text></>}</>
}
export default function EditorPage() { const id = useRouter().params.id; return <Screen><Private><Editor initialId={id} /></Private></Screen> }
