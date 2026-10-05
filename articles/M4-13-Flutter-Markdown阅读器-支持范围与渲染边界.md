# 成为全栈·Flutter App 篇·Flutter Markdown 阅读器：支持范围与渲染边界

Markdown 页面在电脑上看正常，放进手机后才会暴露横向表格、长代码、超大图片和深色主题的问题。更麻烦的是，阅读器还有目录跳转，不能只关注文本能不能渲染出来。

这篇先把正文中的代码块、图片和表格组件拆开，给出 `flutter_markdown_plus` 在项目里的真实扩展代码；目录与服务端 anchor 的绑定留到下一篇深入讨论。

{{IMG:M4-13-封面}}

## 同一份 Markdown 不代表同一种渲染环境

Web 浏览器拥有 DOM、CSS 和成熟的滚动锚点；Flutter 将 Markdown 节点转换为 Widget，没有完整 HTML 浏览器语义。项目使用 `flutter_markdown_plus` 的 GFM 能力，再针对代码块、图片和表格提供自定义样式。

正文主线优先：标题、段落、引用、列表、行内代码、围栏代码、表格和图片都需在浅/深色主题可读。原始 HTML 不应被无条件执行或信任；服务端内容仍是外部输入。

{{IMG:M4-13-渲染组件}}

## 代码块需要适合窄屏

桌面代码块常横向铺满，手机屏幕宽度有限。Flutter 阅读器保留代码可横向滚动并提供复制操作；语法高亮 token 缓存有界，颜色由当前主题生成。私有编辑正文不进入公开 token 缓存，避免将草稿文本留在全局缓存中。

```text
长代码行 → 横向滚动
复制操作 → Clipboard
颜色切换 → 根据主题重新映射 token
```

代码块不应参与 Markdown 标题解析；更不能把围栏中的 `# 标题` 消耗成文章目录项。

## 表格和图片要尊重移动视口

表格可能超过设备宽度，外层需要横向滚动而非裁切整篇正文。图片按显示宽度解码，提供占位和失败状态；公开图片按容量策略缓存，带签名/查询参数及私有图片采取更保守策略。Markdown 里的图片 URL 也不能默认安全或永久公开。

外链在 APP 内打开时进入 WebView 页面，外部地址可经系统浏览器打开；认证 token 不注入网页。WebView 的浏览历史与 Flutter 路由返回栈必须分别理解。

## 主题和长内容验收

深色模式需要覆盖正文、引用、代码、表格边线、链接和图片占位。用短文章截图不能覆盖真实长文；应选含重复标题、代码、表格、Setext 标题和多张图片的文章检查滚动与断行。

## 把 Markdown 渲染当作一组可测试规则

文章来源可以含有代码围栏、标题、链接和图片。渲染器扩展时需要同时约束外部输入、布局和缓存：

```dart
MarkdownBody(
  data: source,
  selectable: true,
  builders: {
    'code': CodeBlockBuilder(theme: theme),
    'table': HorizontalTableBuilder(),
  },
  imageBuilder: buildReaderImage,
)
```

此段是结构示意，真实包的 builder 接口必须以锁定版本文档和 `reader_markdown.dart` 为准。更重要的是为真实文章构造测试样本：围栏中的 `#` 不成为目录项、窄屏表格能横向滚动、长代码可复制、暗色链接仍有对比度、加载图片失败后正文其余内容继续显示。

Markdown 原文可能很长，语法高亮也会消耗 CPU。项目对公开 token 结果采用有界缓存并以主题生成颜色；编辑中的私有文本不进入全局缓存，避免在用户切换或退出后继续留下私有内容。

## 主题切换会影响解析结果缓存键

代码 token 只与源码有关吗？高亮颜色还依赖主题，因此缓存可以存储语法 token，而在构建 UI 时按当前亮/暗色映射样式；如果直接缓存带旧主题颜色的 Widget，切换主题后会显示错色。项目通过有界 `CodeCache` 保存公开代码的词法结果，Theme 更新会让显示样式重新解析。

`ReaderMarkdown` 还观察 `MediaQuery.textScaler` 并在依赖变化时失效已缓存 body；这意味着大字号不仅改变 Text 样式，也可能改变段落布局和表格宽度。缓存 Widget 必须考虑依赖主题、目录 key 和字号，不是“content 没变就永不重建”。

## 渲染缓存要同时考虑隐私和重建输入

项目的 `ReaderMarkdown` 根据正文、heading key、公开图片策略和主题构造 body；`didChangeDependencies` 观察 Theme 与 textScaler，`didUpdateWidget` 在内容或定位 key 改变时让 body 失效。它缓存的是当前组件范围内的构建结果，不代表任意文章内容都永久驻留。

代码 token 缓存则单独限制 entry 数量和总字符数，只缓存公开正文的语法树，不缓存主题颜色、Widget 或目录 key。切换账号时清空 token cache，私有投稿预览关闭公开图片缓存和词法缓存。这些分层说明“缓存 Markdown”不是一种单一操作，必须区分解析产物、绘制组件和网络图片。


## 贴着工程代码读实现

下面这段节选自 `flutter-app/lib/core/markdown/reader_markdown.dart 第 23–79 行`（保留原始实现；为突出主线省略了文件其余部分）。读代码时可以顺着调用链确认：使用重复标题、不同级别标题和缺失目录项检查 id 映射。把这几步连起来，才看得到数据如何从服务边界走到界面。

```dart
class ServerHeadingSyntax extends md.HeaderSyntax {
  ServerHeadingSyntax(this.toc);
  final List<ApiTocItem> toc;
  int cursor = 0;
  Object? document;
  @override
  md.Node parse(md.BlockParser parser) {
    if (!identical(document, parser.document)) {
      cursor = 0;
      document = parser.document;
    }
    final raw = parser.current.content;
    final node = super.parse(parser) as md.Element;
    final match = RegExp(r'^(#{1,6})\s+(.+?)\s*#*\s*$').firstMatch(raw);
    if (match != null && cursor < toc.length) {
      final item = toc[cursor];
      if (item.level == match[1]!.length && item.text == match[2]!.trim()) {
        node.attributes['reader-anchor'] = item.anchor!;
        cursor++;
      }
    }
    return node;
  }
}

class _HeadingBuilder extends MarkdownElementBuilder {
  _HeadingBuilder(this.keys);
  final Map<String, GlobalKey> keys;
  @override
  bool isBlockElement() => true;
  @override
  Widget? visitElementAfterWithContext(
    BuildContext context,
    md.Element element,
    TextStyle? preferredStyle,
    TextStyle? parentStyle,
  ) {
    final anchor = element.attributes['reader-anchor'];
    final h2 = element.tag == 'h2';
    return Container(
      key: anchor == null ? null : keys[anchor],
      margin: EdgeInsets.only(
        top: h2 ? AppSpacing.s8 : AppSpacing.s6,
        bottom: AppSpacing.s3,
      ),
      padding: EdgeInsets.only(left: h2 ? 10 : 0),
      decoration: h2
          ? BoxDecoration(
              border: Border(
                left: BorderSide(color: context.colors.brand, width: 3),
              ),
            )
          : null,
      child: Text(element.textContent, style: preferredStyle),
    );
  }
}
```

## 把容易出错的路径走一遍

我会用这个场景做一次可复现排查：**正文标题和服务端目录匹配失准导致锚点跳到错误段落**。先使用重复标题、不同级别标题和缺失目录项检查 id 映射；如果把问题定位在“仅按标题文本”，修正方向是“结合级别与文本匹配目录项，缺失项保留可读正文而非伪造跳转”。最后再验证正常路径没有退化，并把边界条件留在自动化检查里。

| 方案比较 | 简化做法 | 当前实现/推荐做法 |
|---|---|---|
| 本文核心选择 | 仅按标题文本 | 级别与文本匹配 |
| 错误处理 | 失败后清空或静默忽略 | 保留可恢复状态，给出明确反馈 |
| 验证方式 | 只检查成功结果 | 注入边界条件并检查回归 |

| 排错步骤 | 要观察什么 | 通过条件 |
|---|---|---|
| 复现 | 正文标题和服务端目录匹配失准导致锚点跳到错误段落 | 可以稳定触发或明确构造该输入 |
| 定位 | 使用重复标题、不同级别标题和缺失目录项检查 id 映射 | 找到责任层和状态归属 |
| 修正 | 结合级别与文本匹配目录项，缺失项保留可读正文而非伪造跳转 | 失败不污染后续页面或账号 |

## 小结

跨平台 Markdown 渲染需要按移动设备设计代码、表格、图片和链接交互；主题与缓存同样影响正文。目录与标题绑定属于独立可靠性问题，不能靠自行 slug 化假设解决，下一篇专门解释这条服务端契约。

## 延伸阅读

- [服务端目录与文章辅助阅读]({{LINK:M4-14}})
- [内置 WebView：网页历史、App 返回与外链安全]({{LINK:M4-15}})
- [文章详情：Markdown 代码高亮与目录必须共享解析结果](https://blog.csdn.net/fungleo/article/details/166885283)

---

如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->

## 发布辅助信息

### 文章 Tag（6 个）

`Flutter`、`Markdown`、`GFM`、`代码高亮`、`移动阅读`、`全栈开发`

### 文章简介（250 字以内）

Flutter Markdown 阅读器需要针对窄屏重新设计代码块、表格、图片、外链与明暗主题。本文结合实际组件说明支持边界、代码 token 缓存和私有内容隔离，并指出正文标题目录必须以服务端 TOC 锚点为事实源，不能靠客户端自行 slug 化。

### 建议发布分类

全栈开发 / Flutter

### 封面短标题

Markdown 在手机上如何阅读

### 配图 AI 提示词

1. `M4-13-封面`：16:9 中文技术封面，一篇 Markdown 文章在手机上呈现代码横滑、表格横向滚动、图片和深色主题，阅读体验优先，蓝白配色。
2. `M4-13-渲染组件`：16:9 组件分解图，Markdown 文本解析为段落、代码块、表格、图片与链接 Widget，突出安全与移动视口约束。

### 发布前核对

- [ ] 替换 2 处配图占位符
- [ ] M4-14、M4-15、M3-08 发布后回填站内链接
- [ ] 核实 GFM 渲染器当前依赖版本与支持语法
- [ ] 已删除本辅助区
