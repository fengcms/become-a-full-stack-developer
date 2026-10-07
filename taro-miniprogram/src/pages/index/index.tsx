import { View, Text, Swiper, SwiperItem } from '@tarojs/components'
import { Screen, Feed, Heading, Icon, State } from '../../components/ui'
import { useFeed, useResource } from '../../hooks/data'
import { go, openArticle, tab } from '../../core/navigation'
import type { Article, Page } from '../../core/models'
export default function Home() {
  const feed = useFeed('/articles')
  const popular = useResource<Page<Article>>('/articles?sort=-viewCount&pageSize=3')
  const focus = useResource<Page<Article>>('/articles?sort=-publishedAt&pageSize=3')
  const settings = useResource<{ copyright: string; siteDescription: string }>('/site/settings')
  const featured = focus.data?.list.length ? focus.data.list : feed.items.slice(0, 3)
  return <Screen>
    <View className='row between'><View><View className='brand'>成为全栈</View><Text className='muted'>把技术学透，把作品做好</Text></View><View className='row'><View onClick={() => tab('search')}><Icon name='search' /></View><View onClick={() => go('notifications')}><Icon name='bell' /></View></View></View>
    {featured.length > 0 && <Swiper className='hero-slider' indicatorDots indicatorColor='#bdcfdf' indicatorActiveColor='#3277b5' circular>{featured.map(a => <SwiperItem key={a.id}><View className='hero' onClick={() => openArticle(a.id)}><Text className='eyebrow'>精选阅读 · {a.categoryName || '技术成长'}</Text><View className='hero-title'>{a.title}</View><Text className='link'>开始阅读 →</Text></View></SwiperItem>)}</Swiper>}
    <Heading aside={<Text className='link' onClick={() => go('browse', { title: '最新文章' })}>全部文章 →</Text>}>最新发布</Heading>
    {feed.items.slice(0, 3).map((a, i) => <View className='row story' key={a.id} onClick={() => openArticle(a.id)}><Text className='number'>0{i + 1}</Text><Text className='grow'>{a.title}</Text></View>)}
    <View className='banner' onClick={() => tab('categories')}><View className='section-title'>从一行代码，到完整作品</View><Text>跟随系列教程，走好全栈开发的每一步 →</Text></View>
    <Heading>大家都在读</Heading><State error={popular.error} retry={() => popular.reload(true)} />
    {popular.data?.list.map(a => <View key={a.id} className='story' onClick={() => openArticle(a.id)}><View>{a.title}</View><Text className='muted'>{a.viewCount} 次阅读 · {a.likeCount} 个赞</Text></View>)}
    <Heading>发现更多</Heading><Feed feed={feed} />
    <View className='footer'>{settings.data?.copyright || '成为全栈 · 学习与分享'}</View>
  </Screen>
}
