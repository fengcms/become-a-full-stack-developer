import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { View, Text, Button } from '@tarojs/components'
import { Screen, ArticleCard, State } from '../../components/ui'
import { Private } from '../../components/private'
import { useFeed } from '../../hooks/data'
import { api, toast } from '../../core/api'
import { patchReaction } from '../../core/reactions'
const titles: Record<string, string> = { favorites: '我的收藏', likes: '我的点赞', history: '阅读历史' }
function Content({ kind }: { kind: string }) {
  const feed = useFeed(`/me/${kind}`, true)
  useDidShow(() => { void feed.refresh() })
  async function remove(id?: number) {
    const result = await Taro.showModal({ title: id ? '移除此条记录？' : '清空阅读历史？', content: id ? '之后仍可重新添加。' : '此操作将删除全部阅读历史。' })
    if (!result.confirm) return
    try { await api(id && kind === 'likes' ? `/articles/${id}/like` : `/me/${kind}${id ? '/' + id : ''}`, 'DELETE'); if (id && kind === 'favorites') patchReaction(id, { favorite: false }); if (id && kind === 'likes') patchReaction(id, { liked: false }); await feed.refresh() } catch (e) { toast(e) }
  }
  return <><View className='row between'><View className='brand'>{titles[kind]}</View>{kind === 'history' && feed.items.length > 0 && <Text className='link' onClick={() => void remove()}>清空</Text>}</View>{feed.items.map(a => <ArticleCard key={a.id} article={a}><View className='row between'><Text /><Text className='link' onClick={() => void remove(a.id)}>{kind === 'favorites' ? '取消收藏' : kind === 'likes' ? '取消点赞' : '移除记录'}</Text></View></ArticleCard>)}<State loading={feed.loading} error={feed.error} empty={!feed.items.length} retry={feed.load} />{feed.more && !feed.loading && <Button className='load-more' onClick={feed.load}>加载更多</Button>}</>
}
export default function Collection() { const requested = useRouter().params.kind || 'favorites', kind = titles[requested] ? requested : 'favorites'; return <Screen><Private><Content kind={kind} /></Private></Screen> }
