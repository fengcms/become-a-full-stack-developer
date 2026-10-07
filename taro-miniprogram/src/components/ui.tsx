import { PropsWithChildren } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { Button, Image, Text, View } from '@tarojs/components'
import { applyTheme, useTheme } from '../core/theme'
import { dateLabel, openArticle } from '../core/navigation'
import { useReaction } from '../core/reactions'
import type { Article } from '../core/models'
export function Icon({ name, active = false }: { name: string; active?: boolean }) {
  const theme = useTheme()
  return <Image className='icon' src={`/assets/icons/${name}-${active ? 'active' : theme}.png`} />
}
export function Screen({ children }: PropsWithChildren) {
  const theme = useTheme()
  useDidShow(applyTheme)
  return <View className={`screen ${theme}`} onClick={() => Taro.hideKeyboard().catch(() => {})}>{children}</View>
}
export function Heading({ children, aside }: PropsWithChildren<{ aside?: React.ReactNode }>) {
  return <View className='section-head'><Text className='section-title'>{children}</Text>{aside}</View>
}
export function State({ error, loading, empty, retry }: { error?: string; loading?: boolean; empty?: boolean; retry?: () => void }) {
  if (loading) return <View className='state'><View className='skeleton' /><View className='skeleton short' /><Text className='muted'>正在加载…</Text></View>
  if (error) return <View className='state'><Icon name='wifi-off' /><View>{error}</View>{retry && <Button className='button secondary' onClick={retry}>重新加载</Button>}</View>
  return empty ? <View className='state'><Icon name='empty' /><View>暂时没有内容</View><Text className='muted'>稍后再来看看吧</Text></View> : null
}
export function ArticleCard({ article, children }: PropsWithChildren<{ article: Article }>) {
  const reaction = useReaction(article.id)
  return <View className='story'>
    <View className='row' onClick={() => openArticle(article.id)}>
      <View className='grow'><Text className='eyebrow'>{article.categoryName || '技术分享'}</Text><View className='story-title'>{article.title}</View>{article.summary && <View className='summary'>{article.summary}</View>}</View>
      {article.coverImage && <Image className='story-cover' mode='aspectFill' src={article.coverImage} />}
    </View>
    <View className='meta'><Text>{article.authorName || '社区作者'}</Text><Text>{dateLabel(article.publishedAt || article.createdAt)}</Text><Text>阅读 {article.viewCount} · 赞 {reaction?.count ?? article.likeCount}</Text></View>
    {children}
  </View>
}
export function Feed({ feed }: { feed: { items: Article[]; loading: boolean; error: string; more: boolean; load: () => void } }) {
  return <View>{feed.items.map(a => <ArticleCard key={a.id} article={a} />)}<State loading={feed.loading} error={feed.error} empty={!feed.items.length && !feed.loading} retry={feed.load} />{!feed.loading && !feed.error && feed.items.length > 0 && <Button className='load-more' onClick={feed.more ? feed.load : undefined}>{feed.more ? '加载更多' : '已经到底了'}</Button>}</View>
}
export function Menu({ icon, title, note, onClick }: { icon: string; title: string; note?: string; onClick: () => void }) {
  return <View className='menu-item' onClick={onClick}><Icon name={icon} /><Text className='grow'>{title}</Text>{note && <Text className='muted'>{note}</Text>}<Icon name='chevr' /></View>
}
export function Avatar({ src, name }: { src?: string | null; name?: string | null }) {
  return src ? <Image src={src} className='avatar' mode='aspectFill' /> : <View className='avatar fallback'>{(name || '读者').slice(0, 1)}</View>
}
