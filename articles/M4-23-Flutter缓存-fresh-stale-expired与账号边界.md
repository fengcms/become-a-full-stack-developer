# 成为全栈·Flutter App 篇·Flutter 缓存：fresh、stale、expired 与账号边界

讲缓存之前，先说一个我一开始的定义错误。

我以为缓存就是"存下来，过期就删"。所以我的策略只有两个数：存多久（`maxAge`）、什么时候更新（`fresh`）。

改数据的时候我发现这样不对。设想用户打开一篇缓存的文章，此时网络很差：

**如果等它过期才去刷新，用户会盯着骨架屏转十秒。** 而他其实已经能看到内容了。

**如果永远不等过期，用户永远看不到新版本。**

所以必须承认一件事：**"能不能用这份缓存"和"要不要更新这份缓存"，是两个独立的问题。**

这个拆分就是 fresh / stale / expired 三态的由来。

{{IMG:M4-23-封面}}

## 三态的判定

先看判定代码，这是全项目的核心：

```dart
if (!force &&
    entry != null &&
    now().difference(entry.saved) < entry.maxAge) {
  _put(key, entry);                                  // 续期，标记为"刚被用到"
  if (now().difference(entry.saved) < entry.fresh) {
    count('freshHit');
    return entry.value;                              // ← fresh：直接返回
  }
  // 返回可用旧值并启动后台更新；后台失败通过事件通知页面。
  count('staleHit');
  unawaited(
    _fetch(key, policy, fetch, tags, forbidden).catchError((Object _) => null),
  );
  return entry.value;                                // ← stale：先返回旧的，后台更新
}
if (entry != null && now().difference(entry.saved) >= entry.maxAge) {
  _entries.remove(key);
}
```

三态的实际行为：

| 状态 | 条件 | 行为 |
|---|---|---|
| **fresh** | 未超过 `fresh` | 直接返回，**不发请求** |
| **stale** | 超过 `fresh` 但未超过 `maxAge` | **立刻返回旧值**，同时后台悄悄更新 |
| **expired** | 超过 `maxAge` | 删掉，必须等网络 |

**stale 这一档是用户体验的关键。** 用户点击 → 立刻看到内容（虽然是旧的）→ 后台在更新 → 更新完成发事件 → 页面刷新出新内容。

用户感知到的是"打开很快"，而不是"等很久"。

而 stale 命中时那个 `catchError((Object _) => null)` 很重要：**后台更新失败不能影响用户。** 用户已经看到内容了，后台刷新失败对他不可见——顶多是下次进页面时内容还是旧的。

这个错误被吞掉，但**失败会通过 `CacheEvent(kind: 'failed')` 通知页面**（M4-10 的 `AsyncPane` 处理了这个事件）。所以用户如果关心，可以在下拉刷新时看到"更新失败，当前显示上次内容"。

**吞掉异常和报告失败是两件事**：前者防止后台任务崩溃，后者让界面有机会提示。

## maxAge 和 fresh 分别回答什么

两个参数很容易被混淆，但它们回答的问题完全不同：

**`fresh` 回答："我现在有多相信这份数据？"**

值越小，客户端越经常去问服务器。比如通知列表 15 秒——因为用户可能刚在别处操作过。

**`maxAge` 回答："最坏情况下我能拿多旧的数据来用？"**

值越大，离线可用性越好。比如已发布文章的正文 24 小时——反正内容不会突变，断网也能读。

看几个实际的配置：

```dart
ResourceFamily.dictionaries: _ReadRule(
  CachePolicy(Duration(minutes: 30), _day, disk: true),
  _Shape.list,
),
ResourceFamily.notifications: _ReadRule(
  CachePolicy(Duration(seconds: 15), Duration(minutes: 1)),
  _Shape.page,
  tags: {'private', 'notifications'},
),
ResourceFamily.article: ...  // 正文：10 分钟 fresh，24 小时 maxAge
```

分类和标签是 `30 分钟 / 1 天`——**变化极慢，可以放心用旧的**。
通知是 `15 秒 / 1 分钟`——**用户刚操作过的地方，必须立刻反映**。

| 端点 | fresh | maxAge | 为什么 |
|---|---|---|---|
| 分类、标签 | 30 分钟 | 1 天 | 运营配置，几乎不变 |
| 站点统计 | 5 分钟 | 1 天 | 数字变化慢 |
| 文章列表 | 2 分钟 | 1 天 | 有新文章，但旧几小时也无妨 |
| 热门列表 | 5 分钟 | 1 天 | 榜单变动比最新列表快 |
| 文章正文 | 10 分钟 | 24 小时 | 同上，但要能离线读 |
| 评论 | 30 秒 | 5 分钟 | 别人随时可能在评论 |
| 通知 | 15 秒 | 1 分钟 | 刚操作过 |
| 私信草稿 | 15 秒 | 1 分钟 | 同上 |

**`fresh < maxAge` 是所有配置的共同特征。** 如果 `fresh >= maxAge`，那 stale 那一档就不存在了，缓存退化成"要么最新、要么没有"，等于放弃了 stale-while-revalidate 带来的好处。

## 读缓存会续期，这是有意的

注意 `if` 块里那句：

```dart
_put(key, entry);    // 重新放进去
```

它更新了什么？**`saved` 时间戳。** 也就是说：**每次读到缓存，都会把它变成"刚保存的"。**

这叫 **LRU（最近最少使用）语义**，它带来一个重要后果：

**用户经常看的文章，会一直保持"看起来很新鲜"，即使它已经过了原本的 fresh 期。**

这是好还是坏？取决于场景。

对文章正文来说，这是**好的**——用户天天看的那几篇，缓存一直有效，不用每次都请求。

对通知来说，这可能是**坏的**——用户频繁打开会员中心，导致通知的 `saved` 一直刷新，**结果它永远不会进入 stale 状态，也就永远不会后台更新**。

而后台更新恰恰是通知列表最需要的（用户刚在别处操作过）。

**这是 LRU 续期的一个已知副作用，我没有解。**

可能的解法是"续期但不延长 fresh 期"——即 `saved` 用于 maxAge 判断，但 fresh 用另一个字段记录"这份数据实际的获取时间"。**现在两者是同一个字段，所以无法区分。**

我记录这个问题是因为：**它属于"看起来是 bug，其实是被选择的性质"**。将来如果有人报"通知不更新了"，答案在这里。

## 服务端的 cache-control：只能收紧不能放宽

现在讲一个我在对接后端时才发现的机制。

HTTP 响应头里有 `Cache-Control`，服务端可以告诉客户端"这份数据能缓存多久"。我们的 ApiClient 会把这些头收集起来：

```dart
// 把服务端缓存头与数据一起传给缓存层，网络层本身不决定是否复用。
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

**注意这个注释的最后一句："网络层本身不决定是否复用"。** 网络层只负责"把头带回来"，判断留给缓存层。这是很干净的职责划分——Dio 不该知道缓存策略。

缓存层拿到头之后：

```dart
// 缓存策略只允许收紧服务端限制；Age 扣减保存时间，不重置存活期。
var fresh = policy.fresh, max = policy.maxAge;
final seconds = int.tryParse(
  RegExp(r'(?:^|,)\s*max-age\s*=\s*"?(\d+)')
          .firstMatch(control)?.group(1) ?? '',
);
if (seconds != null) {
  final age = Duration(seconds: seconds);
  if (age < fresh) fresh = age;      // ← 只在更短时才生效
  if (age < max) max = age;
}
if (control.contains('no-cache')) {
  fresh = Duration.zero;
  max = Duration.zero;
}
if (control.contains('must-revalidate') && fresh < max) max = fresh;
```

**四个 `if` 全是"收紧"方向，没有一个是"放宽"。**

`if (age < fresh) fresh = age;` 这行是关键：**服务端说要缓存 10 分钟，而我们的策略是 2 分钟，取更短的 2 分钟。** 反过来如果服务端说 1 小时而策略是 2 分钟，**不会变成 1 小时**。

**为什么只能收紧？** 因为客户端的策略是基于这个 App 的需求定的，而服务端的 `Cache-Control` 可能是针对中间代理（CDN、网关）设的。**客户端没有理由因为服务端给了一个长值就放宽自己的策略**——那意味着用户可能看到一小时前的通知，而 App 本该一分钟就更新。

`no-cache` 是最严格的那个：直接把 fresh 和 max 都设成 0，**等于每次都重新请求**。用于"这份数据绝对不能缓存"的响应。

`must-revalidate` 则是"过期后必须验证"：它把 maxAge 收紧到和 fresh 一样。**效果是取消 stale 那一档**——因为 max 等于 fresh，不存在"过 fresh 但没过 max"的窗口。

`Age` 头那个处理很精确：

```dart
entry: CacheEntry(
  response.value,
  now().subtract(response.age),    // ← 扣掉 Age
  fresh, max, tags,
),
```

**`Age` 是 HTTP 响应在 CDN 或者代理上停留的时间。** 一个响应在 CDN 上待了 30 秒才到客户端，那它的实际年龄不是 0，而是 30 秒。

`now().subtract(response.age)` 让 `saved` 变成 30 秒前，**这样 fresh/maxAge 的判断会自动把这段路途算进去。**

而注释里那句"**Age 扣减保存时间，不重置存活期**"是关键区别：不能用 `saved = now() - age` 然后又重新开始计时，那会把在 CDN 待的时间"补回来"。

## fence：用对象哨兵隔断在途请求

现在讲写操作和缓存的交互，这是最微妙的一块。

问题：用户点收藏 → 缓存失效 → 同时还有一个**之前发出的**列表请求在路上 → 那个请求带着旧数据回来 → **把旧数据写进缓存**。

这就是 M4-07 提过的时序 bug。现在的解法是 `fence`：

```dart
/// Fence reads at mutation start; preserve visible data until its outcome.
void fence(Set<String> tags) {
  for (final key in _keyTags.keys.toList()) {
    if (_keyTags[key]!.intersection(tags).isNotEmpty) {
      _versions[key] = Object();      // ← 换一个新对象当哨兵
      _flights.remove(key);           // ← 取消在途请求的复用
    }
  }
}
```

`_versions[key]` 是一个 `Object`。**每次 fence 就换一个新对象**。而在途请求完成时会检查"我的那个哨兵还在不在"——不在了，就说明中途发生过 fence，**结果丢弃**。

用 `Object()` 而不是自增的整数，是因为 Dart 的对象恒等比较（`identical`）是 O(1) 的，而且不会溢出、不需要考虑线程安全。

而 `_flights.remove(key)` 是另一件事：**它取消"同键请求复用"**。原本如果有两个相同键的请求，第二个会等第一个的结果（就像 M4-09 的单飞刷新）。但写操作发生之后，那个等待中的请求**等的是一个可能过时的结果**，所以要踢掉让它自己重新发。

`invalidate` 则是 fence 加上真正删除：

```dart
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

**为什么 fence 和 remove 要分开？** 因为 M4-07 讲的那个场景：写操作**开始时**要先 fence（隔断在途请求），但**此时不能删数据**——因为写可能失败，而用户正在看那份数据。

只有确认要失效了（写成功，或者明确要刷新），才调 `invalidate`。M4-07 的 `_mutation` 里就是这个顺序：

```dart
if (started) {
  cache.fence(affected);     // 开始：只隔断，不删
  return;
}
if (error is SessionChanged) return;
cache.invalidate(affected);  // 结束：真的删
```

**这个"先围栏、后拆墙"的两步设计，是缓存和写操作正确协作的关键。**

## 账号边界：私有缓存的键

最后一个话题，也是安全相关的。

M4-07 讲过缓存键的构造：

```dart
String key(String path, Map<String, dynamic> query, {bool private = false}) {
  return CacheKey(
    api.baseUrl,
    private ? 'session:${api.userId}:${api.epoch}' : 'public',
    path, query,
  ).encode();
}
```

**私有键里有 `userId` 和 `epoch` 两个字段。** M4-09 解释过 `epoch` 的作用（会话代次，防止同一用户重新登录后读到旧会话的数据）。

而**公开键里什么都没有**——只有 `baseUrl` 加路径和查询。

这个不对称是有意的：

| 类型 | 键包含 | 效果 |
|---|---|---|
| 公开 | baseUrl + path + query | **不同用户共享**（公开数据本来就一样） |
| 私有 | baseUrl + userId + epoch + path + query | **每个会话独占** |

公开数据共享是缓存命中率高的大前提——如果每个用户的文章列表各存一份，那缓存的效率会非常低。

而私有数据必须隔离，否则就是 M4-18 讲的那个隐私问题。

**判断某个端点是不是私有的，规则只有两条**：

```dart
final private =
    path.startsWith(Endpoints.privatePrefix) ||
    path.endsWith(Endpoints.likeStatusSuffix);
```

`privatePrefix` 覆盖了所有 `/me/*` 端点；`likeStatusSuffix` 是因为点赞状态虽然路径不含 `/me`，但它的内容是私有的。

**这个判断出错的后果是双向的**：

| 误判 | 后果 |
|---|---|
| 私有当成公开 | **数据泄露**（B 看到 A 的收藏） |
| 公开当成私有 | 缓存效率降低（同一份数据存多份） |

所以判断规则要用**白名单式的路径前缀**，而不是"看起来像私有的就当私有"。后者太模糊——`/articles?liked=true` 这种查询参数很难归类。

## 容量：限额集中在一个文件

最后一个实现细节。缓存有十几个限额，全放在一个地方：

```dart
/// 可重建缓存的容量预算；本地投稿草稿不在这些清理范围内。
abstract final class CacheLimits {
  static const memoryEntries = 300;
  static const memoryBytes = 20 * mib;
  static const dataDiskBytes = 30 * mib;
  static const dataDiskEntries = 300;
  static const articleBodies = 100;
  static const searches = 20;
  static const diskEntryBytes = 2 * mib;
  static const imageMemoryEntries = 100;
  static const imageMemoryBytes = 20 * mib;
  static const imageEntryBytes = 10 * mib;
  static const imageDiskBytes = 150 * mib;
  static const decodedImageBytes = 64 * mib;
  static const highlightEntries = 64;
  static const highlightCharacters = 500000;
  ...
}
```

三个观察：

**一、限额按"条目数 + 字节数"双维度限制。** M4-13 讲代码高亮缓存时说过这个——只限条目数，一个超长条目就能撑爆内存。

**二、那个 `decodedImageBytes = 64 * mib` 值得注意。** 它限制的是**解码后**的内存占用，而 `imageDiskBytes` 限制的是磁盘上压缩文件的大小。

这两个数差很多，因为**一张 2MB 的 JPEG 解码成位图可能是 20MB**（取决于分辨率）。如果只按文件大小限制内存，用户打开几张高清图就会 OOM。

**三、注释说"本地投稿草稿不在这些清理范围内"。** 这句话很重要——**草稿是用户唯一的数据备份，不能被缓存清理策略误删。**

M4-22 讲过草稿的存储，它用 `SharedPreferences` 而不是这个缓存层，正是因为**缓存是可丢弃的，草稿不是**。

**这个区分是缓存设计里最容易搞错的地方**：把用户数据和可重建数据放在同一个存储里，然后写一个"满了就清"的逻辑——**清的时候可能把用户数据一起清了。**

## 一条我一开始想省掉的事

`Age` 头的处理，我第一版完全没做。

那时候我以为 `saved = now()` 就够了。问题出现在有 CDN 之后：一个响应在 CDN 上待了 40 秒，到客户端时它已经 40 秒老了，但我记成 0 秒。

**后果是每份缓存数据都"年轻"了它在路上花掉的时间。** 对新闻列表这种 2 分钟 fresh 的影响是 33%——三分之一的窗口被白送了。

而这类 bug 极难发现，因为**它不报错，只是让缓存的实际新鲜度低于配置值**。

发现它是因为我顺手把两个时间戳打了日志对比，发现 `saved` 和响应头的 `Age` 差着 40 秒。

**教训是：实现 HTTP 缓存时，`Age` 不是可选的头。** 任何中间层（CDN、反向代理）都会引入它，而忽略它的后果是静默的。

顺带说 `max-age` 的解析用的是正则：

```dart
RegExp(r'(?:^|,)\s*max-age\s*=\s*"?(\d+)')
```

**手写正则而不是简单 split，是因为 `Cache-Control` 是逗号分隔的多指令串**，值里还可能有引号：

```text
Cache-Control: public, max-age=300, must-revalidate
Cache-Control: max-age="600"
```

这两种都要能解析。而 `(?:^|,)` 这个前置断言保证了**不会把 `s-maxage` 误匹配成 `max-age`**——那个前缀边界看起来多余，实际上少了它就会命中另一个指令。

## 小结

这一篇是整个系列里最"底层"的一篇，但它的结论被后面所有功能依赖：

1. **fresh 和 maxAge 回答两个不同问题** —— "多相信"和"最坏能多旧"。`fresh < maxAge` 才有效用 stale 那一档。
2. **stale 命中返回旧值 + 后台更新** —— 这是"打开快"体验的来源，而且后台失败必须吞掉。
3. **服务端的 cache-control 只能收紧** —— 客户端的策略基于自己的需求，不因为服务端给得宽松就放宽。
4. **`Age` 要算进数据年龄** —— 否则在 CDN 上走的时间被白送，而且不报错。
5. **`fence` 和 `invalidate` 是两步** —— 写操作开始时只围栏（隔断在途），结束时才拆墙（删数据）。
6. **私有键带 userId + epoch，公开键不带** —— 判断错的方向决定了是泄露还是低效。

其中第 5 条是我认为最值得记住的：**"隔断"和"删除"必须是两个动作**，因为写操作可能失败，而失败时用户还需要看到那份数据。

第 3 条则是一个通用原则：**当多个来源给出同一个参数的约束时，取最严格的那个。** 这不只适用于缓存——超时、权限、校验规则都是同样的合并逻辑。

下一篇讲写操作之后怎么让缓存失效——也就是 `mutationTags` 那张表，以及图片缓存的治理，它的逻辑和 JSON 缓存完全不一样。

## 延伸阅读

- [Dio + Repository：统一响应信封与模型适配]({{LINK:M4-07}})
- [写后缓存失效与图片缓存治理]({{LINK:M4-24}})
- [点赞、收藏与阅读历史：乐观更新和失败回退]({{LINK:M4-16}})
- [本机稿件恢复：账号隔离、冲突判断与恢复决策]({{LINK:M4-22}})

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
