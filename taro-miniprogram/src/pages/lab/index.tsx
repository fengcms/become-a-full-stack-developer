import { useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Input, Text, Textarea, View, RichText, ScrollView } from '@tarojs/components'
import { API, request, login, refresh, forget, upload } from '../../services/lab'

// 此页是技术验证台，不是待确认的产品首页；结果必须由真实操作产生。
export default function Lab() {
  const [result, setResult] = useState('尚未执行验证')
  const [busy, setBusy] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [draft, setDraft] = useState('')
  const [writeAllowed, setWriteAllowed] = useState(false)
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    try { setResult(JSON.stringify(await action(), null, 2)) }
    catch (error) { setResult(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  return <View className='page'>
    <View className='panel'>
      <View className='title'>M5 · 技术验证台</View>
      <Text className='muted'>仅开发者工具验收 · 请关闭域名校验\n{API}\n当前为游客 AppID，微信身份认证尚未接入。</Text>
      <Button disabled={busy} onClick={() => run(() => request('/articles?page=1&pageSize=3'))}>读取线上文章（只读）</Button>
      <Button disabled={busy} onClick={() => run(() => request('/categories/tree'))}>读取分类（只读）</Button>
      <View className='output'>{result}</View>
    </View>
    <View className='panel'>
      <View className='title'>测试账号与上传</View>
      <Text className='muted'>手动使用测试账号；上传会在服务端创建附件。凭据仅在本页会话内存中保存，不展示 Token。</Text>
      <Input placeholder='测试账号' value={username} onInput={e => setUsername(e.detail.value)} />
      <Input placeholder='密码' password value={password} onInput={e => setPassword(e.detail.value)} />
      <Button disabled={busy || !username || !password} onClick={() => run(async () => { await login(username, password); setPassword(''); return '账号登录成功' })}>验证账号登录</Button>
      <Button disabled={busy} onClick={() => run(async () => { await refresh(); return '刷新成功（凭据不显示）' })}>验证刷新</Button>
      <Button onClick={() => { forget(); setPassword(''); setResult('本机内存凭据已清除，未调用服务端全端退出') }}>清除本机凭据</Button>
      <Button onClick={() => setWriteAllowed(!writeAllowed)}>{writeAllowed ? '禁止测试上传' : '我确认使用测试账号，允许上传测试图片'}</Button>
      <Button disabled={busy || !writeAllowed} onClick={() => run(upload)}>选择图片并上传</Button>
    </View>
    <View className='panel'>
      <View className='title'>排版与草稿基础验证</View>
      <Text className='muted'>下面仅验证 rich-text 与横向滚动；完整 Markdown、高亮和目录仍需后续专项验证。</Text>
      <RichText nodes='<h3>中文标题与链接</h3><p>正文 <strong>强调文字</strong>、长文本和表格需要进一步验收。</p>' />
      <ScrollView scrollX><View style={{width:'900px',whiteSpace:'pre'}}>const message = "验证横向代码区域，不代表高亮已完成";</View></ScrollView>
      <Textarea maxlength={-1} placeholder='输入长文本草稿' value={draft} onInput={e => setDraft(e.detail.value)} />
      <Button onClick={() => run(async () => { await Taro.setStorage({key:'m5.lab.draft.v1',data:draft}); return '验证草稿已保存（与正式会员草稿隔离）' })}>保存本机验证草稿</Button>
      <Button onClick={() => run(async () => { const r = await Taro.getStorage({key:'m5.lab.draft.v1'}); setDraft(String(r.data)); return '已恢复草稿' })}>恢复草稿</Button>
      <Button onClick={() => run(async () => { await Taro.removeStorage({key:'m5.lab.draft.v1'}); setDraft(''); return '验证草稿已清除' })}>清除验证草稿</Button>
    </View>
  </View>
}
