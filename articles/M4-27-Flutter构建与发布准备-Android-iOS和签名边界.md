# 成为全栈·Flutter App 篇·Flutter 构建与发布准备：Android、iOS 和签名边界

这一篇写的是一件技术含量不高、但绕不过去的事：**怎么把这个 App 打包出去。**

先说结论，因为这个结论可能会让期待"完整发布流程"的人失望：

**Android 能在本地打出 APK，iOS 打不出 IPA。**

原因是我这台 Mac 没有完整的 Xcode。所以这一篇会明确区分三件事——**已经验证过的、配置好但没验证的、根本没有的**——而不是含糊地说"支持双端"。

{{IMG:M4-27-封面}}

## 三个端点，三种 URL 注入

先讲一个贯穿所有构建的基础设施：**API 地址在编译期注入。**

```bash
flutter run -d emulator-5554 \
  --dart-define=API_BASE_URL="https://api-befull.kao9.com/api/v1" \
  --dart-define=DEV_HTTP_PROXY=""
```

`--dart-define` 是 Dart 编译器的"环境变量"。它在**编译时**把字符串替换进二进制，所以运行时不可改。

代码里这样读：

```dart
final base = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://api-befull.kao9.com/api/v1',
);
```

**关键是那个 `defaultValue`。** 它意味着即使忘了传 `--dart-define`，App 也能跑——但会连到**生产环境**。

这个默认值的取舍值得想清楚。我一开始想的是"默认应该指向本地开发环境"，因为更安全。但那样的话，忘了传参就完全无法启动，而 CI 里跑构建时也必须每次记得传。

现在的选择是**默认指向线上**，理由是：

- 忘记传参时 App 仍然可用（连生产只读接口）
- 不会意外把测试环境的写操作打到生产
- **要打生产包时什么都不用传**

而开发环境必须显式传参：

```bash
API_BASE_URL="http://localhost:11000/api/v1" tool/run_android.sh
```

**这个方向的选择是反直觉的，但结论是对的：默认值应该让"构建产物能用"，而不是"最安全"。** 因为不安全的那个方向已经被别的东西挡住了——dev 环境要显式声明，等于多一道手动确认。

那个 `DEV_HTTP_PROXY` 是调试用的：

```dart
const proxy = String.fromEnvironment('DEV_HTTP_PROXY');
if (kDebugMode && proxy.isNotEmpty && transport == null) {
  dio.httpClientAdapter = IOHttpClientAdapter(
    createHttpClient: () => HttpClient()..findProxy = (_) => 'PROXY $proxy',
  );
}
```

**注意 `kDebugMode &&` 这个条件。** 代理只在 debug 构建里生效——release 构建即使传了这个参数也不走代理。

为什么加这个条件？因为代理配置是给"本机调不通某个接口"用的，而 **release 包发给用户时如果还带着代理配置，那个代理地址就是配置项的一部分**，会暴露内部网络信息。

而那个 `transport == null` 是给测试用的——测试注入了一个假 transport，就不该再包代理。

## Android：能构建，但签名还是 debug

先说实际状态。`android/app/build.gradle.kts` 里：

```kotlin
applicationId = "com.yingzhou.fullstack_reader"
minSdk = flutter.minSdkVersion
targetSdk = flutter.targetSdkVersion
...
signingConfig = signingConfigs.getByName("debug")
```

**三件事的现状**：

| 项 | 状态 |
|---|---|
| applicationId | 已定（`com.yingzhou.fullstack_reader`） |
| minSdk / targetSdk | **跟随 Flutter 版本**，没有显式指定 |
| release 签名 | **仍然是 debug** |

第三行是当前最大的缺口。**用 debug 签名打出的 APK 不能上架应用商店**——Google Play 会拒绝，而原因不是配置问题，是 debug 证书的有效期只有 25 年且不属于任何人。

要做完整的 release 签名，需要四样东西：

```
upload keystore（或 app signing key）
keystore 密码
key 密码
key alias
```

**这四样都不该进代码仓库。** 所以 `build.gradle.kts` 里应该是读环境变量的形式：

```kotlin
// 目标形态（尚未实现）
val keystorePath = System.getenv("ANDROID_KEYSTORE_PATH")
    ?: error("发布构建需要 ANDROID_KEYSTORE_PATH")
signingConfigs {
    create("release") {
        storeFile = file(keystorePath)
        storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
        keyAlias = System.getenv("ANDROID_KEY_ALIAS")
        keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
    }
}
```

**用 `error()` 而不是给默认值**——发布构建缺签名就明确失败，而不是悄悄用 debug 签名打出一个"看起来成功"的包。

**后者是一个很容易发生也很难发现的错误**：CI 里签名配置漏了，构建成功，产物也出来了，而它根本装不上正式环境。

第二行那个 `minSdk = flutter.minSdkVersion` 也值得说。跟随 Flutter 版本是合理的默认，但**这意味着 Flutter 升级可能静默改变最低支持版本**——某天升级 Flutter，用户里有一批老设备突然装不上了。

要稳，应该显式写死：

```kotlin
minSdk = 23      // Android 6.0
```

这不是我现在要改的，但它是升级 Flutter 时必须检查的一项。

而 M4-25 讲的那个 `minTapTarget = 44` 是另一回事——那是设计约束，和 `minSdk` 无关。

## iOS：配置在，但一行都没验证

现在说 iOS。这一篇里最重要的一段。

`ios/` 目录存在，`Info.plist` 里有配置。但我必须如实说：

**这个开发机没有完整的 Xcode，所以 iOS 的构建、真机运行、签名、打包，全部没有验证过。**

具体没验证的清单：

- ❌ `flutter build ios` 能否成功
- ❌ CocoaPods 依赖能否正常安装
- ❌ WebView 插件在 iOS 上的行为（**M4-15 讲的那个返回逻辑，只有 Android 有证据**）
- ❌ 安全存储（`flutter_secure_storage`）在 iOS Keychain 下的行为
- ❌ 相机/相册权限的实际弹出
- ❌ 签名证书、Provisioning Profile、App Store 上传

**而"没有验证"这件事本身，比"有问题"更需要说清楚。**

因为如果我说"iOS 支持"，读者会以为可以用。如果我说"iOS 可能有问题"，读者会以为有已知缺陷。**实际情况是：不知道。**

那么 iOS 上**可以合理推断**会用到的能力有哪些？从代码看：

| 能力 | 用到的插件 | iOS 上的已知约束 |
|---|---|---|
| 网页 | `webview_flutter` | 需要 ATS 配置允许 HTTP |
| 相册 | `image_picker` | 需要 `NSPhotoLibraryUsageDescription` |
| 存储 | `flutter_secure_storage` | 需要 Keychain 权限 |
| 分享 | `share_plus` | 需要 `NSPhotoLibraryAddUsageDescription` |

**这些插件都在 iOS 上有成熟支持，所以大概率能跑。** 但"大概率"和"验证过"是两回事，而我不打算把前者说成后者。

顺带说 **ATS（App Transport Security）** 这个问题值得单独提。**iOS 默认禁止 App 发起明文 HTTP 请求**，而我们本地开发要连 `localhost:11000`。

所以 `Info.plist` 里必须有：

```xml
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSAllowsLocalNetworking</key>
  <true/>
</dict>
```

而这个例外配置**只应该出现在 Debug 配置里**，Release 不该有——**发布包里能发明文 HTTP 是个安全问题**。

现在还没验证 Release 的 Info.plist 里有没有这条。**这是我下一步要做的第一件事。**

## 构建产物验证：不只是"构建成功"

一个我觉得很多人会忽略的点：**`flutter build apk` 成功，不等于产物是对的。**

我现在的验证清单：

| 检查 | 怎么做 |
|---|---|
| 架构覆盖 | `unzip -l app-release.apk \| grep lib/` 看有哪些 ABI |
| baseUrl 正确 | `strings app-release.apk \| grep kao9` |
| 无 debug 代码 | 检查 `kDebugMode` 分支是否被裁掉 |
| 体积 | 超过预期就去查是什么打进去了 |
| 能装能跑 | 真机安装并走一遍主流程 |

第二条特别有用：**`strings` 能看出编译进去的常量。** 这是验证 `--dart-define` 真的生效的最直接方法——因为如果你传错了地址，App 会连到错误的环境，而这种错误在开发时往往看不出来（因为两个环境都有数据）。

而 ABI 那条关系到发布体积。**如果打出了包含全部架构的 APK，体积会大一倍以上**——因为里面塞了 arm64、armeabi-v7a、x86_64 三份代码。

现在的配置没有用 `--split-per-abi`，所以打出来是胖 APK。**这是可以改的，而且对真实用户有意义**——安装包小一半，对下载流量的用户是实际的好处。

## 版本号与构建号的分岔

`pubspec.yaml` 里：

```yaml
version: 1.0.0+1
```

那个 `+1` 是 build number，在 Android 上对应 `versionCode`，在 iOS 上是 `CFBundleVersion`。

**问题在于：每次提交都要手动改这个数字。**

而忘了改的后果很具体：**Google Play 会拒绝上传**，因为版本号必须严格递增。

现在的做法是每次发版手动改。更好的做法是让 CI 从 git tag 推导：

```bash
# 目标形态：tag → 版本号
VERSION=$(git describe --tags --abbrev=0 | sed 's/^v//')
BUILD=$(git rev-list --count HEAD)
flutter build apk --build-number="$BUILD" --build-name="$VERSION"
```

**用 commit 数量当 build number，因为它天然递增。** 而版本名从 tag 来，避免"改了 pubspec 但忘了同步 tag"。

现在没做，因为还是手动发版。**但这是发版第三次的时候必然要改的**——手动改版本号在改到第十几个包的时候会忘。

顺带说清楚一件事：**版本号和 git tag 不是一回事。** 前者是给商店看的（用户看到的），后者是给开发流程用的（代码快照标识）。它们可以不一致，但**不该长期不一致**。

## 一条我一开始想省掉的事

`--dart-define` 那个默认值，我一开始写的是：

```dart
const base = String.fromEnvironment('API_BASE_URL');   // 没有 defaultValue
```

这样更"严格"——忘传就编译成空字符串，App 连不上任何地址，问题立刻暴露。

但它在**发布构建时**成了问题：CI 里如果忘了传，整个包静默地变成"连不上任何服务器"，而构建**成功**了。产出一个完全不可用的包。

改成现在这样（默认指线上）之后，同样的忘记会得到"能用但连的是生产"的包——**后者可以用，只是不够理想。**

这个取舍的通用形式是：**默认值的选择，要在"失败方式"和"可用性"之间权衡。** 严格默认值让错误早暴露，但代价是把错误挪到了运行时而不是构建时。

而更好的解法其实是**在构建脚本里断言**：

```bash
# run_android.sh 现在的形态
exec flutter run -d "${1:-emulator-5554}" \
  --dart-define=API_BASE_URL="${API_BASE_URL:-https://api-befull.kao9.com/api/v1}"
```

`${VAR:-default}` 这个写法让脚本层面也能兜一层。**三层防护**：脚本默认值、代码默认值、以及发布时的手动确认。

顺带说，那句注释里有个值得记的点——这个脚本用 `exec flutter run` 而不是 `flutter run`。因为 `exec` 会**替换当前进程**，这样后续的信号（比如 Ctrl-C）能直接传给 flutter 进程。少了 `exec`，Ctrl-C 只杀掉脚本，flutter 进程可能残留成一个后台进程占着设备。

**这种"差一个词"的问题不会报错，但会留下奇怪的现象。** 表现是"Ctrl-C 之后 App 还在设备上跑着"。

## 小结

这一篇的结论都是状态性的，因为构建这件事的难点不是技术，是**诚实**：

| 项 | 状态 |
|---|---|
| Android 本地构建 | ✅ 已验证 |
| Android release 签名 | ❌ 仍是 debug，上架前必须补 |
| ABI 拆分（减小体积） | ❌ 未做 |
| 版本号自动化 | ❌ 手动，改到第十几个包时会忘 |
| iOS 全部环节 | ⚠️ **一行都没验证**（本机无 Xcode） |

而四条通用经验：

1. **`--dart-define` 的默认值要让"构建产物能用"** —— 而不是让错误早暴露。
2. **release 签名缺失要明确失败** —— 不能静默用 debug 签名。
3. **"配置存在"不等于"验证通过"** —— iOS 的例子。
4. **`exec` 换成当前进程** —— 这种"差一个词"的问题不报错但留怪现象。

第 3 条是这一篇的核心。它对应整个系列反复出现的一个判断——**区分"知道是对的"、"知道是错的"和"不知道"**。iOS 属于第三类，而**第三类最容易被误写成第一类**。

M4-15 讲 WebView 时说"Android 有证据，iOS 未验收"，M4-26 讲测试时说"WebView 那个集成测试只在 Android 跑过"——**这些地方的口径是一致的，而这种一致性比任何单个技术结论都重要。**

下一篇是这个批次的复盘，讲这一路复用了什么、新增了什么，以及哪些东西留给了下一批。

## 延伸阅读

- [测试分层：单元、Widget、集成与线上只读验证]({{LINK:M4-26}})
- [内置 WebView：网页历史、App 返回与外链安全]({{LINK:M4-15}})
- [第四批复盘：复用了什么，移动端又新增了什么]({{LINK:M4-28}})
- [Flutter 缓存：fresh、stale、expired 与账号边界]({{LINK:M4-23}})

---

如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->

## 发布辅助信息

### 文章 Tag（6 个）

`Flutter`、`Android`、`iOS`、`应用发布`、`代码签名`、`移动开发`

### 文章简介（250 字以内）

Flutter 能构建 APK 不等于 App 已具备上架条件，仓库包含 iOS 工程也不等于 iOS 验收通过。本文结合项目实际状态说明 debug/release 配置、API 与站点地址、签名密钥和商店检查，并明确 Android 模拟器已验收、iOS 真机与生产发布仍待完成。

### 建议发布分类

全栈开发 / Flutter

### 封面短标题

构建成功不等于可以上架

### 配图 AI 提示词

1. `M4-27-封面`：16:9 中文发布工程封面，从 Flutter 源码到 debug APK、release 签名、Android/iOS 真机、应用商店五个阶段，前三者状态清晰，iOS待验收标记醒目。
2. `M4-27-发布清单`：16:9 发布清单流程图，环境变量、HTTPS、签名保护、真机测试、隐私材料、商店审核，中文准确。

### 发布前核对

- [ ] 替换 2 处配图占位符
- [ ] M4-26、M4-03、M3-23 发布后回填站内链接
- [ ] 构建命令与当前 README、工具链核对
- [ ] 已删除本辅助区
