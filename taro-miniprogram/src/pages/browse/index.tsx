import { useState } from 'react'
import { useRouter } from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import { Screen, Feed } from '../../components/ui'
import { useFeed } from '../../hooks/data'
export default function Browse() {
  const p = useRouter().params
  const [sort, setSort] = useState('-publishedAt')
  const filters = ['category', 'tag'].filter(k => p[k]).map(k => `${k}=${encodeURIComponent(p[k]!)}`).join('&')
  const feed = useFeed(`/articles?sort=${sort}&${filters}`)
  return <Screen><View className='brand'>{p.title || '文章列表'}</View><View className='chips'>{[['-publishedAt', '最新发布'], ['-viewCount', '最多阅读'], ['-likeCount', '最多点赞']].map(([key, title]) => <Text key={key} className={`chip ${sort === key ? 'selected' : ''}`} onClick={() => setSort(key)}>{title}</Text>)}</View><Feed feed={feed} /></Screen>
}
