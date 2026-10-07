# 成为全栈开发者 · 微信小程序

Taro 4.3.0 + React 18 + TypeScript，参考 Flutter APP 的页面与图标实现。四个主入口：首页、分类、搜索、我的；共 14 个页面。支持阅读、叠楼评论、点赞收藏、会员资料/通知、Markdown 投稿、本机草稿与浅色/深色/跟随系统。

## 运行

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build:weapp
# 持续开发
pnpm dev:weapp
```

在微信开发者工具导入本目录（不要导入 src 或仓库根目录）；`project.config.json` 已保留用户配置的 AppID，`miniprogramRoot` 指向 `dist/`。不使用微信云开发。按本项目演示约定，开发工具关闭域名校验；不以真机或正式上架为验收目标。

默认 API：`https://api-befull.kao9.com/api/v1`。如需隔离环境，在构建时设置 `TARO_APP_API_BASE`，例如：

```sh
TARO_APP_API_BASE=http://127.0.0.1:13000/api/v1 pnpm build:weapp
```

完成测试后，重新执行不带该变量的 `pnpm build:weapp` 恢复线上接口。会话与草稿按接口地址、账号隔离。`dist/` 为忽略的本机构建产物，克隆后必须先构建。

## 验证

`pnpm test` 验证缓存、令牌刷新、账号隔离、草稿、Markdown、叠楼等逻辑。`pnpm test:integration` 需要相邻 `node-backend` 已安装依赖，启动仅监听本机 13997 端口的真实后端与临时数据库，通过小程序请求层验证业务闭环，结束后清理。集成测试不访问生产写接口，也不使用真实微信身份。

微信登录已接入 `wx.login → /auth/wechat/callback`；首次设置凭据使用 `/me/setup-account`。后端必须配置匹配的 `WECHAT_MINI_APP_ID`、`WECHAT_MINI_APP_SECRET`，只在前端填写 AppID 不足以完成微信登录。AppSecret 不得进入源码或前端构建。可先使用现有账号密码登录。

外链采用复制地址；小程序不复用 APP 任意网页内嵌 WebView。站内文章链接转换为详情页，文章分享采用原生分享按钮。

完整交付、测试证据及未实测边界：[开发交付与验收记录](../docs/taro-miniprogram/implementation/02-开发交付与验收记录.md)。
