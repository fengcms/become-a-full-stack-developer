import { useEffect, useMemo, useRef, useState } from 'react'
import Taro, { useDidHide, useDidShow, usePageScroll, useRouter, useShareAppMessage } from '@tarojs/taro'
import { View, Text, Image, ScrollView } from '@tarojs/components'
import { Screen, State, Heading, ArticleCard } from '../../components/ui'
import { Markdown } from '../../features/markdown'
import { Comments } from '../../features/comments'
import { Reactions } from '../../features/reactions'
import { useResource } from '../../hooks/data'
import { api } from '../../core/api'
import { useSession, session, sessionEpoch } from '../../core/session'
import { dateLabel, go, openArticle } from '../../core/navigation'
import { parseMarkdown } from '../../core/markdown'
import type { Article } from '../../core/models'
export default function ArticlePage() {
  const params = useRouter().params, preview = params.preview === '1', auth = useSession()
  const result = useResource<Article>(`/articles/${encodeURIComponent(params.id || '')}`, preview)
  const article = result.data
  const adjacent = useResource<{ prev: Article | null; next: Article | null }>(article && !preview ? `/articles/${article.id}/adjacent` : '')
  const related = useResource<Article[]>(article && !preview ? `/articles/${article.id}/related` : '')
  const toc = useMemo(() => parseMarkdown(article?.content || '').headings, [article?.content])
  const [tocOpen, setTocOpen] = useState(false), progress = useRef(0), height = useRef(0), timer = useRef<ReturnType<typeof setTimeout>>(), recorded = useRef(false)
  function startReading() {
    if (!article || preview || recorded.current) return
    clearTimeout(timer.current)
    const epoch = sessionEpoch()
    timer.current = setTimeout(() => {
      if (epoch !== sessionEpoch()) return
      recorded.current = true
      void api(`/articles/${article.id}/view`, 'POST', undefined, false).catch(() => {})
      if (session()) void api('/me/history', 'POST', { articleId: article.id, progress: progress.current }).catch(() => {})
    }, 5000)
  }
  useEffect(() => {
    recorded.current = false; startReading()
    const measure = setTimeout(() => { Taro.createSelectorQuery().select('#article-content').boundingClientRect(r => { if (!Array.isArray(r) && r) height.current = r.height }).exec() }, 500)
    return () => { clearTimeout(timer.current); clearTimeout(measure) }
  }, [article?.id, auth?.user.id])
  useDidShow(startReading)
  useDidHide(() => { clearTimeout(timer.current); if (recorded.current && article && session() && !preview) void api('/me/history', 'POST', { articleId: article.id, progress: progress.current }).catch(() => {}) })
  usePageScroll(({ scrollTop }) => { progress.current = height.current ? Math.max(0, Math.min(100, Math.round(scrollTop / height.current * 100))) : 0 })
  useShareAppMessage(() => ({ title: preview ? '成为全栈' : article?.title || '成为全栈', path: preview ? '/pages/index/index' : `/pages/article/index?id=${article?.id || params.id}` }))
  return <Screen><State loading={result.loading && !article} error={result.error} retry={() => result.reload(true)} />{article && <>
    {preview && <View className='banner'>本人预览 · {article.status} · 未发布内容不会公开展示</View>}
    <Text className='eyebrow' onClick={() => article.categoryId && go('browse', { category: article.categoryId, title: article.categoryName || '分类' })}>{article.categoryName || '技术分享'}</Text><View className='article-title'>{article.title}</View>
    <View className='meta'><Text className='link' onClick={() => go('author', { id: article.authorId })}>{article.authorName}</Text><Text>{dateLabel(article.publishedAt || article.createdAt)}</Text><Text>{article.viewCount} 次阅读</Text></View>
    {article.summary && <View className='article-summary'>{article.summary}</View>}{article.coverImage && <Image className='reader-image' mode='widthFix' src={article.coverImage} />}
    <View id='article-content'><Markdown source={article.content || ''} /></View>
    <View className='chips'>{article.tags.map(tag => <Text className='chip' key={tag} onClick={() => go('browse', { tag, title: tag })}># {tag}</Text>)}</View>
    {!preview && <><Reactions id={article.id} count={article.likeCount} /><View className='panel'>{adjacent.data?.prev && <View className='menu-item' onClick={() => openArticle(adjacent.data!.prev!.id)}><Text>上一篇：{adjacent.data.prev.title}</Text></View>}{adjacent.data?.next && <View className='menu-item' onClick={() => openArticle(adjacent.data!.next!.id)}><Text>下一篇：{adjacent.data.next.title}</Text></View>}</View><Heading>继续阅读</Heading>{related.data?.map(a => <ArticleCard key={a.id} article={a} />)}<Comments key={`${article.id}:${auth?.user.id || 'guest'}`} articleId={article.id} /></>}
    {toc.length > 0 && <View className='toc-toggle' onClick={() => setTocOpen(!tocOpen)}>目录</View>}{tocOpen && <View className='overlay' onClick={() => setTocOpen(false)}><View className='toc-panel' onClick={e => e.stopPropagation()}><Heading aside={<Text className='link' onClick={() => setTocOpen(false)}>关闭</Text>}>文章目录</Heading><ScrollView scrollY style={{ maxHeight: '60vh' }}>{toc.map(h => <View className='menu-item' key={h.id} style={{ paddingLeft: `${(h.level - 1) * 10}px` }} onClick={() => { setTocOpen(false); Taro.pageScrollTo({ selector: `#${h.id}`, offsetTop: -12, duration: 250 }) }}>{h.title}</View>)}</ScrollView></View></View>}
  </>}</Screen>
}
