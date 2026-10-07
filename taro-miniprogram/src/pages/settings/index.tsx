import Taro from '@tarojs/taro'
import { View, Text, Button } from '@tarojs/components'
import { Screen, Heading, Menu } from '../../components/ui'
import { themeMode, setTheme, type ThemeMode, useTheme } from '../../core/theme'
import { useSession, setSession } from '../../core/session'
import { cache } from '../../core/cache'
import { api } from '../../core/api'
import { go } from '../../core/navigation'
export default function Settings() {
  const auth = useSession(); useTheme()
  async function logout() {
    const r = await Taro.showModal({ title: '退出登录？', content: '退出会撤销该账号所有设备的刷新令牌。本机投稿草稿仍保留。' })
    if (!r.confirm) return
    try { await api('/auth/logout', 'POST') } catch { Taro.showToast({ title: '已清除本机登录，远端退出未确认', icon: 'none' }) } finally { setSession(null) }
  }
  return <Screen><View className='brand'>设置</View><Heading>外观</Heading><View className='panel'>{([['system', '跟随系统', 'cog'], ['light', '浅色模式', 'sun'], ['dark', '深色模式', 'moon']] as [ThemeMode, string, string][]).map(([mode, title, icon]) => <Menu key={mode} icon={icon} title={title} note={themeMode() === mode ? '已选择' : undefined} onClick={() => setTheme(mode)} />)}</View><Heading>账号与存储</Heading><View className='panel'>{auth && <Menu icon='lock' title={auth.user.canSetCredentials ? '设置用户名和密码' : '修改密码'} onClick={() => go('profile', { mode: auth.user.canSetCredentials ? 'setup' : 'password' })} />}<Menu icon='refresh' title='清理阅读缓存' note='保留投稿草稿' onClick={() => { cache.clear(); Taro.showToast({ title: '缓存已清理', icon: 'success' }) }} /></View><Heading>关于成为全栈</Heading><View className='panel'><Text>这是一个全栈开发教学项目。小程序与网站、APP 共用内容及会员账号。</Text><View className='space' /><Text className='muted'>本地保存登录会话、外观偏好和搜索历史；投稿草稿按账号独立保存。清理阅读缓存不会删除草稿。请勿在共享设备上保留敏感草稿。

当前以微信开发者工具关闭域名校验运行作为教学验收，不代表已满足正式上架要求。外部网页可复制链接后打开。</Text></View>{auth && <Button className='button danger' onClick={() => void logout()}>退出登录</Button>}<View className='footer'>成为全栈 · 小程序 0.1.0</View></Screen>
}
