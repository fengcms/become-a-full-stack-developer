import { useMemo } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Image, ScrollView, RichText } from '@tarojs/components'
import { openLink } from '../core/navigation'
import { highlight, parseMarkdown, type MdNode } from '../core/markdown'
function Node({ node: n }: { node: MdNode }) {
  const children = n.children.map((child, i) => <Node key={i} node={child} />)
  if (n.type === 'text') return <Text selectable>{n.content}</Text>
  if (n.type === 'softbreak' || n.type === 'hardbreak') return <Text>{'\n'}</Text>
  if (n.type === 'code_inline') return <Text className='inline-code' selectable>{n.content}</Text>
  if (n.type === 'fence' || n.type === 'code_block') {
    const language = n.info.trim().split(/\s+/)[0] || 'text'
    return <View className='code-block'><View className='row between code-head'><Text>{language}</Text><Text className='link' onClick={() => Taro.setClipboardData({ data: n.content })}>复制</Text></View><ScrollView scrollX><View className='code-body'><RichText nodes={`<pre style="margin:0;white-space:pre;font-family:monospace">${highlight(n.content, language)}</pre>`} /></View></ScrollView></View>
  }
  if (n.type === 'image') {
    const src = n.attrs.src
    return /^https?:\/\//i.test(src) ? <Image className='reader-image' mode='widthFix' src={src} onClick={() => Taro.previewImage({ urls: [src], current: src })} /> : <Text>{n.content}</Text>
  }
  if (n.type === 'link_open') return <Text className='link' onClick={() => void openLink(n.attrs.href)}>{children}</Text>
  if (n.type === 'strong_open') return <Text className='bold'>{children}</Text>
  if (n.type === 'em_open') return <Text className='italic'>{children}</Text>
  if (n.type === 's_open') return <Text className='strike'>{children}</Text>
  if (n.type === 'inline') return <>{children}</>
  if (n.type === 'table_open') return <ScrollView scrollX><View className='md-table'>{children}</View></ScrollView>
  if (n.type === 'hr') return <View className='md-rule' />
  return <View id={n.id} className={`md-${n.tag || n.type}`}>{children}</View>
}
export function Markdown({ source }: { source: string }) {
  const parsed = useMemo(() => parseMarkdown(source), [source])
  return <View className='markdown'>{parsed.nodes.map((node, i) => <Node key={i} node={node} />)}</View>
}
