# 成为全栈·Flutter App 篇·Flutter 缓存：fresh、stale、expired 与账号边界

> 缓存不是“有数据就返回”。同一份旧数据可能仍能帮助用户阅读，也可能已经不能展示；公开文章与会员信息更不能共享一套持久化策略。

{{IMG:M4-23-封面}}

## 本文目标

讲解 APP 的内存/磁盘缓存层级、新鲜与过期语义、公开/私有资源边界，并说明有限离线复用和完整离线阅读的区别。

## 前置知识

熟悉 Repository、HTTP Cache-Control 与 Flutter 生命周期。实现位于 `core/cache/data_cache.dart`、`blob_store.dart`、`features/data/cache_policy_table.dart` 和 `repository.dart`。

## 新鲜、陈旧、过期不是三个颜色

新鲜（fresh）意味着在资源策略 TTL 内可直接复用；陈旧（stale）意味着可先显示同时后台校验；硬过期（expired）则不能无限当作有效数据，具体行为取决于资源重要性和错误类型。用户主动强刷应尝试最新值，但失败时可保留仍有阅读价值的旧内容。

```text
fresh → 直接返回
stale → 返回旧值 + 后台 revalidate
expired → 请求服务端；按策略决定是否保留旧画面
```

这套语义不等同于浏览器默认 HTTP cache；项目 Cache-Control 解析还尊重 no-store/no-cache、private 和更短 max-age。

{{IMG:M4-23-缓存层}}

## 公开与私有缓存不能混用

匿名公开文章、分类和标签可按预算保存内存/磁盘；会员展示数据只在当前会话内存短时复用；稿件编辑和私有预览实时读取。公开正文与服务端 TOC 需要成组版本校验，防止正文更新而目录仍旧。

```text
public GET → bounded memory + disk
private member data → account/session scoped memory
draft/editor/private preview → live request
```

## 请求合并与代次保护

相同资源同时被多个 Widget 请求时，DataCache 合并相同 in-flight 请求，避免重复访问。强刷或写操作开始后，缓存代次前进；旧请求即使迟到，也不能覆盖新结果。网络失败保留有用 stale 内容；权限拒绝或 404 应移除旧内容，防止已撤下资源无限显示。

## 有限离线体验不等于完整离线功能

首次访问需要联网填充。缓存只允许复用曾访问、仍在可用策略范围内的公开内容；没有下载中心、离线写操作队列，也没有冲突同步。服务端撤下文章后，客户端离线期间无法瞬时获知撤回。

公开 JSON 文件预算 30MB、正文最多 100 篇等上限记录于项目文档；这些是缓存子系统预算，不代表整个 APP 内存上限。系统可随时清理缓存目录，不能拿来存放用户原创数据。

## 缓存策略表比页面里的 if 更容易审计

将资源分类、TTL、落盘许可和写后失效集中表达，能避免页面自己猜数据是否安全缓存：

```text
resource       ttl       disk   identity       invalidated by
categories     short     yes    public         category write
article        bounded   yes    public         article update/delete
memberOverview short     no     account+epoch  profile/session change
privatePreview none      no     account+epoch  always fetch
```

这是设计表的示例，具体 TTL 和上限应以 `CachePolicyTable`、`CacheLimits` 与验收文档为准。API 响应的 `private`/`no-store` 必须压低客户端复用级别，客户端不能因自己的策略想缓存就覆盖服务端约束。

## 小结

Flutter 缓存需要明确定义新鲜度、失效行为、身份范围和容量预算。公开内容可以有限落盘，私有数据按会话内存隔离，编辑数据走实时请求；陈旧显示是产品承诺，完整离线同步则是另一类功能，当前并未实现。

## 延伸阅读

- [列表分页与下拉刷新]({{LINK:M4-12}})
- [写后缓存失效与图片缓存治理]({{LINK:M4-24}})
- [数据获取与缓存：60 秒再验证背后发生了什么]({{LINK:M3-04}})

---

如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->

## 发布辅助信息

### 文章 Tag（6 个）

`Flutter`、`缓存策略`、`离线阅读`、`Cache-Control`、`数据一致性`、`全栈开发`

### 文章简介（250 字以内）

Flutter 缓存要区分 fresh、stale 和 expired，并按公开内容、会员数据和用户稿件设置不同持久化边界。本文结合 DataCache、磁盘 blob 与 Repository 说明请求合并、迟到响应保护、撤下内容清理和有限离线复用，澄清当前不支持离线下载和写入同步。

### 建议发布分类

全栈开发 / Flutter

### 封面短标题

缓存不是有数据就返回

### 配图 AI 提示词

1. `M4-23-封面`：16:9 中文技术封面，fresh/stale/expired 三阶段时间轴，公开数据磁盘、私有数据会话内存、稿件实时请求三类边界，深蓝青绿。
2. `M4-23-缓存层`：16:9 多层缓存图，Repository、DataCache 内存、BlobStore 磁盘、网络 API，以及失效代次和会话隔离路径。

### 发布前核对

- [ ] 替换 2 处配图占位符
- [ ] M4-12、M4-24、M3-04 发布后回填站内链接
- [ ] 容量/TTL 数值逐项和 14-缓存优化文档核对
- [ ] 已删除本辅助区
