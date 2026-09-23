# 成为全栈·React 管理后台篇·Markdown 编辑器：预览、暗色主题与连续图片粘贴

> 把 Markdown 编辑器渲染出来并不难。真正决定它能否用于写作的，是受控值、异步上传、光标位置、连续操作和响应式布局之间能不能保持一致。

![成为全栈·React 管理后台篇·Markdown 编辑器：预览、暗色主题与连续图片粘贴](https://i-blog.csdnimg.cn/direct/fe7a8bd8370b44cdb123aa60690fa17b.png)

## 前言

这个后台接入 `@uiw/react-md-editor` 后，很快就有了工具栏、左侧编辑和右侧预览。表面上，最复杂的正文输入已经完成。

直到我连续粘贴两张图片，并在上传期间继续打字。第一张图上传完成后插入正文，第二张图回来时却基于旧 value 重新拼接，把刚才输入的文字和第一张图片一起覆盖掉。有时图片顺序还会颠倒。单次上传测试全部正常，真实写作才暴露问题。

第三方编辑器的难点通常不在组件 API，而在它怎样进入现有表单、主题、上传和导航生命周期。本篇就以这个问题为中心，拆解一套可以实际写长文的 Markdown 编辑器。

## 本文要解决什么

- 为什么编辑器要保持受控，同时保留最新值 ref。
- 连续粘贴和拖拽图片怎样按顺序上传与插入。
- 光标位置和异步返回之间有哪些不可避免的取舍。
- 上传活动怎样阻止表单过早保存或离开。
- 实时预览、暗色主题和窄屏布局如何融入后台。

前置阅读：[文件上传：R2 / 本地磁盘双实现与签名直传](https://blog.csdn.net/fungleo/article/details/164453365)、[表单页范式：校验、数据回填与未保存保护](https://blog.csdn.net/fungleo/article/details/165986069)

## 第三方编辑器先收成一个普通表单字段

业务表单不应该知道编辑器内部命令、textarea ref 或预览模式。对外接口保持最普通的受控组件形状：

```ts
export interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  minHeight?: number
  height?: number
  articleId?: number
  disabled?: boolean
  className?: string
}
```

React Hook Form 只需要传入 field.value 和 field.onChange，正文仍然是一段符合后端契约的 Markdown 字符串。上传、拖拽和主题适配都封装在编辑器内部。

为什么坚持受控？文章正文还要参与 dirty 判断、离开保护、校验和最终 payload。若编辑器私下维护一份内容，表单看到的值可能落后，保存时就会丢掉最后几次输入。

但只依赖 props value，又不足以处理异步上传。

## 异步上传会捕获一个过期的正文

设想初始内容为 A，用户粘贴图片开始上传，随后继续输入得到 B。上传回调创建时闭包捕获的是 A；如果完成后执行：

```ts
// ❌ 上传完成时 value 可能早已过期
onChange(value + `![image](${url})`)
```

结果会从 A 生成“A + 图片”，把 B 覆盖掉。React 重新渲染虽然会传入新 value，但已经在等待的异步函数不会自动换掉它捕获的变量。

当前实现用 ref 始终保存最新正文和最新回调：

```ts
const latest = useRef(value)
latest.current = value

const change = useRef(onChange)
change.current = onChange
```

插入时读取 `latest.current`，并在通知父表单之前立即更新它：

```ts
const insertAtCursor = (snippet: string) => {
  const textarea = editorRef.current?.textarea
  const current = latest.current
  const start = textarea?.selectionStart ?? current.length
  const end = textarea?.selectionEnd ?? current.length
  const next = current.slice(0, start) + snippet + current.slice(end)

  latest.current = next
  change.current(next)
}
```

立即写 ref 很关键。React 状态更新到下一次渲染之间，另一张图片可能已经上传完成；如果等待 props 回传，第二次插入仍可能读到旧值。

![异步插图时序](https://i-blog.csdnimg.cn/direct/01396e5c0130436796140d063c836778.png)

## 上传队列解决顺序问题

用户一次粘贴多张图，或者在第一次上传未结束时再次粘贴。如果所有任务并发执行，较小的第二张图可能先返回，正文中的顺序就与用户选择顺序不同。

项目用 Promise 链形成一个轻量队列：

```ts
const queue = useRef(Promise.resolve())

const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
  const files = Array.from(event.clipboardData?.files ?? [])
  if (files.length === 0) return

  event.preventDefault()
  queue.current = queue.current.then(() => handleFiles(files))
}
```

拖拽复用同一条队列。每批文件内部也逐张 await：

```ts
for (const file of images) {
  try {
    const url = await upload(file)
    insertAtCursor(`\n![${file.name || 'image'}](${url})\n`)
  } catch (error) {
    toast.error(error, '图片上传失败，请重试')
  }
}
```

单张失败只提示，不中断后续文件。否则第一张格式错误，后面五张合法图片都会被连带取消。

这里选择顺序稳定，而不是最高上传吞吐。文章编辑一次通常只有少量图片，正文顺序比节省几秒更重要。素材管理器一次上传几十张时，应该使用有并发上限的任务池，再单独维护排序。

## 光标位置是一个真实的产品取舍

图片上传可能需要几秒。在这期间，用户把光标移到另一段继续输入。上传完成时，图片应该插入最初粘贴的位置，还是当前光标位置？

当前实现选择完成时的当前 selection；若拿不到 textarea，则追加到末尾。插入后通过 animation frame 恢复焦点并把光标放到图片语法之后：

```ts
const position = start + snippet.length
requestAnimationFrame(() => {
  textarea?.focus()
  textarea?.setSelectionRange(position, position)
})
```

这个选择适合当前后台，但不完美。若要严格保留粘贴位置，需要在任务入队时保存 selection，并在其前方文本变化后计算偏移；多次并发编辑会把问题变成简化版协同编辑。

更稳妥的高级方案，是粘贴时先插入唯一占位符，上传完成后只替换那个占位符。这样位置稳定，用户也能看到上传中的标记。当前项目规模下，顺序队列加最新值已经解决主要数据覆盖问题，后续可以按真实反馈升级。

## 上传校验要在发请求之前完成

客户端先检查文件类型和 10MB 上限：

```ts
export const validateImage = (
  file: Pick<File, 'type' | 'size'>,
): void => {
  if (!file.type.startsWith('image/')) {
    throw new ImageValidationError('请选择图片文件')
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new ImageValidationError('图片不能超过 10MB，请压缩后重试')
  }
}
```

这能更快给出可理解的反馈，也避免浪费上传流量。但 MIME 与体积仍必须由后端再次校验；浏览器提供的文件信息可以被伪造，前端校验只是体验层。

拖拽时也只在 dataTransfer 类型包含 Files 时阻止默认行为，普通文本拖拽仍由编辑器处理。落下图片后及时关闭 dragging 高亮，失败时也不会让界面一直保持“可投放”状态。

## 上传状态必须进入整个表单的 busy 判断

编辑器知道自己是否上传中，但页面还可能有封面上传、头像上传等其他任务。若每个组件只控制自己的按钮，文章页面可能在正文图片尚未返回时允许保存。

`UploadScope` 用计数器汇总一个表单内的上传任务：

```ts
const begin = useCallback(() => {
  setCount((count) => count + 1)
  let finished = false

  return () => {
    if (finished) return
    finished = true
    setCount((count) => Math.max(0, count - 1))
  }
}, [])
```

每个上传开始时获得一个只可释放一次的 finish 函数。计数大于 0 时，表单禁用保存并阻止离开。使用 boolean 不够，因为两个上传并发时，先完成的任务会把它改成 false，掩盖另一个仍在进行的任务。

异步上传与批量任务的统一交互，会在 M2-15 继续展开。

## 实时预览要服从屏幕空间

宽屏下左写右预览非常有价值，Markdown 结构错误可以立即发现。手机或窄窗口强行对半分，每栏只剩很窄一条，写作和预览都不可用。

项目监听 640px 断点：

```ts
export const useCompactEditor = () => {
  const [compact, setCompact] = useState(
    () => window.matchMedia('(max-width: 639px)').matches,
  )

  useEffect(() => {
    const media = window.matchMedia('(max-width: 639px)')
    const update = () => setCompact(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return compact
}
```

然后让编辑器在宽屏使用 `live`，窄屏使用 `edit`。移动端优先把正文写完，需要预览时再主动切换，比永远保留两栏更实用。

![宽窄屏编辑器](https://i-blog.csdnimg.cn/direct/e9899e9bef064f88983d99b3ce84b3c0.png)

## 暗色主题和高度也要穿透第三方组件

应用使用 class 主题，编辑器自己的预览样式却通过 `data-color-mode` 决定颜色。如果只让外层背景变暗，编辑区仍是白色，代码高亮也会与全站冲突。

```tsx
<MDEditor
  preview={compact ? 'edit' : 'live'}
  value={value}
  onChange={(next) => {
    latest.current = next ?? ''
    onChange(next ?? '')
  }}
  data-color-mode={resolvedTheme === 'dark' ? 'dark' : 'light'}
/>
```

高度还有一个细节：显式传入 height 时，minHeight 也要设为同值。否则第三方库默认的 420px 最小高度会在矮窗口里顶破容器，压住底部保存栏。集成组件不能只看默认桌面截图，还要在矮屏、窄屏和主题切换时检查它自己的内部约束。

只读预览则使用同一套 Markdown renderer，保持编辑与展示语义一致，并给容器透明背景以继承后台主题。

## 安全边界：预览不是无条件信任内容

Markdown 最终来自用户输入。是否允许原始 HTML、链接协议怎样过滤、图片来源是否受限，都需要由渲染器配置和后端内容策略共同决定。不能因为内容来自“管理后台编辑者”就默认永远可信，账号被盗或复制外部内容都可能带来风险。

本篇聚焦编辑状态和上传一致性；正式面向读者的渲染端还应单独验证 XSS 清洗、外链属性、代码高亮体积和超长内容性能。

## 小结

一个能显示工具栏的编辑器，离“可以放心写文章”还有很远。受控值让表单掌握正文，latest ref 避免异步回调用旧内容覆盖新输入，上传队列保证插图顺序，计数器把上传状态提升到表单边界，响应式模式和主题适配则让第三方组件真正进入应用。

各位看官，验证编辑器时，请不要只粘一张图然后等待。连续粘贴两批图片，在上传期间继续打字、移动光标、切换暗色主题并缩窄窗口。内容、顺序和操作状态都保持可信，集成才算完成。

## 延伸阅读

- [文件上传：R2 / 本地磁盘双实现与签名直传](https://blog.csdn.net/fungleo/article/details/164453365)
- [表单页范式：校验、数据回填与未保存保护](https://blog.csdn.net/fungleo/article/details/165986069)
- [异步交互的一致性：上传、批量操作与部分失败](https://blog.csdn.net/fungleo/article/details/166354291)

---

如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)
