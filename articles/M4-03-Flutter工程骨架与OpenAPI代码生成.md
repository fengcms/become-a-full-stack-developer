# 成为全栈·Flutter App 篇·Flutter 工程骨架与 OpenAPI 代码生成

上一篇我们把 TypeScript 迁到 Dart，卡在空安全和异步上。这一篇往前退一步：还没写任何业务代码，得先决定这个 Flutter 项目的骨架长什么样。

我一开始想的是"契约都写好了，让生成器把客户端全生成出来不就行了"。真做的时候发现，生成器吐出 145 行 `models.dart` 之后，事情只完成了三分之一——令牌怎么轮换、`code` 不为 0 怎么办、429 该不该重试，这些生成器一个都不会替你决定。

更意外的是后来为了补这些边界，我给生成器写了 **24 行代码**。

这篇就讲这件事：一个 OpenAPI 契约，怎么变成 Flutter App 里能真正跑起来的那条数据管线；那 24 行生成器里做了哪些取舍，以及为什么我在几个地方**故意不**做得更"通用"。

{{IMG:M4-03-封面}}

## 目录不是画出来的，是撞出来的

现在的 `flutter-app/lib/` 长这样：

```text
flutter-app/lib/                    # 122 个 .dart 文件
├── app/                 # Riverpod 装配、路由、会话、主题
├── core/
│   ├── generated/       # OpenAPI 生成模型（145 行）
│   ├── network/         # Dio、端点、信封、鉴权与错误（344 行）
│   ├── cache/           # 数据与图片缓存基础设施
│   ├── markdown/        # 阅读器、代码块、token 缓存
│   └── storage/         # 安全存储
├── features/
│   ├── data/            # Repository、读取模型、缓存策略
│   ├── discovery/ article/ auth/ member/ editor/ comments/
└── shared/widgets/      # 页面框架、状态视图、列表等公共组件
```

先说清楚一件事：**这不是严格的 Clean Architecture。** 网上那种"core 层不认识 Flutter"的漂亮说法，我没做到，也不想假装做到——`core/markdown` 里就得用 Flutter Widget，状态视图这些东西也天然依赖 UI。

我更愿意如实标注它是"便于维护的实用分层"。判断一个目录划分对不对，不看术语，看**依赖方向有没有反着来**：`features/data` 可以调 `core/network`，反过来不行；`core` 里不该出现某个具体业务页面的名字。

真正定下这棵树的顺序也不是先设计后实现，而是被三个具体问题逼出来的：生成代码放哪不被误改、Repository 和 Widget 谁负责缓存策略、跨账号的私有数据放哪个目录——第一个问题直接决定了 `core/generated` 要独立出来，因为它是**唯一不允许手改**的目录。

{{IMG:M4-03-目录}}

## 那 24 行生成器，做了什么取舍

先看全文。这是 `flutter-app/tool/generate_contract.mjs`，一个不依赖任何代码生成框架的脚本：

```js
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require = createRequire(new URL('../../node-backend/package.json', import.meta.url));
const YAML = require('yaml');
const api = YAML.parse(fs.readFileSync(new URL('../../docs/api/openapi.v1.yaml', import.meta.url), 'utf8'));

const names = ['Article','ArticleSummary','User','Comment','CategoryNode',
               'Tag','TocItem','Notification','Pagination','AuthResult'];

function field(s, k) {
  const x = `json['${k}']`;
  if (s.$ref) {
    const n = s.$ref.split('/').pop();
    return [`Api${n}?`,
      `${x} == null ? null : Api${n}.fromJson(Map<String,dynamic>.from(${x} as Map))`];
  }
  if (s.type === 'array') {
    if (s.items.$ref) {
      const n = s.items.$ref.split('/').pop();
      return [`List<Api${n}>`,
        `(${x} as List? ?? []).map((e)=>Api${n}.fromJson(Map<String,dynamic>.from(e as Map))).toList()`];
    }
    return ['List<String>', `(${x} as List? ?? []).map((e)=>e.toString()).toList()`];
  }
  if (s.type === 'integer') return ['int?', `(${x} as num?)?.toInt()`];
  if (s.type === 'boolean') return ['bool?', `${x} as bool?`];
  return ['String?', `${x} as String?`];
}

let out = '// Generated from docs/api/openapi.v1.yaml. Run node tool/generate_contract.mjs.\n';
for (const name of names) {
  out += `\nclass Api${name} {\n  Api${name}.fromJson(Map<String,dynamic> value) : json = Map.unmodifiable(value);\n  final Map<String,dynamic> json;\n`;
  for (const [k, s] of Object.entries(api.components.schemas[name].properties)) {
    const [t, e] = field(s, k);
    out += `  ${t} get ${k} => ${e};\n`;
  }
  out += '}\n';
}
fs.writeFileSync(root + 'lib/core/generated/models.dart', out);
execFileSync('dart', ['format', root + 'lib/core/generated/models.dart']);
```

有几处值得单独说，因为它们都是**取舍**，不是"没写到那儿"。

**第一，用 Node 脚本而不是 openapi-generator。** 这是全篇最容易被质疑的决定。当时摆在面前的有 `openapi_generator`（Java 生态那套）、`dart-swagger` 等现成方案。我选手写脚本的理由很具体：项目已经有 `docs/api/openapi.v1.yaml` 作为唯一真相源，而生成 DTO 需要的只是 `components.schemas` 里 properties 到 Dart getter 的一层机械映射。这层映射写出来是 24 行，用现成工具要引入一整套 Gradle/Java 运行时、模板配置和多层可调参数，为了 10 个 schema 不划算。

代价我认：**这个脚本只支持我列出的那几种 schema 形态**（`$ref`、`array`、非数组的 `integer`/`boolean`/其它一律当 `String?`）。契约里一旦出现 `oneOf`、`allOf` 或带约束的 `integer`，它不会报错，而是**默默按 `String?` 处理**——这是个已知的静默失败点。真要往生产推，这一段必须换成真正的生成器；现在 10 个 schema 的规模下，手写换来的直观性更值钱。

**第二，末尾强制跑 `dart format`。** 生成物必须是能直接读的代码，而不是一团 minified 单行。这行 `execFileSync` 成本极低，但决定了 `models.dart` 在代码评审里能不能看。

**第三，所有字段一律可选，没有一个 `required`。** 看生成结果就明白——`Pagination` 的四个字段全是 `int?`，连本该必填的 `page` 也是：

```dart
class ApiPagination {
  ApiPagination.fromJson(Map<String, dynamic> value)
    : json = Map.unmodifiable(value);
  final Map<String, dynamic> json;
  int? get page => (json['page'] as num?)?.toInt();
  int? get pageSize => (json['pageSize'] as num?)?.toInt();
  int? get total => (json['total'] as num?)?.toInt();
  int? get totalPages => (json['totalPages'] as num?)?.toInt();
}
```

这是有意的。契约里 `page` 是 required，但我不想让生成层替我决定"什么情况算违约"。**契约描述服务端应该给什么，运行时给成什么样是另一回事**，空安全应该由使用它的那一层来兜底。把 `required` 译成非空类型，等于把一次潜在运行时崩溃提前到解析期——听着是好事，但代价是生成层得内建一套"缺失就抛"的策略，而我更希望缺字段时页面还能显示个降级内容。所以 `page` 的兜底被放到了 Repository（下一节你会看到）。

顺带说一个细节，生成器保留了原始 `json` 引用：

```dart
final Map<String, dynamic> json = Map.unmodifiable(value);
```

所有 getter 都从它读，且用 `Map.unmodifiable` 包了一层。这不是多余的防御——Dart 里字段默认是**可变的**，不锁住的话任何持有模型的 Widget 都能 `json['x'] = y` 悄悄改掉数据源，而这种 bug 在页面上完全看不出来。

跑一次：

```bash
cd flutter-app
node tool/generate_contract.mjs   # Generated 10 typed API models
flutter analyze
```

## Repository 那层，不是"多一层更高级"

生成了模型，接下来有个特别容易犯的错：直接把 `ApiArticleSummary` 铺进 Widget。功能能跑，所以直觉上就该这么干。

不能这么干，因为契约里的形状和页面要的东西**不是一回事**。看 `lib/features/data/reader_models.dart`：

```dart
/// 领域文章模型将摘要、正文与阅读进度组合，统一处理 id 与 slug 路由。
class Article {
  Article.fromJson(Map<String, dynamic> json, {this.progress})
    : data = ApiArticleSummary.fromJson(json),
      content = json['content'] as String? ?? '';
  final ApiArticleSummary data;
  final String content;
  final num? progress;

  int get id => data.id!;                      // ← 注意这个 !
  String get title => data.title ?? '';
  String get route => data.slug?.isNotEmpty == true ? data.slug! : id.toString();
  String get author => data.authorName ?? '会员';
  String get status => data.status ?? 'published';
}
```

看第 14 行那个 `data.id!` ——**强制解包**。这正是上一节那个决定的后果：生成层把所有字段都做成可空，免得它在解析期替你做判断；那么"这个页面必须有一篇有 id 的文章"这条判断，就由 `Article` 这个领域模型来承担。

这个位置的强制解包是**安全的**，因为它被三道防线包着：Repository 只在服务端返回合法文章时构造它、`route` getter 立刻把 id 落地成路由值、页面拿到的已经是领域模型而非 JSON。但如果你在 Widget 里直接解包 `ApiArticleSummary.id`，同一个 `!` 就变成裸奔了——没有任何东西保证它非空。这不是风格问题，是**谁承担风险**的问题。

另外几个 getter 各自消掉了一类真实差异：

| getter | 挡住了什么 |
|---|---|
| `title => ''` | 标题缺失时页面崩掉，或渲染出空白卡片 |
| `route => slug ?? id` | **接口只认 idOrSlug**——有 slug 用 slug，没有就退回 id |
| `status => 'published'` | 后端若返回空状态，客户端不能自己假定已发布 |
| `author => '会员'` | 作者字段可能为空，展示层给个占位而不是塌掉 |

还有分页。服务端有的接口返回 `{list, pagination}` 包裹，有的返回裸数组——这两者在契约里都是合法的。`PageResult` 把差异收敛在一个工厂里：

```dart
factory PageResult.fromJson(
  dynamic input,
  T Function(Map<String, dynamic>) decode,
) {
  final j = jsonMap(input);
  final p = ApiPagination.fromJson(jsonMap(j['pagination']));
  return PageResult(
    (j['list'] as List).map((e) => decode(jsonMap(e))).toList(),
    p.page ?? 1,        // ← 生成层留的空，在这里兜底
    p.totalPages ?? 1,
    p.total ?? 0,
  );
}
```

`p.page ?? 1` 就是那个兜底的具体落点。**可空性在生成层暴露，业务默认值在这一层落地**，这才是那层适配真正的价值所在，而不是多一次 `map`。

## ApiClient 与 Repository 为什么不合并

常见做法是让 Repository 直接持有 Dio、顺手把刷新也写了。问题是刷新这件事的复杂度远超预期。看 `lib/core/network/api_client.dart`：

```dart
// 刷新只处理 access token 过期；禁用账号等错误交给解码处理。
bool _shouldRefresh(Response<dynamic> response) =>
    response.statusCode == 401 &&
    response.data is Map &&
    response.data['code'] == 1002;

Future<Response<dynamic>> _retryAfter(...) async {
  final seconds = int.tryParse(response.headers.value('retry-after') ?? '');
  // 只对 GET 做一次有界等待；写请求绝不自动重放。
  if (response.statusCode == 429 &&
      method == 'GET' && seconds != null && seconds >= 0 && seconds <= 3) {
    await Future<void>.delayed(Duration(seconds: seconds));
    if (start != epoch) throw SessionChanged();
    response = await dio.request(path, ...);
    if (start != epoch) throw SessionChanged();
  }
  return response;
}
```

这段里有三个决定，每一个都是"错了会出事"的那种：

**`_shouldRefresh` 只认 `code == 1002`。** 因为按本项目的错误码分段，`1002` 才是 access token 过期。401 可能还有其他成因——如果图省事写成"凡是 401 就刷新"，账号被封禁这种错误也会触发一次刷新，然后把用户踢出登录态，而正确行为是让他看到"账号已停用"。

**429 的重试加了四个条件：GET、`retry-after` 能解析、秒数非负、且不超过 3 秒。** 最后那个 `<= 3` 看着武断，实际是刻意的：如果服务端让等 60 秒，用户早就把 App 关了，重试机制的意义变成了"假装没限流"。**写请求绝不自动重放**——这是另一条硬线，一个点赞请求发两次，服务端计数就可能变两次。

**`epoch` 前后各查一次。** `clear()` 里会 `epoch++`，表示"会话已换代"。刷新和重试都是异步的，期间用户可能已经登出或者切了账号；不检查代次，一个为旧账号启动的刷新会把令牌写回**已经退出的**会话。`SessionChanged` 是个空类——它不携带任何信息，因为页面拿到它只需要知道"这条响应当废"，具体原因页面并不需要知道。

分工到这里就清楚了：

```text
Widget：点刷新按钮
  → Repository：取哪个资源、用什么缓存策略、映射成什么模型
  → ApiClient：发 HTTP、拆信封、401 单飞刷新、429 有界重试
  → Repository：把传输形状差异消化掉
  → Widget：渲染，或显示可重试的错误
```

一个管通用传输语义，一个管业务读取组合。**判断它们该不该合并的标准是：这两个东西会不会用完全不同的原因失败。** 缓存策略失败和令牌刷新失败，原因完全不搭，就该分开。反过来说，如果哪天你发现自己在 Repository 里写 `dio.post`，就该回头看看是不是塞错了地方。

## 契约变更时，我的手改顺序

现在讲最实际的问题：后端加了字段，Flutter 端怎么办。

我的顺序曾经反过一次。刚接手时我习惯性地直接在 `models.dart` 里手写属性——反正只有十个模型，很好找。结果下一次跑生成器，那几行手改的东西**无声无息地消失了**，因为脚本按 schema 重新生成整个文件。文件里没有任何标记说明那部分是手写的，diff 上只看到一行行删除，干净得像是我想通了要删掉它。

从那以后我把顺序固定成：

```text
改 OpenAPI schema → 重新生成 → 看 diff → 改 Repository 适配 → 改 UI → analyzer + 测试
```

**中间那步"看 diff"不能省，它是发现契约问题的地方。** 举一个我真踩到的：契约里把 `page` 标成了 `required`，生成器却因为不处理 `required` 而产出 `int? page`——这一眼就能看出生成层的规则和契约不是一回事。同理，如果 `Article` 的 diff 突然冒出几十行重排，说明排序不稳定，这时候该怀疑的是生成器版本漂移，不是你的 schema 写坏了；噪声会把真正的差异埋掉。

所以契约变更的 PR 至少要包含四样：YAML diff、生成结果 diff、Repository 映射变化、对应的测试。少了生成 diff 那一份，等于没证明模型更新过。

还有一条纪律：**手写代码一律不进 `core/generated/`。** 那里任何一行改动都会在下一次生成时被覆盖，而且会被误认为是契约的一部分。适配逻辑放到 `features/data/`，生成器只管机械映射。

## 一条我没有做的事

结尾说个反向的选择。

OpenAPI 有能力生成**完整客户端**——连 endpoint 方法、带类型的请求参数一起生成。那样连 `api_client.dart` 这 344 行都不用写。我没用，理由是上面那三个决定：单飞刷新、`code` 分段语义、`Retry-After` 的有界等待，都和应用特定的规则纠缠在一起，而生成器产出的 transport 是黑盒，你很难把既有约束插进去。

但这不构成"永远不要生成客户端"的结论。如果接口数量从现在的规模涨十倍，`features/data/` 里那些 Repository 映射会开始难维护，那时候重新评估生成完整 client 的成本是合理的。**这里的选择只对当前规模负责。**

同理，前面那个 24 行生成器的静默失败点（不支持 `oneOf`/`allOf`）、以及"所有字段一律可选"这个决定，都是在当前 10 个 schema 下划算的取舍。规模一变，它们就该被重新审视——我把这些写下来，是为了让下一个接手的人知道边界在哪，而不是以为这是通用做法。

## 小结

这篇真正想留下的不是"我用了 OpenAPI"，而是那条链路上每一层各自负责什么：契约决定结构，生成器做机械映射，Repository 承担可空性和形状差异，ApiClient 兜住令牌与限流，Widget 只管渲染。

那 24 行生成器是整条链路里最短的一段，但它逼着我把每个决定的理由都写清楚——包括那几个我**故意没做**的边界。没有这些取舍说明，下一个人只会看到"这个项目用了个手写生成器"，然后要么照抄，要么推翻，而不知道哪些是有意为之。

下一篇我们进 `Dio + Repository`，把信封拆包和模型适配那条线走得更细一点。

## 延伸阅读

- [契约先行：设计一套被六个端复用的 API](https://blog.csdn.net/fungleo/article/details/164140515)
- [Dio + Repository：统一响应信封与模型适配]({{LINK:M4-07}})
- [前端 OpenAPI 生成类型为什么请求函数仍然手写](https://blog.csdn.net/fungleo/article/details/165721265)

---

如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->

## 发布辅助信息

### 文章 Tag（6 个）

`Flutter`、`OpenAPI`、`代码生成`、`Dart`、`API设计`、`软件架构`

### 文章简介（250 字以内）

结合 Flutter 项目目录和 OpenAPI 生成脚本，拆解生成 DTO、Dio API Client、Repository 与 Widget 的职责边界。代码生成减少契约重复，却不保证真实接口行为正确；文章进一步说明模型适配、可重复生成和静态检查该如何配合。

### 建议发布分类

全栈开发 / Flutter

### 封面短标题

生成代码不等于生成架构

### 配图 AI 提示词

1. `M4-03-封面`：16:9 中文技术封面，OpenAPI YAML 契约经生成器形成 Dart DTO，再流入 Dio、Repository、Flutter Widget 的分层数据管线，深蓝背景、青绿箭头，标题“生成代码不等于生成架构”。
2. `M4-03-目录`：16:9 分层工程目录图，app、core/network、core/generated、features/data、features、shared 各自职责标注，突出单向数据流和真实工程目录。

### 发布前核对

- [ ] 替换 2 处配图占位符
- [ ] M0-05、M4-07、M2-04 发布后回填站内链接
- [ ] 生成器命令执行结果与文章版本对应
- [ ] 已删除本辅助区
