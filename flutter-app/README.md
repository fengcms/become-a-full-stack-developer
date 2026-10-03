# 成为全栈 · Flutter APP

基于 `docs/flutter-app` 产品规划和高保真原型的原生移动客户端。Flutter **3.47.1** / Dart **3.13.1**，Android 与 iOS 工程。依赖精确解析版本见 `pubspec.lock`。

## 本机运行（线上内容）

```bash
./tool/run_android.sh
```

默认连接 `https://api-befull.kao9.com/api/v1`，读取真实已发布内容。模拟器当前为 Pixel 8；账号须使用线上会员账号。此前的 `flutter_reader` / `Reader123456` 只存在于隔离测试库，不能用于线上登录。

如果模拟器 DNS 不可用，可关闭该 AVD 后用以下开发环境参数重启（本机代理端口为 7897 时）：

```bash
$HOME/Library/Android/sdk/emulator/emulator -avd pixel8 -no-snapshot-load -dns-server 1.1.1.1,8.8.8.8 -http-proxy http://127.0.0.1:7897
```

如果模拟器直连仍间歇超时，用 `DEV_HTTP_PROXY=10.0.2.2:7897 ./tool/run_android.sh` 显式使用本机代理。代理仅在 debug 且明确传入参数时生效，release 忽略该参数。应用没有硬编码代理，也不跳过 HTTPS 证书校验。

## 隔离环境与写操作测试

```bash
# 终端一
./tool/start_backend.sh
# 终端二
node tool/prepare_backend.mjs
API_BASE_URL=http://10.0.2.2:11002/api/v1 ./tool/run_android.sh
```

脚本从 `flutter-app` 目录执行。数据库和上传文件位于被 Git 忽略的 `.local/`，11002 端口与原有网站隔离。测试会员：`flutter_reader` / `Reader123456`。

刷新凭据和本机稿件均按 API 环境隔离，测试库与线上即使出现相同用户 ID 也不会混用。

## 配置与构建

```bash
flutter run -d emulator-5554 --dart-define=API_BASE_URL=http://10.0.2.2:11002/api/v1
flutter build apk --release --dart-define=API_BASE_URL=https://YOUR_API_HOST/api/v1 --dart-define=SITE_URL=https://YOUR_SITE_HOST
```

`API_BASE_URL` 含 `/api/v1`；`SITE_URL` 用于文章分享。release 启动要求 HTTPS API 地址，未覆盖配置时使用已确认的线上接口。Android HTTP 例外只在 debug manifest 开启。发布签名仍须使用网站所有者的真实签名配置；生成的 release 构建用于安装验证，不代表已经上架。

## 架构

- `lib/app`：Riverpod 注入、会话、go_router 和双主题。
- `lib/core/network`：Dio、业务信封、单飞刷新、会话代次、限流与错误分类。
- `lib/core/generated`：由冻结 OpenAPI 生成的类型化 DTO，页面通过 repository/domain 模型读取。
- `lib/core/markdown`：GFM、代码复制、图片、服务端目录锚点与正文绑定。
- `lib/features`：阅读/发现/认证/会员/评论/投稿功能。
- `lib/shared`：分页文章流、加载/空/错误状态、按钮、图片与页面容器。

四个主 Tab 保留状态；私有页面按账号会话代次隔离。access token 只存内存，refresh token 存安全存储；旋转写入串行化，退出后的迟到响应不进入 UI。用户草稿使用账号+稿件 ID 的本机恢复键，服务器写入成功后清除。

## 验证

```bash
node tool/generate_contract.mjs
flutter analyze
flutter test
node tool/verify_backend.mjs
flutter test integration_test/app_test.dart -d emulator-5554 --dart-define=API_BASE_URL=http://10.0.2.2:11002/api/v1
flutter test integration_test/production_read_test.dart -d emulator-5554 --dart-define=DEV_HTTP_PROXY=10.0.2.2:7897
```

契约生成器读取 `../docs/api/openapi.v1.yaml`，使用后端锁定的 yaml 包；运行前确保 `node-backend/node_modules` 可用。API 联调脚本仅接受本机 11002，不可指向生产。integration test 使用独立测试账号并真实创建投稿和评论。

目录只使用服务端 `/toc` 数据。自定义 ATX 解析器按层级和原始标题文本核对、绑定服务端 anchor；Setext 标题正常渲染但不会消耗目录项；代码围栏不产生标题。无法配对的条目禁用跳转。投稿预览不请求目录/上下篇。

iOS 需要完整 Xcode、平台依赖和设备签名；本机交付验收以 Android Pixel 8 模拟器为准。真实设备、商店签名、生产域名关联与生产发布属于部署验收，不能由本地 debug 测试替代。

## 原型还原

唯一界面依据为 `docs/flutter-app/prototype/02-高保真可交互原型.html`。`lib/shared/prototype_icons.dart` 保存原型 SVG 的原始路径、24×24 viewBox 和 1.6 线宽；Flutter 通过 flutter_svg 渲染，不再使用外观不同的 Material 图标替代。尺寸、文字层级、焦点卡、Cell 分组、状态卡、目录、Markdown 标题和明暗色对应原型。统计、通知和图片遵循真实接口，不复制原型中的演示数量与假缩略图。

## 数据与图片缓存

缓存策略集中在 `lib/features/repository.dart`，`core/cache/data_cache.dart` 处理 TTL、请求合并和代次，`blob_store.dart` 管理可重建磁盘文件，`image_store.dart` 管理图片。公开正文与目录按版本一起缓存；私有预览显式 `article(id, private: true)` 绕过公开缓存。新页面读取统一走 Repository，写入仍走 ApiClient，由其 mutation hook 触发关联失效。

公开数据预算 30MB、图片文件 150MB；私有响应仅内存。设置中“清理缓存”不会删除稿件、搜索历史或登录凭据。缓存目录位于应用缓存目录 `reader-v1`，系统可随时清理，不能存放用户原创数据。

验证：`flutter test` 覆盖缓存与 UI；真实写入仅用 `integration_test/app_test.dart` 的隔离本地后端。生产只读 profile 验证：

```sh
flutter drive --profile -d emulator-5554 --driver=test_driver/cache_results.dart --target=integration_test/cache_acceptance_test.dart --dart-define=DEV_HTTP_PROXY=10.0.2.2:7897
```

上述代理仅为本机测试网络配置，无代理环境省略该 define；profile 测试显式配置测试传输层，不改变正式 APP 的代理策略。结果保存到 `docs/flutter-app/evidence/cache-acceptance.json`。完整边界与数据解释见 `docs/flutter-app/14-缓存优化实施与验收.md`。
