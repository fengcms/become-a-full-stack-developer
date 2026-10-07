import { useEffect, useRef, useState } from 'react'
import { Button, View, Text } from '@tarojs/components'
import { Icon } from '../components/ui'
import { api, read, toast } from '../core/api'
import { requireLogin } from '../core/navigation'
import { sessionEpoch, useSession } from '../core/session'
import { isFavorite, patchReaction, useReaction } from '../core/reactions'
export function Reactions({ id, count }: { id: number; count: number }) {
  const auth = useSession(), value = useReaction(id), [ready, setReady] = useState(false), [error, setError] = useState(false)
  const lock = useRef(false)
  async function load() {
    const epoch = sessionEpoch(); setReady(false); setError(false)
    try {
      const [like, favorite] = await Promise.all([read<{ liked: boolean; likeCount: number }>(`/articles/${id}/like/status`, true, !!auth), auth ? isFavorite(id) : false])
      if (epoch === sessionEpoch()) { patchReaction(id, { liked: like.liked, count: like.likeCount, favorite }); setReady(true) }
    } catch { setError(true) }
  }
  useEffect(() => { void load() }, [id, auth?.user.id])
  async function toggle(kind: 'liked' | 'favorite') {
    if (!requireLogin() || !ready || lock.current) return
    const epoch = sessionEpoch(), before = { liked: value?.liked || false, favorite: value?.favorite || false, count: value?.count ?? count }, next = !before[kind]
    lock.current = true
    patchReaction(id, { [kind]: next, ...(kind === 'liked' ? { count: Math.max(0, before.count + (next ? 1 : -1)) } : {}) })
    try {
      if (kind === 'liked') {
        const r = await api<{ liked: boolean; likeCount: number }>(`/articles/${id}/like`, next ? 'POST' : 'DELETE')
        if (epoch === sessionEpoch()) patchReaction(id, { liked: r.liked, count: r.likeCount })
      } else await api(next ? '/me/favorites' : `/me/favorites/${id}`, next ? 'POST' : 'DELETE', next ? { articleId: id } : undefined)
    } catch (e) { if (epoch === sessionEpoch()) patchReaction(id, before); toast(e) }
    finally { lock.current = false }
  }
  return <View className='reaction-area'><View className='row between'><Button className='reaction-button' disabled={!!auth && !ready} onClick={() => void toggle('liked')}><Icon name='heart' active={value?.liked} /><Text>{value?.liked ? '已赞' : '点赞'} {value?.count ?? count}</Text></Button><Button className='reaction-button' disabled={!!auth && !ready} onClick={() => void toggle('favorite')}><Icon name='bookmark' active={value?.favorite} /><Text>{value?.favorite ? '已收藏' : '收藏'}</Text></Button><Button className='reaction-button' openType='share'><Icon name='share' /><Text>分享</Text></Button></View>{error && <Text className='link' onClick={() => void load()}>互动状态加载失败，点击重试</Text>}</View>
}
