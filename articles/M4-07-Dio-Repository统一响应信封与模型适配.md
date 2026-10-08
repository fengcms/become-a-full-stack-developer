# 成为全栈·Flutter App 篇·Dio + Repository：统一响应信封与模型适配

上一篇我们把模型生成链路走通了，`ApiArticle` 那批类有了。但真正连上后端的第一天，我就想抄一个最省事的写法：

```dart
Future<List<T>> getList<T>(String path) async { /* ... */ }
```

——所有接口都走一个泛型函数，页面只管传 `Article` 或 `Comment`。

我写完盯着这个函数看了五分钟，然后删了。

因为它骗了我。它让"统一"这件事在代码上成立，但服务端返回的东西**根本不是同一个形状**：文章列表是 `{list, pagination}`，搜索结果藏在 `articles` 字段里，点赞记录是裸数组，阅读历史的每条外面还套一层 `article` 和 `progress`。一个 `getList<T>` 要吃下这四种形状，只能在函数里写满 `if`。

**这篇讲的就是我删掉它之后，换成了什么。**

{{IMG:M4-07-封面}}

## 先说清楚：我确实造过一个"统一 API"

上面那个 `getList<T>` 不是 strawman，是我真写过的。它的问题不是不好用，是**它把差异藏起来了**。

用一个真实端点对照。这是 `flutter-app/lib/core/network/endpoints.dart` 之后，四个接口在 Repository 里的实际取法：

| 端点 | 服务端返回 | 分页信息 |
|---|---|---|
| `GET /articles` | `{list: [...], pagination: {...}}` | 服务端给 |
| `GET /articles/search` | `{articles: [...], total: n}` | 只有 total，**无 totalPages** |
| `GET /me/likes` | `[...]` 裸数组 | **完全没有** |
| `GET /me/history` | `{list: [{article, progress}, ...]}` | 服务端给 |

这四种在契约里**都是合法的**——不是后端实现不规范，是它们本就该不同：点赞列表本来就有限且不需要翻页，阅读历史需要携带进度，搜索有 total 就够了。

`getList<T>` 面对这张表，只能在内部写成这样：

```dart
// 伪代码：示意"统一封装"要付出什么，不是项目代码
Future<List<T>> getList<T>(String path) async {
  final data = await api.request(path);
  if (path == search) return (data['articles'] as List).cast<T>();   // 搜索换个字段
  if (data is List) return data.cast<T>();                          // 裸数组
  final list = data['list'] as List;                                 // 分页对象
  return list.map((j) => decode<T>(j)).toList();
}
```

问题就在这：**四个分支、三种解码路径，全塞进一个"通用"函数里**。而任何一个新端点，只要它的形状是第五种，你都得回去改这个函数——它并没有真的统一，只是把分叉集中了。更糟的是 `cast<T>()` 是编译期骗人的，`data['articles']` 里少一个字段，它照样返回，只是元素全成了 `null`。

所以现在项目里**没有任何泛型请求封装**。`grep` 整个 `lib/` 只会找到两个 `Future<T>`，都是 `force` 和 `track` 这类 Zone 包装，跟请求封装无关。

取而代之的做法是：**每个资源一个显式方法，形状差异留在方法内部**。

## 差异留在 Repository 里，不外泄到页面

`flutter-app/lib/features/repository.dart` 的 `articles()` 就是这个思路的成品——它一个方法同时吃下上表的前三行：

```dart
// 兼容分页对象和点赞裸数组两种协议，历史条目额外携带阅读进度。
Future<PageResult<Article>> articles({
  int page = 1,
  String path = Endpoints.articles,
  Map<String, dynamic> query = const {},
  bool force = false,
}) async {
  var data = await read(
    path,
    query: {'page': page, 'pageSize': 12, ...query},
    force: force,
  );
  if (path == Endpoints.search) data = data['articles'];      // ① 搜索换字段
  if (data is List) {                                          // ② 裸数组
    final list = data.map((j) => Article.fromJson(jsonMap(j))).toList();
    final size = query['pageSize'] as int? ?? 12;
    return PageResult(list, page, list.length == size ? page + 1 : page, 0);
  }
  return PageResult.fromJson(                                  // ③ 分页对象
    data,
    (j) => Article.fromJson(
      j['article'] is Map ? jsonMap(j['article']) : j,         // ④ 历史带嵌套
      progress: j['progress'] as num?,
    ),
  );
}
```

四个注释标出的就是四种形状。**注意分支 ② 里的 `list.length == size ? page + 1 : page`**：裸数组没有分页信息，"还有没有下一页"只能靠"这次拿满了吗"推断。返回的 `total` 是 `0`——**这是明知故填的**。

这里有个我想专门强调的点：**适配层不能伪造它不知道的东西。** 裸数组情况下我不知道总数，那就给 0，不编一个 `999`；我没拿到 `totalPages`，就按满页推断，绝不声称"服务端已分页"。同理，收藏接口如果没有单篇收藏状态，不能只查前几页就回答"没收藏"；点赞列表没有分页，也不能对外说它有。

**假的默认值比缺字段危险得多**——缺字段会报错，假的会让页面显示出错误结论且没人发现。

至于分支 ④ 那个 `j['article'] is Map ? jsonMap(j['article']) : j`，看着啰嗦，但它正是 M4-03 说的那件事的延续：生成模型给的是契约形状，领域模型要的是页面能用的东西。阅读历史要的是"文章 + 我读到哪了"，所以它从嵌套里把两者拆出来组合。

## 私有预览：同一个方法，两条完全不同的路

`repository.dart` 里还有个 `article()`，看着不起眼，但它是"私有数据不该进公开缓存"这条规则的落点：

```dart
// 本人预览走鉴权请求并绕过公开正文缓存。
Future<Article> article(String id, {bool private = false}) async =>
    Article.fromJson(
      private
          ? jsonMap(await api.request(Endpoints.article(id)))
          : jsonMap((await bundle(id))['article']),
    );
```

`private: true` 时走 `api.request` 直连，**不经过 `read()`，因此完全绕过缓存**；`false` 时走 `bundle()` 走正常缓存路径。

为什么要这样区分，作者自己的注释就写着"绕过公开正文缓存"。设想一下如果偷懒走同一条路：一个待审核的稿件会被写进公开文章缓存，随后**任何用户都可能读到它**——这是个安全事故，不只是体验问题。

判断一条读取是不是私有的，仓库里有统一口径：

```dart
final private =
    path.startsWith(Endpoints.privatePrefix) ||
    path.endsWith(Endpoints.likeStatusSuffix);
final k = key(path, query, private: private);
```

而缓存键把私有身份编码进了键里：

```dart
String key(String path, Map<String, dynamic> query, {bool private = false}) {
  return CacheKey(
    api.baseUrl,
    private ? 'session:${api.userId}:${api.epoch}' : 'public',
    path, query,
  ).encode();
}
```

`session:${userId}:${epoch}` ——**`epoch` 是会话代次**。同一个用户登录两次（会话换代）或退出再登，键就不同，旧数据永远不会被误读。这一点下一篇（M4-09）会展开。

## 缓存策略用一张表管住，不靠 if 散落

既然读要走 `read()`，那"这个端点能不能缓存"必须有唯一答案。项目里是 `features/data/cache_policy_table.dart`。

先看它最反直觉、也最重要的一条设计——**白名单而不是黑名单**：

```dart
/// 没有显式读规则的端点直接联网，避免误缓存登录、上传和私有稿件正文。
class CachePolicyTable {
  /// 互动状态可读缓存，点赞写端点本身不进入 GET 缓存规则。
  CachePolicy? policy(String path) =>
      path.endsWith(Endpoints.likeSuffix) ? null : _rules[family(path)]?.policy;
```

`policy()` 返回 `null` 就意味着**直接联网，永不缓存**。这是刻意的方向选择：如果用"默认全部缓存"，一个新增的 `POST /articles/upload` 只要返回 GET 就可能被缓存，稿件正文、验证码、登录响应都可能落盘。反过来白名单下，新端点默认不进缓存，代价是可能"忘记缓存"——但那个代价只是慢，而另一种方向的代价是泄露。

注意 `path.endsWith(Endpoints.likeSuffix) ? null` 这个特判：**点赞的 GET 状态可缓存，但点赞的写端点本身不进 GET 缓存规则**。读和写用同一个 URL 段，这是很容易踩的坑。

再看端点分类，17 个家族：

```dart
enum ResourceFamily {
  dictionaries, statistics, articleList, search, member, adjacent,
  comments, reaction, favorites, likes, history, notifications,
  manuscripts, article, comment, profile, unknown,
}
```

分类函数 `family()` 有个必须注意的顺序问题：

```dart
/// 更具体的子资源优先匹配，不能先把 /articles/id/comments 归为正文。
if (path.endsWith(Endpoints.commentsSuffix)) return ResourceFamily.comments;
...
if (path.startsWith(Endpoints.articles)) return ResourceFamily.article;
```

`/articles/123/comments` 如果先命中 `startsWith('/articles')`，就会被当成文章正文去缓存——**评论和正文共用一个键**，写评论会污染文章。这个 bug 在开发时几乎不会显形，只会在"改了评论，文章内容居然变了"时怀疑人生。所以 `endsWith` 的判断必须排在 `startsWith` 前面。

**这个 `family()` 只判一次，读策略、响应校验、写后失效三处共用**——这是整张表的核心价值，下面两节就是它的三个用途。

## 写入缓存之前，先校验响应形状

第二个用途：`validate()`。它决定了一次响应**能不能落盘**：

```dart
/// 校验后才允许写入缓存，拒绝把错误响应长期当成有效页面。
void validate(String path, dynamic value) {
  final shape = switch (path) {
    Endpoints.siteSettings || Endpoints.unreadCount => _Shape.object,
    _ => _rules[family(path)]?.shape ?? _Shape.object,
  };
  final valid = switch (shape) {
    _Shape.list => value is List,
    _Shape.object => value is Map,
    _Shape.page =>
      value is List ||
          (value is Map && value['list'] is List && value['pagination'] is Map),
  };
  if (!valid) throw const FormatException('响应格式不正确');
}
```

每个家族在规则表里登记了预期形状（`_Shape.list` / `object` / `page`）。注意 `_Shape.page` 的判定同时接受 `List`——因为上一节说的裸数组协议。

这个校验挡的是一个具体事故：**服务端的 `data` 是 null（业务失败但 HTTP 200）时，如果直接缓存，null 会占住这个键，接下来几分钟内用户看到的是空页面，而且刷新也没用**——因为缓存命中了。校验不通过就抛 `FormatException`，让这一次读取失败，而不是把错误缓存下来。

`_Shape.page` 同时接受 `List` 和分页对象，这里有个容易被误读的细节：它看起来"放宽了校验"，实际是因为**协议本来就允许裸数组**（点赞端点），而不是校验不严。

## 写操作：成功要失效，失败也要失效

第三个用途是 `mutationTags()`，也是我认为整个数据层最反直觉的一段：

```dart
/// 写操作开始先隔断旧请求，结束后按相同分类失效关联摘要与会员统计。
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

注意 `reaction` 分支里除了文章自己的反应键，还失效了 `meLikes`（我的点赞列表）和 `overview`（会员中心的统计数字）。**点赞一篇文章，你的"我赞过的"列表和资料页上的累计数都得变**——这层关联如果漏了，用户会看到自己点赞了但列表里没有。

调用方更能说明"失败也要处理"这件事：

```dart
// 写操作失败也会使相关读取失效，因为请求可能已被服务器接收。
void _mutation(String path, String method, Object? data, bool started,
               dynamic result, Object? error) {
  final affected = policies.mutationTags(path, data);
  if (started) {
    cache.fence(affected);     // 请求开始：先隔断，防止旧的在途响应回写
    return;
  }
  if (error is SessionChanged) return;
  cache.invalidate(affected);  // 无论成功失败，都失效
  if (error != null) return;   // 失败到这里就结束
  // 成功才做这些精细同步……
}
```

**为什么失败也要 invalidate？** 因为客户端看到失败，不代表服务端没执行。请求发出去、服务器写成功、响应在回程丢了——客户端拿到的是超时，但数据已经变了。这种情况下不清缓存，页面会一直显示旧值。

而 `started` 那一支的 `cache.fence()` 是另一件事：**写操作开始时就把相关键"围栏"掉**，让此刻还在路上的旧读取无法把旧值写回。否则就有个经典的时序 bug：用户点刷新（触发 GET）→ 同时点了收藏（触发 POST + invalidate）→ 那个 GET 晚回来一步，把收藏前的旧数据重新写进缓存。

顺带一提，成功之后还有几段精细同步，比如从写操作的返回值里直接取回新的 `liked` 和 `likeCount` 更新本地状态，而不是等下一次重新拉取。这是**乐观更新**的基础，M4-16 会专门讲。

## 三类验证各自证明什么

这套分层要真的可靠，靠三类检查，它们**互相不能替代**：

| 检查 | 命令 | 能证明什么 | **不能**证明什么 |
|---|---|---|---|
| 契约生成 | `node tool/generate_contract.mjs` | 契约能产出 Dart 类型 | 服务端真的按契约返回 |
| 解析单测 | `flutter test` | 解析器按预期处理形状差异 | 真实响应形状符合预期 |
| 隔离后端联调 | `node tool/verify_backend.mjs` | 真实请求 + 认证 + 写流程可用 | 生产环境行为一致 |

（集成测试打的是隔离的本地 11002 后端，不是线上。）

第二类最容易糊弄。如果单测里构造的 JSON 是自己写的，它证明的只是"我的解析器能解析我想象的响应"。**真正有价值的那条用例是拿服务端真实响应样本喂进去**——比如 `GET /me/likes` 到底回裸数组还是包装对象，这事不该由写测试的人拍脑袋决定。

同理，线上只读接口能验证"此刻这个公开接口可访问"，它验证不了写操作的安全性，也覆盖不了全部端点。

## 日志与脱敏：错误要能诊断，不能能泄露

`ApiFailure` 保留了完整诊断信息：

```dart
class ApiFailure implements Exception {
  const ApiFailure(this.message, {
    this.code = 0, this.status = 0, this.retryAfter, this.fields = const {},
  });
  final String message;
  final int code, status;
  final int? retryAfter;
  final Map<String, String> fields;
  @override
  String toString() => message;
}
```

`message` 给用户看，可以简洁；`code` / `status` / `retryAfter` / `fields` 留给日志和测试。这里有个刻意为之的分离——`toString()` 只返回 `message`，所以不小心把异常打进日志时，`fields` 里那些字段校验详情不会跟着泄露。

但要主动**剔除**的东西更多：Authorization、refresh token、密码、验证码、投稿正文。日志脱敏不靠"记得别打"，得靠字段白名单或专门的脱敏函数。

还有一条容易做错的映射：**不要把所有 403 都映射成"文章不存在"。** 权限不足、账号被封、资源不可见，在 HTTP 上可能都是 403 或 404，但用户的下一步动作完全不同——一个要重新登录，一个要联系管理员，一个只能放弃。仓库里 `forbidden()` 把这些码集中列了出来：

```dart
bool forbidden(Object e) =>
    e is ApiFailure &&
    ([401, 403, 404].contains(e.status) ||
     [1003, 1004, 1005, 2001, 3001].contains(e.code));
```

它的用途是决定**要不要把这次失败写进缓存**（属于"重试也不会变"的错误，可以放心缓存失败态，避免反复打服务端），而不是决定 UI 怎么显示。

## 新增一个端点时的检查清单

把这套规则的落地顺序固定下来：

```text
端点 → 归类 family() → 定 shape 与缓存策略 → 写显式 Repository 方法
     → 决定私有还是公开 → 接 mutationTags → 补单测与联调
```

几个最容易漏的点：

1. **`family()` 里新端点的判断位置**。放在 `startsWith('/articles')` 这类前缀判断**之后**，就会被归错类——顺序错了缓存键就冲突。
2. **响应形状要登记 `_Shape`**。不登记默认按 `object` 校验，`page` 类型的数据会被校验函数拦下（或者更糟，绕过了校验）。
3. **私有还是公开**。默认走 `public` 的话，待审核稿件可能进公开缓存。这一条建议在 code review 时单独问一句。
4. **`mutationTags` 要覆盖关联资源**。新写操作除了自己的键，还要想"谁的显示会因此变"。

## 一条我一开始想省掉的事

`read()` 里这段我本来想抽掉：

```dart
final private =
    path.startsWith(Endpoints.privatePrefix) ||
    path.endsWith(Endpoints.likeStatusSuffix);
final k = key(path, query, private: private);
(Zone.current[_tracking] as Set<String>?)?.add(k);
```

尤其最后那行——从 `Zone` 里取一个 `Set` 然后往里塞个字符串，看起来毫无意义，像是调试代码漏出来了。

它不是。`Zone` 在这里是**传递"读取意图"的载体**。页面调 `track(keys, ...)` 时包一层 `runZoned`，仓库里任何深层的缓存 `get` 都会自动把实际读到的键登记进去。有了这份登记，后台事件才能精确唤醒"依赖这些键的页面"，而不是粗暴广播。

省掉它的后果是：要正确实现依赖追踪，每一层函数都得手工往下传 `Set<String>` 参数——而漏传一层，整个优化就失效，而且**失效时不会报错**，只是性能悄悄变差。这种 bug 极难排查，所以我宁可保留这两行看起来多余的代码。

顺便，`forced` 也是同一个机制：

```dart
// Zone 将主动刷新意图传递给组合读取，避免每一层手工传参漏掉子请求。
Future<T> force<T>(Future<T> Function() task) =>
    runZoned(task, zoneValues: {_force: true});
bool get forced => Zone.current[_force] == true;
```

用户下拉刷新时，首页为了组装数据会请求文章列表 + 分类 + 站点配置七八个端点。"忽略缓存"这个意图必须传到每一个子请求去，靠传参的话，中间任何一层漏了，那个子请求就会读到旧缓存——表现是"刷新了但有一块没变"。`Zone` 让它自动成立。

## 小结

这篇真正想留下的判断只有一个：**"统一 API"是个陷阱，但"统一"本身不是。**

统一的是**位置**——所有响应形状的差异都在 Repository 里消化完，页面只消费领域模型。放弃统一的是**签名**——不给 `getList<T>` 那种"看起来很美"的通用封装，因为四种形状进一个函数就等于四个分支进一个函数。

具体到判断标准：`getList<T>` 只有在**所有端点响应形状真的相同**时才成立。一旦项目里有任何一个端点特殊，它就会开始积累分支、积累 `if`，最终变成一个谁都不敢改的函数。

下一篇讲 `429` 和错误重试——那时候我们会看到，`ApiClient` 里那些看起来啰嗦的条件判断（只对 GET 重试、最多等 3 秒），每一个都是为了不把事情做错。

## 延伸阅读

- [Flutter 工程骨架与 OpenAPI 代码生成]({{LINK:M4-03}})
- [移动端错误与限流：429、重试和写请求边界]({{LINK:M4-08}})
- [统一响应结构：HTTP 状态码与业务码如何分工](https://blog.csdn.net/fungleo/article/details/164289071)

---

如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->

## 发布辅助信息

### 文章 Tag（6 个）

`Flutter`、`Dio`、`Repository`、`OpenAPI`、`API封装`、`全栈开发`

### 文章简介（250 字以内）

本文以 Flutter 项目为例拆解 Dio、API Client、Repository 和 UI 的职责：网络层统一处理信封、认证、错误与限流，Repository 适配真实响应形状并输出稳定模型，页面只消费业务数据。代码生成、单测、隔离后端联调各自证明不同范围。

### 建议发布分类

全栈开发 / Flutter

### 封面短标题

统一接口，响应仍有差异

### 配图 AI 提示词

1. `M4-07-封面`：16:9 中文技术封面，Dio → ApiClient → Repository → Flutter UI 四层数据流，侧边显示统一 envelope 内仍有 articles、裸数组、嵌套 article 等响应形状，深蓝青绿色。
2. `M4-07-数据流`：16:9 分层图，标注端点配置、Bearer、信封解析、错误分类、DTO映射、领域模型与可重试 UI，准确中文。

### 发布前核对

- [ ] 替换 2 处配图占位符
- [ ] M4-03、M4-08、M1-08 发布后回填站内链接
- [ ] 与 ApiClient / Repository 当前实现核对示例
- [ ] 已删除本辅助区
