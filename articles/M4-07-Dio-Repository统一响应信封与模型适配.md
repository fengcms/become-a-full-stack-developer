# 成为全栈·Flutter App 篇·Dio + Repository：统一响应信封与模型适配

把所有接口都包成 `getList<T>()`，代码看上去统一了，真实数据却未必如此：搜索结果在 `articles` 字段里，互动端点可能返回裸数组，阅读历史又会包一层文章对象。

这篇沿着 Dio、ApiClient、Repository 到 Widget 的一次完整请求，给出每层该处理的规则，并把代码生成、接口联调和响应适配串成可以复现的工作流。

{{IMG:M4-07-封面}}

## 传输层统一横切规则

Dio client 集中设置 base URL、超时、认证头和响应处理。API Client 负责把 HTTP 与业务 envelope 解码、将状态码映射为可识别错误、按规则处理 401 刷新和 429 限流。它不应知道首页页面的卡片如何排列。

```text
GET /articles
 → Dio 建立请求
 → Authorization / 超时等通用规则
 → HTTP 与业务信封分类
 → 返回 payload 或 ApiException
```

端点路径集中在 `Endpoints`，环境通过 `API_BASE_URL` 配置；不要在每个 Widget 里拼 `/api/v1`，也不要将生产域名散落源码。

{{IMG:M4-07-数据流}}

## 统一 envelope，但不要假设数据字段永远同形

后端常见响应是 `{code, message, data}`。成功时业务值在 `data`；失败既可能是 HTTP 非 2xx，也可能 HTTP 成功但 `code` 表示业务错误。只判断 `response.statusCode == 200` 会把业务错误当成功。

但数据字段内部仍受 operation 约束。项目验收记录了：搜索列表位于 `articles`，收藏记录可能为裸数组，阅读历史 item 包含嵌套 article。统一 envelope 不等于“每个 data 都是 `List<Article>`”。

```dart
final payload = unwrapEnvelope(response.data);
final articles = parseSearchArticles(payload['articles']);
```

这里是展示分层的伪接口；生产代码应引用项目解析器，文章示例不要复制成新手写的第二个解码器。

## Repository 让 UI 模型稳定

Repository 组合 API 调用、响应解析、生成 DTO 到领域模型的转换和缓存策略。比如 UI 需要稳定文章标题、摘要、封面和分类展示，不应该依赖服务端是 `article` 嵌套还是 `data.articles`。

```dart
final result = await repository.search(query);
// 页面拿到稳定的 ReaderArticle 列表和分页信息
```

映射层也不能擅自补业务含义。缺少 `total` 时不伪造总数；接口没有收藏单篇状态时不能只查前几页就回答“不收藏”；点赞记录没有分页时不能声称后端已分页。

## 错误模型要保留恢复线索

超时、断网、401、403、404、字段校验失败和 429 的用户动作不同。ApiClient 把它们映射成类型化异常，页面决定是登录、显示不可见、保留缓存内容还是提供重试。吞成 `Exception('error')` 会丢掉 Retry-After、业务码和可恢复性。

写请求尤其不能因为“网络错误”就自动再发。客户端不知道上次请求是否已在服务端完成。创建稿件在第一次响应拿到 ID 后，后续失败应复用这个 ID；非幂等操作要由业务流程决定重试，而不是拦截器盲目重放。

## 测试契约与真实行为

三类检查互补：生成脚本检查 OpenAPI 到 Dart 类型；单元测试检查解析器与错误映射；隔离后端集成测试验证真实请求、认证和写流程。线上只读验证能证明指定公开接口在当时可访问，不能验证生产写操作安全，更不能覆盖所有接口。

```bash
node tool/generate_contract.mjs
flutter analyze
flutter test
node tool/verify_backend.mjs
```

实际验收命令须从 `flutter-app/README.md` 核对；集成测试写入的是隔离本地 11002 后端。

## 业务错误映射不应丢掉原始诊断

给用户看的 message 要简洁，但日志和测试需要保留可诊断字段：HTTP status、业务 code、endpoint、trace/request ID、是否可重试。任何日志都必须剔除 Authorization、refresh token、密码、验证码和投稿正文。

```text
ApiException {
  kind: rateLimited
  businessCode: 5001
  retryAfter: 12
  requestId: <safe identifier>
}
```

上面是概念模型。Repository 可把“资源不可见”转为特定页面状态，但不应把所有 `403` 都映射成文章不存在；权限错误、业务错误和网络错误要保留区分，以便 UI 给出正确恢复入口。

## 请求路径的审查清单

评审一个新端点时，逐项检查它经过统一 ApiClient、是否可匿名、是否允许 token refresh、响应 data 是对象/分页/列表哪一种、是否进入显式缓存白名单、写入影响哪些资源。未列入缓存策略的 endpoint 默认联网，避免登录、上传或稿件正文因“GET”而意外落盘。

```text
endpoint → auth mode → response shape → repository mapping
         → cache policy → mutation invalidation → tests
```

这里最容易漏掉的是子资源路由匹配顺序：`/articles/{id}/comments` 要先识别为评论，不能因前缀 `/articles` 被归为文章正文。项目 `CachePolicyTable.family()` 对更具体子资源优先判断，读策略和 mutation tag 共用资源分类。


## 贴着工程代码读实现

下面这段节选自 `flutter-app/lib/features/repository.dart 第 119–193 行`（保留原始实现；为突出主线省略了文件其余部分）。读代码时可以顺着调用链确认：用一份成功响应和一份错误响应追踪 ApiClient 到模型转换。这里关注的是它如何改变数据流，而不只是记住一个 API 名称。

```dart
  Future<CacheReply> fetch(
    String path, {
    Map<String, dynamic> query = const {},
    bool anonymous = false,
  }) => fetchCacheReply(api, path, query: query, anonymous: anonymous);

  // 先查显式白名单；未列入策略的端点保留原始联网行为。
  Future<dynamic> read(
    String path, {
    Map<String, dynamic> query = const {},
    bool force = false,
  }) {
    var p = policy(path);
    if (p == null) return api.request(path, query: query);
    p = policies.forQuery(path, query, p);
    final private =
        path.startsWith(Endpoints.privatePrefix) ||
        path.endsWith(Endpoints.likeStatusSuffix);
    final k = key(path, query, private: private);
    (Zone.current[_tracking] as Set<String>?)?.add(k);
    return cache.get(
      k,
      p,
      () async {
        final result = await fetch(path, query: query, anonymous: !private);
        policies.validate(path, result.value);
        return result;
      },
      force: force || forced,
      tags: {
        ...resourceTags(path),
        if (query.containsKey('page')) feedTag(path, query),
      },
      forbidden: forbidden,
    );
  }

  // 本人预览走鉴权请求并绕过公开正文缓存。
  Future<Article> article(String id, {bool private = false}) async =>
      Article.fromJson(
        private
            ? jsonMap(await api.request(Endpoints.article(id)))
            : jsonMap((await bundle(id))['article']),
      );
  Future<List<ApiTocItem>> toc(int id) async =>
      ((await bundle('$id'))['toc'] as List)
          .map((j) => ApiTocItem.fromJson(jsonMap(j)))
          .toList();

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
    if (path == Endpoints.search) data = data['articles'];
    if (data is List) {
      final list = data.map((j) => Article.fromJson(jsonMap(j))).toList();
      final size = query['pageSize'] as int? ?? 12;
      return PageResult(list, page, list.length == size ? page + 1 : page, 0);
    }
    return PageResult.fromJson(
      data,
      (j) => Article.fromJson(
        j['article'] is Map ? jsonMap(j['article']) : j,
        progress: j['progress'] as num?,
      ),
    );
  }
```

## 把容易出错的路径走一遍

我会用这个场景做一次可复现排查：**页面直接解析响应信封导致接口形状变化散落全站**。先用一份成功响应和一份错误响应追踪 ApiClient 到模型转换；如果把问题定位在“页面直连 Dio”，修正方向是“在 Repository 统一 envelope、分页与模型适配，页面消费领域对象”。最后再验证正常路径没有退化，并把边界条件留在自动化检查里。

| 方案比较 | 简化做法 | 当前实现/推荐做法 |
|---|---|---|
| 本文核心选择 | 页面直连 Dio | Repository 边界 |
| 错误处理 | 失败后清空或静默忽略 | 保留可恢复状态，给出明确反馈 |
| 验证方式 | 只检查成功结果 | 注入边界条件并检查回归 |

| 排错步骤 | 要观察什么 | 通过条件 |
|---|---|---|
| 复现 | 页面直接解析响应信封导致接口形状变化散落全站 | 可以稳定触发或明确构造该输入 |
| 定位 | 用一份成功响应和一份错误响应追踪 ApiClient 到模型转换 | 找到责任层和状态归属 |
| 修正 | 在 Repository 统一 envelope、分页与模型适配，页面消费领域对象 | 失败不污染后续页面或账号 |

## 小结

Dio 处理传输横切规则，Repository 处理资源读取与模型适配，Widget 管呈现和用户动作。生成类型、契约检查、解析测试与真实联调共同降低漂移；“统一 API”不等于“响应细节完全同构”，更不等于可以丢弃服务器约束。

## 延伸阅读

- [Flutter 工程骨架与 OpenAPI 代码生成]({{LINK:M4-03}})
- [移动端错误与限流：429、重试和写请求边界]({{LINK:M4-08}})
- [统一响应结构：HTTP 状态码与业务码如何分工]({{LINK:M1-08}})

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
