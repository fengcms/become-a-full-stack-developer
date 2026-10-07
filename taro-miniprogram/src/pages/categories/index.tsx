import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import { Screen, Heading, Icon, State } from '../../components/ui'
import { useResource } from '../../hooks/data'
import { go } from '../../core/navigation'
import type { Category, Tag } from '../../core/models'
function Branch({ node, depth = 0 }: { node: Category; depth?: number }) {
  const [expanded, setExpanded] = useState(depth === 0)
  return <View style={{ marginLeft: depth ? '16px' : 0 }}><View className='menu-item'><View className='grow' onClick={() => go('browse', { category: node.slug, title: node.name })}><Text>{node.name}</Text></View>{!!node.children?.length && <Text className='link' onClick={() => setExpanded(!expanded)}>{expanded ? '收起' : '展开'}</Text>}<View onClick={() => go('browse', { category: node.slug, title: node.name })}><Icon name='chevr' /></View></View>{expanded && node.children?.map(n => <Branch key={n.id} node={n} depth={depth + 1} />)}</View>
}
export default function Categories() {
  const categories = useResource<Category[]>('/categories/tree'), tags = useResource<Tag[]>('/tags')
  return <Screen><View className='brand'>探索知识</View><Text className='muted'>按系列学习，沿着兴趣深入</Text><Heading>文章分类</Heading><View className='panel'><State loading={categories.loading && !categories.data} error={categories.error} retry={() => categories.reload(true)} empty={categories.data?.length === 0} />{categories.data?.map(n => <Branch key={n.id} node={n} />)}</View><Heading>热门标签</Heading><State error={tags.error} retry={() => tags.reload(true)} /><View className='chips'>{tags.data?.map(tag => <Text key={tag.id} className='chip' onClick={() => go('browse', { tag: tag.slug, title: tag.name })}># {tag.name}</Text>)}</View></Screen>
}
