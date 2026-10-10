# 成为全栈·Flutter App 篇·Refresh Token 旋转与并发 401：安全存储与会话代次

上一篇文章末尾留了个伏笔：缓存键里那个 `session:${api.userId}:${api.epoch}`，我一直没解释 `epoch` 是什么。今天补上——顺便讲一个我在接入真实后端时被"教育"的问题。

先说结论：**Refresh Token 轮换这件事，难的不是旋转，是并发。**

设想一个很自然的场景。用户打开 App 首页，首页同时发起 5 个请求；这 5 个请求几乎同时到达服务器，而 token 恰好在这一刻过期。服务器会对其中**每一个**都返回 401。

如果每个 401 都独立去刷新，会发生什么？5 个刷新请求同时打出去，服务端的 Refresh Token 是**有状态、有轮换**的（用一次就作废发下一个），于是 5 个里有 4 个拿着已经作废的 token 去换，全部失败，账号被踢下线。

用户看到的是：刚登录，一进首页就掉线。这个 bug 在开发环境几乎复现不出来——因为 token 没过期。

这篇讲怎么在 Dart 里把这三道栅栏垒起来：**单飞刷新**、**迟到响应跨会话隔离**、**重放限制**。代码全部来自 `flutter-app/lib/core/network/api_client.dart`（344 行）。

{{IMG:M4-09-封面}}

## 先划一条线：Flutter 不走 Cookie

动手之前有个前提得说清楚，它决定了这套代码的形态。

M1 讲后端时提过，本项目的认证是 **JWT access token + 有状态 refresh token**，接口认证靠 `Authorization: Bearer`，不是 Cookie。这在浏览器里有个坑——但**在 Flutter 里这个坑不存在**。

原生客户端没有浏览器自动携带 Cookie 的机制，也没有同源策略那套东西。所以 Flutter 端不需要 CSRF token、不需要 `withCredentials`、不需要考虑"第三方站点会不会自动带上我的会话"。它要做的只是：

```dart
headers: {
  if (!anonymous && accessToken != null)
    'Authorization': 'Bearer $accessToken',
},
```

就这么一行，比 Web 那边干净得多。**但省下来的不是复杂度，是"防错的空间"**——Web 上那堆 Cookie 防御，正是为了防止别人冒用你的身份；原生端没人能自动带 cookie，风险就低。

代价是：**职责从框架转移到了我们手上**。Web 上 Cookie 由浏览器管理并发和过期；原生端这些全部要自己实现。后面三道栅栏就是这笔债。

## 令牌存哪：不是 SharedPreferences

access token 短效，refresh token 长效，直接丢进内存不行（App 一杀就没了）。那存哪？

我一开始用的是 `shared_preferences`。后来改成了 `flutter_secure_storage`，理由是这个 App 里 refresh token 的有效期是以**天**计的，而且它在移动端——设备可能被 root、可能被备份、可能被别的 App 读。

```dart
/// 令牌存储接口允许测试替换为内存实现，业务代码不接触存储细节。
abstract interface class TokenVault {
  Future<String?> read();
  Future<void> write(String? token);
}

/// 按接口环境隔离安全存储中的刷新令牌，避免开发与线上会话互相覆盖。
class SecureTokenVault implements TokenVault {
  SecureTokenVault({this.namespace = "local"});
  final String namespace;
  String get key => "reader.refresh.$namespace";
  final FlutterSecureStorage storage = const FlutterSecureStorage();

  @override
  Future<String?> read() => storage.read(key: key);

  @override
  Future<void> write(String? token) => token == null
      ? storage.delete(key: key)
      : storage.write(key: key, value: token);
}
```

两个细节值得单独拎出来：

**抽象成接口是为了测试。** `TokenVault` 只有读和写两个方法。测试里换成内存实现，就能在毫秒级模拟"存储里有/没有 token""写入失败"这些真实设备上很难构造的场景，而不用真的去戳系统密钥链。业务代码完全不接触存储细节。

**`namespace` 是为了隔离环境。** 键是 `reader.refresh.local`，打的是 `reader.refresh.production`。同一台机器上开发环境连本地后端、线上版本连真实服务，如果共用一个键，**两个 App 会互相覆盖对方的 token**——表现是开发版偶尔莫名其妙掉线。`namespace` 一个参数省掉了一整类玄学问题。

顺便注意 `write(null)` 被实现成 `delete` 而不是"写入空字符串"。这两种语义在后续的"是否已登出"判断里是等价的，但在存储层含义不同——**把登出表达成一个动作，而不是一个空值**，比每次调用点都判断一遍要可靠。

{{IMG:M4-09-认证时序}}

## 第一道栅栏：单飞刷新

现在回到开头那个场景：5 个请求同时 401。

最直觉的写法是在拦截器里收到 401 就去刷新。Dart 里最自然的实现是：

```dart
// 错误示范：5 个 401 → 5 次刷新
if (response.statusCode == 401) {
  await refresh();          // 每个请求各刷一次
  return retry(request);
}
```

问题就在 `await refresh()` 拦不住并发。**五个请求几乎同时进来，各自看到 `_refresh == null`，于是各自启动了一次刷新**。这不是"写错了"，是这段逻辑在并发下天然如此——检查和赋值之间没有原子性。

修法是**共享同一个 Future**。看真实实现：

```dart
Future<void> refresh() {
  if (_refresh != null) return _refresh!;     // ① 有人正在刷，直接用它的结果
  final start = epoch;
  final task = () async {
    try {
      final token = await vault.read();
      if (start != epoch) throw SessionChanged();
      if (token == null) {
        throw const ApiFailure('请登录后继续', code: 1004, status: 401);
      }
      final data = await request(
        Endpoints.refresh,
        method: 'POST',
        data: {'refreshToken': token},
        refreshAllowed: false,               // ② 刷新请求本身不再触发刷新
      );
      await install(
        Map<String, dynamic>.from(data as Map),
        expectedEpoch: start,
      );
    } on ApiFailure catch (e) {
      if ([1002, 1003, 1004, 1005].contains(e.code) && start == epoch) {
        await clear();
        onExpired?.call();
      }
      rethrow;
    }
  }();
  _refresh = task;
  return task.whenComplete(() {
    if (identical(_refresh, task)) _refresh = null;   // ③ 只清自己那一个
  });
}
```

三个点合起来才是完整的单飞：

**① `_refresh != null` 时直接复用。** 第一个 401 触发刷新并把 Future 存进 `_refresh`，后面 4 个 401 进来时看到非空，直接 `return _refresh!` 挂在这个 Future 上等结果。**只有一个网络请求，其余四个等它。**

**② `refreshAllowed: false`。** 刷新请求自己也会带 `Authorization`，也可能拿到 401。如果不关掉这个开关，`/auth/refresh` 返回 401 → 触发刷新 → 刷新请求又返回 401 → **无限递归直到栈溢出**。这个开关是硬性安全边界。

**③ `identical(_refresh, task)` 这个判断不能省。** 清理时如果不确认"存进去的还是不是我自己这个"，就会出这种问题：A 的刷新结束了，此时恰好 B 刚开始刷新，A 的 `whenComplete` 把 `_refresh` 清成 null —— B 的刷新还在飞，但这个字段已经空了，第三个 401 就会又启动一次刷新。`identical` 保证了**只有持有者的清理才生效**。

Dart 的单飞和 Java 不太一样：Java 里通常靠 `synchronized` 包住"检查+赋值"这两步；Dart 是单线程事件循环，`_refresh = task` 之前不会被抢占，所以裸赋值就是原子的。但 `whenComplete` 回调是异步的，所以第 ③ 点依然必要。

## 第二道栅栏：epoch 挡住迟到响应

单飞解决了"别重复刷"，但引出了新问题：**什么时候清掉那个正在飞的刷新？**

朴素做法是"谁先发起谁负责清"。但用户可能在刷新进行到一半时点了退出登录——这时那个刷新**还会成功返回**（服务器并不知道你已登出），然后它把新 token 写回去。**登出之后，token 又活过来了。**

`epoch` 就是为这个场景准备的。它是一个**单调递增的会话代次计数器**，每次会话状态变化就 `+1`：

```dart
/// 请求期间账号发生变化的控制信号；页面应忽略旧响应而非提示网络错误。
class SessionChanged implements Exception {}

int epoch = 0;

/// 清除会话先提升代际，使刷新和旧请求不能重新写入已退出的令牌。
Future<void> clear() async {
  epoch++;
  accessToken = null;
  userId = null;
  onSessionChanged?.call();
  await _persist(null);
}
```

**顺序是关键：先 `epoch++`，再清别的。** 如果反过来先清 token 再加代次，中间那个窗口里可能已经有别的协程读到了"token 已清、代次未变"的中间状态。

然后看 `epoch` 是怎么被检查的。整个 `api_client.dart` 里有五处 `if (start != epoch) throw SessionChanged();`，它们构成一道网：

```dart
final start = epoch;                       // 请求发起时记下当前代次
final originalToken = accessToken;
try {
  Response<dynamic> response = await dio.request(...);
  if (start != epoch) throw SessionChanged();        // ① 响应回来时代次已变
  if (refreshAllowed && !anonymous && _shouldRefresh(response)) {
    if (originalToken == accessToken) await refresh();
    if (start != epoch) throw SessionChanged();      // ② 刷新完再确认一次
    return await _request(..., refreshAllowed: false);
  }
  response = await _retryAfter(...);
  if (start != epoch) throw SessionChanged();        // ③ 重试后
  final result = await _decode(response, start);
  if (start != epoch) throw SessionChanged();        // ④ 解码后
  return result;
} on DioException catch (e) {
  if (start != epoch) throw SessionChanged();        // ⑤ 失败路径同样要查
  ...
}
```

**每一处 `await` 之后都查一次。** 这看起来啰嗦到有点不专业——`_decode` 是纯本地解码，按理说不会跨越会话边界。但 `await` 就是一道可能被打断的边界，用户可以在任何一格退出登录。

我一度想只保留最前面那一处。后来想明白：**这种"多加一行"的成本和漏掉的代价完全不成比例。** 漏掉第 ④ 处，`_decode` 内部就会拿到一个属于旧账号的响应，然后用旧数据渲染页面——用户已经登录成 B 账号了，屏幕上却显示 A 的文章。这种 bug 复现一次就够记很久。

`SessionChanged` 是个空类，不带任何字段。这是刻意的：**页面拿到它只需要知道"这条响应当废"，具体原因页面不需要知道**。带一堆字段反而会诱导页面去 switch 判断，最后写出"如果是 A 原因就显示 X，如果是 B 原因就显示 Y"——而那本该在数据层就已经处理掉了。

## 第三道栅栏：什么时候该刷，什么时候只是重放

回到那个并发场景。现在 `_request` 里处理 401 的部分是这样的：

```dart
if (refreshAllowed && !anonymous && _shouldRefresh(response)) {
  if (originalToken == accessToken) await refresh();
  ...
  return await _request(..., refreshAllowed: false, ...);
}
```

注意 **`if (originalToken == accessToken) await refresh();`** 这一行——它经常被误读成"检查令牌有没有变"。

它的真实作用是**避免重复触发刷新**。想一下：请求 A 用旧 token 发出去，在路上的时候用户手动下拉刷新触发了另一次 `refresh()`，token 已经换成新的。此时 A 的响应回来了，带着 401（因为它带的是旧 token）。

如果不判断就 `await refresh()`，A 会触发第二次刷新——而 A 的 `_refresh` 复用逻辑虽然能挡住并发情况下的重复，但这里 A 看到的是"token 已经和发起时不同"，说明**确实有一次刷新刚成功完成**，再刷一次是纯浪费，而且是拿新 token 去换，可能又触发一轮轮换。

`originalToken == accessToken` 表达的是：**"如果我发这个请求时用的 token 还在用，那说明还没人替我刷新过，我得自己刷；如果已经被刷新过了，直接用新的重放就行。"**

而 `_shouldRefresh` 又从另一个方向收窄了刷新范围：

```dart
// 刷新只处理 access token 过期；禁用账号等错误交给解码处理。
bool _shouldRefresh(Response<dynamic> response) =>
    response.statusCode == 401 &&
    response.data is Map &&
    response.data['code'] == 1002;
```

**只认 `1002`。** 这个细节上一篇文章提过一句，这里说完整：401 在本项目里至少有三种含义——access token 过期（1002）、refresh token 也失效了（1003/1004）、账号被停用（1005）。只有第一种该刷新。

如果是 1005（账号停用），也去刷新会怎样？刷新请求带着一个已经被服务端拒绝的 refresh token 去换，失败，触发 `clear()`，用户被踢出登录——**但正确行为是告诉他"账号已被停用，请联系管理员"**。这个差别很关键：一个误解成"登录过期，请重新登录"的用户会反复登录失败，而真实原因他根本无从知道。

重放本身也有限制。重放时传的是 `refreshAllowed: false`（不再二次刷新），FormData 要 `clone()`（Dart 里 `FormData` 被消费一次就不能重用）：

```dart
data: data is FormData ? data.clone() : data,
```

还有一个容易被忽略的约束：**重放只发生在 GET 上**。因为 `_shouldRefresh` 只对 `code == 1002` 响应生效，而写请求一旦真的到达服务端执行了，即使我们收到 401 再重放，也可能重复创建。文章后面聊 429 的时候会讲为什么写请求宁可失败也不自动重试——那是同一条原则的两面。

{{IMG:M4-09-会话代次}}

## 会话隔离：缓存键里的那个 epoch

现在可以补上开头那个伏笔了。M4-07 里那个缓存键：

```dart
String key(String path, Map<String, dynamic> query, {bool private = false}) {
  return CacheKey(
    api.baseUrl,
    private ? 'session:${api.userId}:${api.epoch}' : 'public',
    path, query,
  ).encode();
}
```

**为什么私有键里要带 `epoch`，光有 `userId` 不够？**

场景：用户 U1 登录，进会员中心，产生一堆私有缓存（收藏、点赞、通知）。然后他退出登录，U2 登录。

如果键只有 `userId`，那 U1 和 U2 是不同用户，键本来就不同，似乎没问题。**但危险在于同一个用户重新登录的情况**：U1 退出后又登录了一次，`userId` 相同，`epoch` 不同。此时如果键只含 `userId`，**U1 退出前的老缓存会被 U1 登录后的新会话读到**。

听起来无害（同一个人）？不一定。上一次的会话可能留下了"已读的通知列表""已上传的稿件草稿"，而这次登录的用户看到的是过期的会话状态。更糟的情况是：上一次会话是管理员，这次是普通会员——**权限已经变了，缓存里却还是管理员的数据**。

`epoch` 让每次会话都拿到全新的键空间。`onSessionChanged` 回调进一步触发清理：

```dart
// 会话隔离清理不影响公开资源，也不触及按账号保存的投稿草稿。
void resetPrivate() {
  CodeCache.clear();
  images.resetPrivate();
  favoriteIndex.resetFavoriteIndex();
  reactions.clear();
  favoriteIndex.overrides.clear();
  snapshots.removeWhere((_, s) => s.tags.contains('private'));
  cache.invalidate({'private'});
  reactionStore.events.add(-1);
}
```

注意这里**只清私有部分**：公开文章缓存不动，投稿草稿也不动（草稿按账号存，不是按会话存）。这个区分要是搞混了，用户每次登录都要重新下载一遍文章列表，体验很差。

## 顺带解决的一个顺序问题

刷新成功后要把新 token 写进安全存储。如果连续两次刷新（比如用户快速切换环境），两次写入可能并发，而 `FlutterSecureStorage` 的写入不是原子的。

```dart
Future<void> _persist(String? token) {
  final next = _storageQueue
      .catchError((Object _) {})      // 上一次失败不影响这一次
      .then((_) => vault.write(token));
  _storageQueue = next;
  return next;
}
```

用一条 Future 链把写入**串行化**，并且用 `catchError` 吞掉上一次的错误——否则前一次写失败会把整条链废掉，后面的写入全都执行不了。

`install()` 里还夹了一处代次检查，位置很讲究：

```dart
Future<void> install(Map<String, dynamic> auth, {int? expectedEpoch}) async {
  if (expectedEpoch != null && expectedEpoch != epoch) throw SessionChanged();
  final token = auth['refreshToken'] as String?;
  if (token == null || token.isEmpty) {
    throw const ApiFailure('服务未返回刷新令牌，请重新登录');
  }
  await _persist(token);                                          // 落盘
  if (expectedEpoch != null && expectedEpoch != epoch) throw SessionChanged();
  accessToken = auth['accessToken'] as String;                     // 改内存
  ...
}
```

**写盘前后各查一次。** 因为 `_persist` 里的 `await` 是一个真实的挂起点——用户在落盘期间退出登录是完全可能的。前置检查挡住"进来时已经换代"，后置检查挡住"存盘期间被登出"。只要少一个，就有一个窗口让旧 token 写进已经登出的会话。

## 三道栅栏的分工

最后收一下：

| 栅栏 | 防的是什么 | 手段 |
|---|---|---|
| 单飞刷新 | 并发 401 触发多次刷新，轮换 token 互相作废 | 共享 `_refresh` Future + `identical` 清理 |
| epoch 隔离 | 迟到响应把旧会话数据写回来 | 每次 `await` 后查 `start != epoch` |
| 重放限制 | 不该刷新的错误也刷、写请求重复执行 | 只认 `code == 1002` + `refreshAllowed` 一次性 |

三者的共同点是**都不试图"更快"，只试图"更少出错"**。特别是第二条——多写五行检查，换来的是一个"加了 `await` 就必须重新检查"的纪律。这类代码的正确性不靠聪明的推理，靠**每次都照做**。

也正因为如此，它需要测试。项目里 `TokenVault` 可以替换成内存实现，于是"两个并发 401 只触发一次刷新""刷新期间登出导致 token 不复活""连续两次刷新不互相覆盖"这几条都能写成断言。**能让并发路径被断言覆盖，前提是存储和时钟都能被替换**——这也是把 `TokenVault` 抽象成接口的真正理由。

## 小结

Refresh Token 轮换的实现难度不在轮换本身，在于**它是这个项目里唯一一处"同一时刻有多个协程在改同一份状态"的地方**。列表加载、缓存读写都是各自独立的，只有这里必须回答：谁可以刷新、刷新的结果给谁、什么时候作废。

三个答案对应三道栅栏：**同一时刻只允许一个刷新（单飞 Future）、令牌属于哪个会话（epoch）、哪些错误才配触发刷新（错误码 + 一次性重放标志）**。

顺带一个规律：**凡是需要 `await` 的地方，后面都要重新确认前置假设还成立。** Dart 没有多线程数据竞争，不代表没有这类逻辑竞争——`await` 本身就是一次可能被用户行为打断的边界。这条纪律在 Web 端同样适用，只是 JS 单线程下更容易被忘掉，因为大家习惯假设代码是连续执行的。

下一篇讲错误与限流：`429` 的 `Retry-After` 该不该等、`seconds <= 3` 那个武断的上限怎么来的，以及为什么写请求宁可报错也不自动重试。

## 延伸阅读

- [Dio + Repository：统一响应信封与模型适配]({{LINK:M4-07}})
- [移动端错误与限流：429、重试和写请求边界]({{LINK:M4-08}})
- [注册登录全流程实现](https://blog.csdn.net/fungleo/article/details/164396193)

---

如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->

## 发布辅助信息

### 文章 Tag（6 个）

`Flutter`、`JWT`、`Token刷新`、`身份认证`、`移动安全`、`全栈开发`

### 文章简介（250 字以内）

移动端认证不能止于“登录成功”。Refresh Token 轮换要求并发 401 共享一次刷新、串行保存新凭据，并防止退出或切换账号后的迟到响应污染新会话。本文结合 Flutter ApiClient、Session 与测试说明 token 存储、安全边界和会话代次设计。

### 建议发布分类

全栈开发 / Flutter

### 封面短标题

并发 401 只刷新一次

### 配图 AI 提示词

1. `M4-09-封面`：16:9 中文安全架构封面，多条 API 401 请求汇聚到一个 refresh token 轮换任务，access 内存、refresh 安全存储，账号 epoch 阻挡旧响应，深蓝紫色与青色。
2. `M4-09-认证时序`：16:9 时序图，三请求共用单飞刷新、写入旋转凭据、用户退出递增 epoch、迟到响应被丢弃，中文标签清楚。
3. `M4-09-会话代次`：16:9 中文时序图，三道栅栏——单飞刷新、epoch 拦截迟到响应、按需重放；标出缓存键里的 epoch 与会话隔离，深蓝底亮蓝箭头。

### 发布前核对

- [ ] 替换 3 处配图占位符
- [ ] M4-06、M4-08、M3-11 发布后回填站内链接
- [ ] 与 Session 实际 refresh 并发实现和错误码核对
- [ ] 已删除本辅助区
