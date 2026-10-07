import { PropsWithChildren } from 'react'
import { View, Button, Text } from '@tarojs/components'
import { useSession } from '../core/session'
import { go } from '../core/navigation'
export function Private({ children }: PropsWithChildren) {
  const auth = useSession()
  if (!auth) return <View className='panel center'><View className='section-title'>登录后继续</View><Text className='muted'>你的阅读、收藏和创作，都在这里</Text><Button className='button' onClick={() => go('auth')}>登录 / 注册</Button></View>
  return <View key={auth.user.id}>{children}</View>
}
