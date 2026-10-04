# 成为全栈·Flutter App 篇·Flutter 构建与发布准备：Android、iOS 和签名边界

在模拟器安装 APK 的那一刻，很容易把“能运行”说成“已经可以发布”。但当前 release 仍需要真实签名，iOS 工程也还没有在完整 Xcode 环境验证。

这篇结合 `main.dart` 的 release HTTPS 断言和实际构建命令，拆分构建、真机验收、签名与商店发布四件事，给出可以照着执行的发行前清单。

{{IMG:M4-27-封面}}

## 构建产物分层理解

```bash
flutter build apk --debug
flutter build apk --release \
  --dart-define=API_BASE_URL=https://YOUR_API_HOST/api/v1 \
  --dart-define=SITE_URL=https://YOUR_SITE_HOST
```

debug 构建适合开发安装；release 构建启用发行优化，但仍需真实签名、正式配置和完整验收。`API_BASE_URL` 应指向 HTTPS 服务，`SITE_URL` 用于分享文章链接；开发代理参数只在明确的 debug 场景允许，release 忽略它。

{{IMG:M4-27-发布清单}}

## Android 本机验收不等于上架

项目已完成 Pixel 8 模拟器安装和正常入口启动，`flutter build apk --debug` 成功。模板 release 当前使用 debug 签名，发布前必须替换成所有者管理的真实密钥；密钥不能提交到版本库。还需核验包名、版本号、图标、权限、隐私披露、正式 API 域名、证书与回退方案。

## iOS 工程存在，但环境未完成验收

仓库保留 iOS 工程与共享 Dart 代码，但开发机没有完整 Xcode，因此没有运行 iOS 构建、设备签名或真机测试。完成发布至少需要完整 Xcode、平台依赖、Apple Developer 签名配置和设备验证。不能从“Dart 代码跨平台”推断平台插件、权限弹窗和返回手势都相同。

## 发布前验证清单

1. 使用目标环境参数重建，并检查产物确实没有 localhost/模拟器地址。
2. 用正式 HTTPS API 验证登录、公开阅读、刷新、退出与分享链接。
3. 在 Android 真机和 iOS 真机检查选择器、主题、字体、深链和 WebView。
4. 配置并保护签名证书，验证升级和回退路径。
5. 检查隐私政策、权限说明、崩溃采集与应用商店素材。
6. 将发布审批和生产数据写操作单独安排，不混入匿名只读测试。

## 配置进入产物的时点要明确

`--dart-define` 在编译时注入 Dart 常量，因此同一个二进制并非可以随意替换 API 地址。CI 构建应记录环境和 git revision，并检查产物元信息；密钥签名材料由安全凭据系统注入，而不是放在公开 `key.properties` 或仓库中。

```text
source revision + Flutter/Dart version + environment defines
       → reproducible build artifact
       → signature identity + store metadata
```

即使 release APK 安装成功，也还需要检查网络安全配置、深链域名、应用升级签名一致、崩溃日志和后端兼容性。iOS 还涉及 provisioning profile、Bundle ID、entitlements 和系统权限描述；这些在本机没有完整 Xcode 的情况下尚未验证。

## 版本发布还要验证升级路径

安装全新 debug 包只验证首次启动；发行前还需从旧版本升级，确认数据库/偏好迁移、refresh token 兼容、缓存目录版本和应用包签名一致。缓存可重建但用户稿件不可随意丢失，因此更改应用存储 schema 时要单独迁移恢复数据。

正式域名关联还涉及 Android intent filter/asset links 与 iOS Associated Domains；仓库当前自定义 scheme 开发路径不能代替验证 HTTPS App Links/Universal Links。审核资料、隐私说明和权限原因也应与实际行为一致，不请求未使用的权限。

## release 配置的安全断言应自动化

main.dart 在 Release 模式启动时拒绝非 HTTPS 的 API_BASE_URL；Android 明文 HTTP 例外只在 debug manifest。这个 guard 不能取代证书、域名与后端配置检查，却能防止最明显的 release 指向 `http://`。打包流水线还可扫描 apk/ipa strings，检查是否残留 localhost、测试代理和隔离环境 API 地址。

签名私钥应放 CI secret 或开发者本机安全目录，流程记录 key alias/证书指纹而不打印秘密。升级必须沿用同一签名身份；签名丢失可能使用户无法安装覆盖升级，回滚也不能简单重签旧版本。


## 贴着工程代码读实现

下面这段节选自 `flutter-app/lib/main.dart 第 14–87 行`（保留原始实现；为突出主线省略了文件其余部分）。读代码时可以顺着调用链确认：分别检查构建模式、API base URL 和签名配置缺失时的行为。这里关注的是它如何改变数据流，而不只是记住一个 API 名称。

```dart
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  PaintingBinding.instance.imageCache.maximumSizeBytes =
      CacheLimits.decodedImageBytes;
  const configured = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://api-befull.kao9.com/api/v1',
  );
  if (kReleaseMode && !configured.startsWith('https://')) {
    throw StateError('Release requires an HTTPS API_BASE_URL');
  }
  final api = ApiClient(
    baseUrl: configured,
    vault: SecureTokenVault(namespace: Uri.parse(configured).authority),
  );
  final session = AppSession(api, await SharedPreferences.getInstance());
  runApp(
    ProviderScope(
      overrides: [sessionProvider.overrideWith((ref) => session)],
      child: const ReaderApp(),
    ),
  );
  await session.restore();
}

/// 应用入口持有路由与两套主题，会话通知仅切换当前模式。
class ReaderApp extends ConsumerStatefulWidget {
  const ReaderApp({super.key});
  @override
  ConsumerState<ReaderApp> createState() => _ReaderAppState();
}

class _ReaderAppState extends ConsumerState<ReaderApp>
    with WidgetsBindingObserver {
  late final GoRouter router;
  late final lightTheme = buildAppTheme(Brightness.light);
  late final darkTheme = buildAppTheme(Brightness.dark);
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    router = createRouter(ref.read(sessionProvider));
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    router.dispose();
    super.dispose();
  }

  @override
  void didHaveMemoryPressure() {
    final repo = ref.read(repositoryProvider);
    repo.cache.trim();
    repo.images.trim();
    repo.snapshots.clear();
    PaintingBinding.instance.imageCache.clear();
  }

  @override
  Widget build(BuildContext context) => MaterialApp.router(
    title: '成为全栈',
    locale: const Locale('zh', 'CN'),
    supportedLocales: const [Locale('zh', 'CN'), Locale('en')],
    localizationsDelegates: GlobalMaterialLocalizations.delegates,
    debugShowCheckedModeBanner: false,
    theme: lightTheme,
    darkTheme: darkTheme,
    themeMode: ref.watch(sessionProvider).mode,
    routerConfig: router,
    builder: AppLayout.clampTextScale,
  );
}
```

## 把容易出错的路径走一遍

我会用这个场景做一次可复现排查：**Debug 能连本机接口却把明文 HTTP 带进 Release 包**。先分别检查构建模式、API base URL 和签名配置缺失时的行为；如果把问题定位在“只验证 Debug”，修正方向是“启动时验证 Release 必须 HTTPS；签名密钥由环境配置注入”。最后再验证正常路径没有退化，并把边界条件留在自动化检查里。

| 方案比较 | 简化做法 | 当前实现/推荐做法 |
|---|---|---|
| 本文核心选择 | 只验证 Debug | 分环境构建门禁 |
| 错误处理 | 失败后清空或静默忽略 | 保留可恢复状态，给出明确反馈 |
| 验证方式 | 只检查成功结果 | 注入边界条件并检查回归 |

| 排错步骤 | 要观察什么 | 通过条件 |
|---|---|---|
| 复现 | Debug 能连本机接口却把明文 HTTP 带进 Release 包 | 可以稳定触发或明确构造该输入 |
| 定位 | 分别检查构建模式、API base URL 和签名配置缺失时的行为 | 找到责任层和状态归属 |
| 修正 | 启动时验证 Release 必须 HTTPS；签名密钥由环境配置注入 | 失败不污染后续页面或账号 |

## 小结

Flutter build 只生成指定配置的产物。Android 已有模拟器功能验收，iOS 尚无 Xcode/真机证据；正式签名、正式域名与商店发布仍是独立工作。把每个里程碑和证据分开，才能对用户准确承诺。

## 延伸阅读

- [测试分层：单元、Widget、集成与线上只读验证]({{LINK:M4-26}})
- [Flutter 工程骨架与 OpenAPI 代码生成]({{LINK:M4-03}})
- [OpenNext 部署 Cloudflare：构建成功不等于缓存正确]({{LINK:M3-23}})

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
