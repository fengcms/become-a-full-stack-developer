import { View, Text, Button } from '@tarojs/components'
import { Screen, Avatar, Heading, Menu } from '../../components/ui'
import { useSession } from '../../core/session'
import { go } from '../../core/navigation'
import { useResource } from '../../hooks/data'
export default function Member() {
  const auth = useSession(), unread = useResource<{ count: number }>(auth ? '/me/notifications/unread-count' : '', true)
  return <Screen><View className='brand'>我的</View><View className='panel'><View className='row'><Avatar src={auth?.user.avatar} name={auth?.user.nickname} /><View className='grow'><View className='section-title'>{auth?.user.nickname || auth?.user.username || '欢迎来到成为全栈'}</View><Text className='muted'>{auth ? `Lv.${auth.user.level} · 一起记录技术成长` : '登录后收藏文章、参与讨论和投稿'}</Text></View></View>{!auth && <Button className='button' onClick={() => go('auth')}>登录 / 注册</Button>}</View>
    {auth?.user.canSetCredentials && <View className='banner' onClick={() => go('profile', { mode: 'setup' })}><View className='bold'>设置用户名和密码 →</View><Text>在网站和 APP 登录同一个账号</Text></View>}
    <Heading>我的阅读</Heading><View className='panel'><Menu icon='bookmark' title='我的收藏' onClick={() => go('collection', { kind: 'favorites' })} /><Menu icon='heart' title='我的点赞' onClick={() => go('collection', { kind: 'likes' })} /><Menu icon='clockback' title='阅读历史' onClick={() => go('collection', { kind: 'history' })} /></View>
    <Heading>创作与账号</Heading><View className='panel'><Menu icon='pen' title='我的文章' note='草稿与投稿' onClick={() => go('my-articles')} /><Menu icon='plus' title='写一篇文章' onClick={() => go('editor')} /><Menu icon='bell' title='消息通知' note={unread.data?.count ? `${unread.data.count} 条未读` : undefined} onClick={() => go('notifications')} /><Menu icon='user' title='个人资料' onClick={() => go('profile')} /><Menu icon='cog' title='设置' onClick={() => go('settings')} /></View><View className='footer'>成为全栈 · 每一步都算数</View>
  </Screen>
}
