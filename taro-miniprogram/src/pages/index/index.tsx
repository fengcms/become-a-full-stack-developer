import { useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Text, View } from '@tarojs/components'
import { request } from '../../services/lab'

interface ArticleList { list: { id: number; title: string }[] }

export default function Index() {
  const [articles, setArticles] = useState<ArticleList['list']>([])
  const [status, setStatus] = useState('基础工程已就绪')
  const [loading, setLoading] = useState(false)
  async function checkConnection() {
    setLoading(true)
    try {
      const data = await request<ArticleList>('/articles?page=1&pageSize=3')
      setArticles(data.list)
      setStatus('线上接口连接成功')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '请求失败，请检查网络与域名校验设置')
    } finally { setLoading(false) }
  }
  return <View className='page'>
    <View className='panel'>
      <View className='title'>成为全栈开发者</View>
      <Text className='muted'>学习、记录、分享，一起成长。</Text>
    </View>
    <View className='panel'>
      <View className='title'>小程序 · 基础工程</View>
      <View>{status}</View>
      <Button loading={loading} disabled={loading} onClick={checkConnection}>验证线上文章接口</Button>
      {articles.map(article => <View key={article.id} style={{ marginTop: '16px' }}>{article.title}</View>)}
    </View>
    <View className='panel'>
      <Text className='muted'>当前用于确认开发工具导入与运行。完整页面和微信登录将在后续开发。</Text>
      <Button onClick={() => Taro.navigateTo({ url: '/pages/lab/index' })}>打开技术验证台</Button>
    </View>
  </View>
}
