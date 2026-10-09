# 成为全栈·基础补充·缓存的层次与失效：浏览器、CDN、服务端、数据库

做移动端那批文章时，我被一个现象困惑了很久：

**App 明明显示"已下架"的文章，点进去还能读到完整正文。**

第一反应是接口有 bug——服务端返回了不该返回的内容。而真相更平淡：**服务端返回了，但客户端没重新去拿。** 它从本地缓存里读的。

而更让我在意的是：**这个现象在开发环境根本不会出现。** 因为开发环境几乎不缓存。

这篇讲缓存的四个层次，以及一个我在这个项目里学到的判断——**缓存不是"加速"，是"用一致性换速度"，而换多少由你决定，但要说得清楚。**

{{IMG:B-13-封面}}

## 同一个 URL，四层可能各存着一份

先建立这个概念，因为它解释了后面所有的困惑。

当你访问 `GET /articles/123`，下面四层可能各有一份数据：

| 层 | 存什么 | 谁控制 | 失效由谁决定 |
|---|---|---|---|
| **浏览器 / 客户端** | HTTP 缓存、App 本地缓存 | `Cache-Control`、客户端策略 | 服务端头 / 客户端逻辑 |
| **CDN / 反向代理** | 静态资源、偶尔 API 响应 | 边缘节点配置 | 通常靠 TTL 或 Purge |
| **应用服务器** | 内存缓存、磁盘缓存 | **你的代码** | **你的失效逻辑** |
| **数据库** | 查询计划缓存、连接池 | 数据库自己 | 数据库自己 |

**这四层的失效逻辑完全独立。** 而这个项目最有意思的一点是：

> **我在应用层写了一套完整的缓存机制，而 HTTP 层的缓存我几乎没管。**

这不是疏漏，是刻意的。理由后面讲。

## 客户端缓存：最容易制造困惑的一层

先说客户端，因为它最容易被忽略，也最容易出问题。

`Cache-Control` 决定浏览器/客户端怎么缓存：

```http
Cache-Control: max-age=300
```

意思是"5 分钟内可以不发请求"。

而这个项目在网络层做了这样的事：

```ts
Future<CacheReply> fetchCacheReply(ApiClient api, String path, {...}) async {
  String control = '';
  Duration age = Duration.zero;
  final data = await api.request(
    path,
    query: query,
    anonymous: anonymous,
    onHeaders: (headers) {
      control = headers.value('cache-control') ?? '';
      age = Duration(seconds: int.tryParse(headers.value('age') ?? '') ?? 0);
    },
  );
  return CacheReply(data, control: control, age: age);
}
```

**它把 `cache-control` 和 `age` 收集起来，交给应用层去判断。**

而应用层的处理是：

```ts
// 缓存策略只允许收紧服务端限制；Age 扣减保存时间，不重置存活期。
var fresh = policy.fresh, max = policy.maxAge;
final seconds = int.tryParse(
  RegExp(r'(?:^|,)\s*max-age\s*=\s*"?(\d+)').firstMatch(control)?.group(1) ?? '',
);
if (seconds != null) {
  final age = Duration(seconds: seconds);
  if (age < fresh) fresh = age;
  if (age < max) max = age;
}
```

**注意那个 `if (age < fresh) fresh = age;` ——只能在服务端要求更短的时候才生效。**

如果服务端说"缓存 1 小时"，而我的策略是"2 分钟"，**不会变成 1 小时**。

**这是一个主动的收紧设计。** 理由是：服务端的 `Cache-Control` 可能是针对中间代理设的，而**客户端没有理由因为服务端给得宽松就放宽自己的策略**——那意味着用户可能看到一小时前的通知，而 App 本该一分钟就更新。

顺带说 `Age` 头那个处理：

```ts
entry: CacheEntry(response.value, now().subtract(response.age), fresh, max, tags),
```

`Age` 是响应在 CDN 或代理上停留的时间。一个响应在路上花了 40 秒，那它其实已经 40 秒老了。**`now().subtract(response.age)` 让它"看起来"老了 40 秒，这样 fresh/maxAge 的判断会自动把这段路途算进去。**

而这一条如果忽略，**症状是"每份缓存数据都比配置值年轻"**——不报错，只是新鲜度实际比设定低。

## 应用层缓存：三态是这个项目的核心

现在说这个项目真正下了功夫的地方。

先看一个容易误解的地方：**"缓存"不是"有/没有"，而是三态。**

| 状态 | 条件 | 行为 |
|---|---|---|
| **fresh** | 未超过 `fresh` | 直接返回，**不发请求** |
| **stale** | 超过 `fresh` 但未超过 `maxAge` | **立刻返回旧值**，同时后台悄悄更新 |
| **expired** | 超过 `maxAge` | 删掉，必须等网络 |

看真实实现：

```ts
if (!force &&
    entry != null &&
    now().difference(entry.saved) < entry.maxAge) {
  _put(key, entry);                                  // 续期
  if (now().difference(entry.saved) < entry.fresh) {
    count('freshHit');
    return entry.value;                              // fresh：直接返回
  }
  count('staleHit');
  unawaited(_fetch(key, policy, fetch, tags, forbidden)
    .catchError((Object _) => null));                // 后台更新
  return entry.value;                                // stale：先给旧的
}
if (entry != null && now().difference(entry.saved) >= entry.maxAge) {
  _entries.remove(key);                              // expired：删掉
}
count('miss');
```

**stale 这一档是这个设计里最重要的部分。**

用户在地铁里，网络很差，App 打开了首页。这时候：

- 如果强制要网络 → **白屏或者转圈**
- 如果只用 fresh → 网络不好时拿不到任何内容
- **stale 的做法：立刻显示可能有点旧的缓存，同时后台更新**

用户感知到的是"打开很快"，而不是"等很久"。

而那个 `.catchError((Object _) => null)` 也很关键：**后台更新失败不能影响用户。** 用户已经看到内容了，后台刷新失败对他不可见。

**吞掉异常和报告失败是两件事**：前者防止后台任务崩溃，后者让界面有机会提示。而这个项目的做法是——

```dart
if (error != null)
  Text('更新失败，当前显示上次内容', style: context.text.bodySmall),
```

**在 M4 那批文章里，我把这条翻译成了界面上的三行字。** 数据层的"保留旧值"最终变成用户可见的一句话。

## 失效：比"什么时候删"更难的是"删哪些"

这是这个项目花时间最多的地方。

先看一张表，这是 M4-07 讲过的写后失效映射：

```ts
Set<String> mutationTags(String path, Object? data) => switch (family(path)) {
  ResourceFamily.reaction => {
    'reactions:${Endpoints.articleId(path)}',
    Endpoints.meLikes,
    'overview',
  },
  ResourceFamily.article || ResourceFamily.articleList => {
    CacheTags.articleBodies,
    'articleLists',
    Endpoints.meArticles,
    'overview',
    Endpoints.tags,
    Endpoints.categoriesStats,
  },
  ...
};
```

**一次点赞要失效三个键：文章自己的反应状态、我的点赞列表、会员中心的统计数字。**

而发一篇文章要失效**六个**——其中 `tags` 和 `categoriesStats` 是最容易漏的：**新文章会让标签页和分类计数变化，而这两个页面和发帖操作看起来毫无关系。**

**这就是失效映射的核心难点：不是"删掉什么"，而是"想清楚还有什么会变"。**

而这套表能成立的前提是 M4-07 讲的另一个设计——**`family(path)` 只判一次，读策略、响应校验、写后失效三处共用**。否则同一个路径在不同代码里可能被归成不同的类，失效就漏了。

## fence 和 invalidate 必须是两个动作

现在讲这个项目里最微妙的一个实现，也是"缓存和写操作正确协作"的关键。

问题场景：用户点收藏 → 缓存失效 → **同时还有一个之前发出的列表请求在路上** → 那个请求带着旧数据回来 → **把旧数据写进缓存**。

解法分两步：

```ts
/// Fence reads at mutation start; preserve visible data until its outcome.
void fence(Set<String> tags) {
  for (final key in _keyTags.keys.toList()) {
    if (_keyTags[key]!.intersection(tags).isNotEmpty) {
      _versions[key] = Object();      // 换一个新对象当哨兵
      _flights.remove(key);           // 取消同键请求复用
    }
  }
}

// 依赖标签同时清理内存和磁盘；旧网络响应已被 fence 隔断。
void invalidate(Set<String> tags) {
  fence(tags);
  for (final key in _keyTags.keys.toList()) {
    if (_keyTags[key]!.intersection(tags).isNotEmpty) {
      _entries.remove(key);
      emit(CacheEvent(key, 'invalidated'));
    }
  }
  unawaited(disk.removeWhere((_, m) => (m['tags'] as List? ?? []).any(tags.contains)));
}
```

**为什么必须拆成两个动作？**

因为**写操作可能失败**。如果 `invalidate` 一上来就把数据删了，然后写操作失败了——**用户正在看的内容没了，而他刚才的操作根本没成功。**

所以顺序是：

```dart
if (started) {
  cache.fence(affected);     // 写开始：只围栏，不删
  return;
}
if (error is SessionChanged) return;
cache.invalidate(affected);  // 写结束：真的删
```

**"围栏"和"拆墙"是两件事**：围栏隔断在途请求，拆墙才真的删除数据。而拆墙要等到确认写成功了。

而 `_versions[key] = Object()` 这个哨兵实现很巧：**在途请求回来时检查"我那个哨兵还在不在"，不在了就丢弃结果。**

用 `Object()` 而不是自增整数，是因为 Dart 的 `identical` 是 O(1) 的，而且不会溢出。

## 数据库层：最后一道，也是最不该动的

前面四层都是缓存"查询结果"。数据库自己还有一层缓存，但它性质不同。

| 层 | 缓存什么 | 能不能自己失效 |
|---|---|---|
| 应用层 | HTTP 响应 | **能**，你写代码 |
| 数据库 | 查询计划、执行计划 | **不能**，要靠 `ANALYZE` |

数据库的查询计划缓存意思是：数据库把"这条 SQL 怎么执行"的决定缓存起来，避免每次重新分析。**而它失效的依据是数据分布的变化**——你插入了一百万行之后，原来的计划可能不再最优。

`ANALYZE` 就是告诉数据库"数据分布是这样的，重新算计划"。

而这个项目用 D1（Cloudflare 的 SQLite），**每次请求的数据量都小，没有手动调 `ANALYZE` 的必要。** 这是个明确的取舍，不是遗漏。

**它的逻辑是：这一层的优化收益最小、成本最高（需要理解执行计划），所以最后做。**

## 一条我一开始想省掉的事

`Age` 头那个处理，第一版我完全没做。

那时候我以为 `saved = now()` 就够了。问题出现在加 CDN 之后：**一个响应在 CDN 上待了 40 秒，到客户端时它已经 40 秒老了，但我记成 0 秒。**

后果是每份缓存数据都"年轻"了它在路上花掉的时间。对 2 分钟 fresh 的通知列表来说，那是 **33% 的新鲜度被白送了**。

而这类 bug 极难发现，因为**它不报错，只是让缓存的实际新鲜度低于配置值**。

我发现它是因为顺手把两个时间戳打了日志对比，发现 `saved` 和响应头的 `Age` 差着 40 秒。

**教训是：实现 HTTP 缓存时，`Age` 不是可选的头。** 任何中间层（CDN、反向代理）都会引入它，而忽略它的后果是静默的。

顺带说一个我承认没解决的：**读缓存会更新 `saved` 时间戳，导致通知这类高频读取的数据永远不进 stale 状态。**

正确的解法是拆成两个字段（`saved` 给 maxAge 用、`fetchedAt` 给 fresh 用），但我没做——**因为它需要改缓存层核心数据结构，而收益只在通知这类场景上。**

## 小结

缓存这四层，本项目沉淀下来的判断是：

1. **客户端 / CDN / 应用 / 数据库四层独立**，而这个项目只在应用层下了功夫——因为那是唯一能精确控制的一层。
2. **服务端的 `Cache-Control` 只能让策略更严格**，不能让它更宽松。
3. **fresh / stale / expired 三态**，"先给旧的再更新"是弱网体验的关键。
4. **失效映射的核心不是"删什么"，是"还有什么会变"**——发一篇文章要失效六个键，其中两个最容易漏。
5. **`fence`（隔断）和 `invalidate`（删除）必须分开**，因为写操作可能失败。
6. **`Age` 不处理会让新鲜度静默偏低**。

第 5 条我觉得是这批文章里最值得记住的，因为它体现了一个通用模式：

> **"停止一件坏事"和"做一件坏事"要分开。** 前者可以立即做（隔断在途请求），后者必须确认条件（删数据）。

这个模式和 B-18 讲的迁移回滚是同构的——**迁移时"先加列"可以立刻做，"删数据"必须确认新代码就绪。**

下一篇讲 Web 安全。我会拿这个项目的真实防护来对照讲——SQL 注入是彻底防住的（白名单），但 XSS 在这个项目里靠的是"不用 innerHTML"这种隐式防护。

## 延伸阅读

- [Flutter 缓存：fresh、stale、expired 与账号边界]({{LINK:M4-23}})
- [写后缓存失效与图片缓存治理]({{LINK:M4-24}})
- [数据库索引：为什么加了索引还是慢]({{LINK:B-06}})

---
如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[成为全栈](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->
## 发布辅助信息

### 文章 Tag（6 个）

缓存、HTTP缓存、CDN、数据一致性、Flutter缓存、性能优化

### 文章简介（250 字以内）

浏览器、CDN、服务端、数据库和客户端状态都有缓存，但它们的 key、生命周期、安全范围和失效方式并不相同。本文解释 Cache-Control 中 max-age、no-cache、no-store、private 的区别，介绍 ETag、CDN purge、服务端进程缓存和移动端 fresh/stale/expired 策略，并重点讨论会员数据隔离、写后失效以及如何用测量决定是否缓存。

### 建议发布分类

架构 / 性能优化

### 封面短标题

缓存快了也会留下旧数据

### 配图 AI 提示词

1. B-13-封面：请求从浏览器、CDN、服务端缓存到数据库依次经过，各层标注独立缓存键和失效方式。
2. B-13-私有数据：账号 A 退出切换至账号 B 时，私有缓存清理或按会话隔离，阻止旧资料泄漏。

### 发布前核对

- [ ] no-cache、no-store、private、public 的语义按 HTTP 规范复核。
- [ ] 不暗示所有 GET 响应都适合 CDN 缓存。
- [ ] 替换图片和链接，发布时删除辅助信息。
<!-- PUBLISH_ASSIST_END -->
