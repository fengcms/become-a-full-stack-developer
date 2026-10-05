# 成为全栈·Flutter App 篇·Flutter 缓存：fresh、stale、expired 与账号边界

用户在地铁里打开一篇之前读过的文章，网络刚好断了。缓存能让这次阅读继续，但不能因此承诺整本专栏都可离线，也不能把会员草稿当作公开内容落盘。

这篇直接读 `DataCache.get()` 和 `CachePolicyTable`，解释 fresh、stale、maxAge、磁盘策略及请求代次，并说明当前缓存真正能覆盖的场景。

{{IMG:M4-23-封面}}

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

## 读取缓存时服务端响应头可以收紧策略

客户端策略表决定允许缓存哪些资源；服务端 Cache-Control/Age 再限制数据的复用。`no-store` 不落盘也不保留为复用项；`private` 不进入公共磁盘；更短 `max-age` 覆盖更长客户端 fresh 窗口。响应头处理在数据入口集中完成，避免每个页面忘记尊重服务器策略。

当前实测中某一个生产分类响应没有观察到 ETag、Last-Modified 或 Cache-Control，所以工程不宣称实现 ETag/304 条件请求。没有观察到一个端点的 header，不能推断所有路径永远都没有；因此缓存仍有自己的 TTL 和写后失效保护。

## 请求合并和磁盘恢复要遵循同一代次

DataCache 对同 key 的并发网络读取共享 `_flights` Future；命中 stale 数据时立即返回旧值并启动后台更新。若中途强刷、写后 fence、清理缓存或切换会话，资源 version/全局 epoch 更新；磁盘读取完成后也必须再次核对，否则清理后旧文件可能重新进内存。

```text
cache key + current version
→ disk/memory lookup
→ fetch future shared by key
→ before install compare epoch and version
→ stale result throws CacheSuperseded
```

这是并发正确性机制，不单是速度优化。`CacheSuperseded` 对页面不应当作网络错误提示；它表示另一个更新已获胜，页面可等待新状态或忽略该响应。


## 贴着工程代码读实现

下面这段节选自 `flutter-app/lib/core/cache/data_cache.dart 第 130–202 行`（保留原始实现；为突出主线省略了文件其余部分）。读代码时可以顺着调用链确认：将时间推进到 fresh、stale、expired 三段，观察前台响应和后台刷新。这里关注的是它如何改变数据流，而不只是记住一个 API 名称。

```dart
  Future<dynamic> get(
    String key,
    CachePolicy policy,
    Future<CacheReply> Function() fetch, {
    bool force = false,
    Set<String> tags = const {},
    bool Function(Object)? forbidden,
  }) async {
    _keyTags[key] = tags;
    if (_keyTags.length > CacheLimits.trackedKeys) {
      for (final old in _keyTags.keys.toList()) {
        if (_keyTags.length <= CacheLimits.trackedKeys) break;
        if (old != key &&
            !_entries.containsKey(old) &&
            !_flights.containsKey(old)) {
          _keyTags.remove(old);
          _versions.remove(old);
        }
      }
    }
    if (force && _flights.containsKey(key) && !_forced.contains(key)) {
      _versions[key] = Object();
      _flights.remove(key);
    }
    if (force) _forced.add(key);
    // 磁盘读取也必须检查代际，否则清理完成后旧磁盘读会重新填回内存。
    final startEpoch = _epoch, version = _version(key);
    var entry = _entries[key];
    if (!force && entry == null && policy.disk) {
      final bytes = await disk.read(key);
      if (_epoch != startEpoch || (_version(key)) != version) {
        throw CacheSuperseded();
      }
      if (bytes != null) {
        try {
          entry = CacheEntry.fromJson(
            Map<String, dynamic>.from(jsonDecode(utf8.decode(bytes)) as Map),
          );
          _put(key, entry);
          count('diskHit');
        } catch (_) {
          unawaited(disk.removeWhere((k, _) => k == key));
        }
      }
    }
    entry = _entries[key] ?? entry;
    if (!force &&
        entry != null &&
        now().difference(entry.saved) < entry.maxAge) {
      _put(key, entry);
      if (now().difference(entry.saved) < entry.fresh) {
        count('freshHit');
        return entry.value;
      }
      // 返回可用旧值并启动后台更新；后台失败通过事件通知页面。
      count('staleHit');
      unawaited(
        _fetch(
          key,
          policy,
          fetch,
          tags,
          forbidden,
        ).catchError((Object _) => null),
      );
      return entry.value;
    }
    if (entry != null && now().difference(entry.saved) >= entry.maxAge) {
      _entries.remove(key);
    }
    count('miss');
    return _fetch(key, policy, fetch, tags, forbidden);
  }
```

## 把容易出错的路径走一遍

我会用这个场景做一次可复现排查：**把 stale 数据当作 fresh 返回，用户长期看不到服务端更新**。先将时间推进到 fresh、stale、expired 三段，观察前台响应和后台刷新；如果把问题定位在“单一 TTL”，修正方向是“按策略区分立即返回、后台 revalidate 与必须联网读取”。最后再验证正常路径没有退化，并把边界条件留在自动化检查里。

| 方案比较 | 简化做法 | 当前实现/推荐做法 |
|---|---|---|
| 本文核心选择 | 单一 TTL | 三级新鲜度 |
| 错误处理 | 失败后清空或静默忽略 | 保留可恢复状态，给出明确反馈 |
| 验证方式 | 只检查成功结果 | 注入边界条件并检查回归 |

| 排错步骤 | 要观察什么 | 通过条件 |
|---|---|---|
| 复现 | 把 stale 数据当作 fresh 返回，用户长期看不到服务端更新 | 可以稳定触发或明确构造该输入 |
| 定位 | 将时间推进到 fresh、stale、expired 三段，观察前台响应和后台刷新 | 找到责任层和状态归属 |
| 修正 | 按策略区分立即返回、后台 revalidate 与必须联网读取 | 失败不污染后续页面或账号 |

## 小结

Flutter 缓存需要明确定义新鲜度、失效行为、身份范围和容量预算。公开内容可以有限落盘，私有数据按会话内存隔离，编辑数据走实时请求；陈旧显示是产品承诺，完整离线同步则是另一类功能，当前并未实现。

## 延伸阅读

- [列表分页与下拉刷新]({{LINK:M4-12}})
- [写后缓存失效与图片缓存治理]({{LINK:M4-24}})
- [数据获取与缓存：60 秒再验证背后发生了什么](https://blog.csdn.net/fungleo/article/details/166784128)

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
