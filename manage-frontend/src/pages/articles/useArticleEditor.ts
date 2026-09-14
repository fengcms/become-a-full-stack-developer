/**
 * @file pages/articles/useArticleEditor.ts
 * @description 写作会话：首次回填、原状态保存、发布校验和成功后的连续编辑。
 */
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useRef, useState } from 'react'
import { type FieldErrors, useForm } from 'react-hook-form'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useUploadActivity } from '@/components/form/UploadScope'
import { useArticle, useCreateArticle, useUpdateArticle } from '@/hooks/useArticles'
import type { Article, ArticleStatus } from '@/types/common'
import { type ArticleFormValues, articlePayload, articleSchema, articleToForm } from './articleForm'

/** 一次编辑只初始化一次，后台重新获取不覆盖正在输入的内容。 */
export const useArticleEditor = () => {
  const { id } = useParams()
  const articleId = Number(id)
  const isEdit = id !== undefined
  const validId = Number.isSafeInteger(articleId) && articleId > 0
  const query = useArticle(validId ? articleId : -1)
  const create = useCreateArticle()
  const update = useUpdateArticle()
  const navigate = useNavigate()
  const location = useLocation()
  const [activeTab, setActiveTab] = useState<'content' | 'settings'>('content')
  const [saved, setSaved] = useState<Article>()
  const [savedAt, setSavedAt] = useState('')
  const hydrated = useRef<string | undefined>(undefined)
  const allowNavigation = useRef(false)
  const saving = useRef(false)
  const form = useForm<ArticleFormValues>({
    resolver: zodResolver(articleSchema),
    mode: 'onTouched',
    defaultValues: articleToForm(),
  })
  const { count } = useUploadActivity()
  const busy = create.isPending || update.isPending || count > 0
  const from = (location.state as { from?: string } | null)?.from
  const returnTo = from?.startsWith('/articles?') ? from : '/articles'
  useEffect(() => {
    if (location.pathname) allowNavigation.current = false
  }, [location.pathname])
  useEffect(() => {
    if (!id && hydrated.current) {
      hydrated.current = undefined
      setSaved(undefined)
      setSavedAt('')
      form.reset(articleToForm())
    }
    if (id && query.data && hydrated.current !== id) {
      form.reset(articleToForm(query.data))
      hydrated.current = id
      setSaved(query.data)
    }
  }, [id, query.data, form])

  /** 定位首个错误所在的面板，隐藏字段不再只显示无声的提交失败。 */
  const invalid = (errors: FieldErrors<ArticleFormValues>) => {
    setActiveTab(errors.title || errors.content ? 'content' : 'settings')
  }

  /** 成功后重建基线；新建切换已有稿件地址，下一次保存使用更新接口。 */
  const acceptSaved = (article: Article) => {
    form.reset(articleToForm(article))
    setSaved(article)
    setSavedAt(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }))
    hydrated.current = String(article.id)
    if (!isEdit) {
      allowNavigation.current = true
      navigate(`/articles/${article.id}/edit`, { replace: true, state: { from: returnTo } })
    }
  }

  /** 保存时保留当前状态，明确发布时才传 published。 */
  const submit = (publish: boolean) =>
    form.handleSubmit(async (values) => {
      if (busy || saving.current || (isEdit && (!validId || !saved))) return
      const status: ArticleStatus = publish ? 'published' : (saved?.status ?? 'draft')
      if (publish && !values.categoryId) {
        form.setError('categoryId', { message: '发布前请选择分类' })
        setActiveTab('settings')
        return
      }
      saving.current = true
      try {
        const payload = articlePayload(values, status, saved?.slug)
        const article = isEdit
          ? await update.mutateAsync({ id: articleId, payload })
          : await create.mutateAsync(payload)
        acceptSaved(article)
      } catch {
        /* mutation 已提示，保留输入供重试。 */
      } finally {
        saving.current = false
      }
    }, invalid)

  return {
    form,
    query,
    isEdit,
    validId,
    article: saved,
    busy,
    uploading: count > 0,
    activeTab,
    setActiveTab,
    savedAt,
    allowNavigation,
    acceptSaved,
    save: submit(false),
    publish: submit(true),
    back: () => navigate(returnTo),
  }
}
