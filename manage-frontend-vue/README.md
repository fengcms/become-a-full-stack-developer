# Vue 管理后台

使用 Vue 3、TypeScript、Vite、Naive UI 和 Biome 重写现有 React 管理后台。页面行为与 API 以原管理后台和 `docs/api/openapi.v1.yaml` 为准；本项目不改写契约，也不修改 `manage-frontend/`。

## 本地运行

项目要求 Node.js `>=22.12.0` 和 pnpm 10。首次运行：

```sh
pnpm install
cp .env.example .env.local
pnpm dev
```

开发服务器运行在 `http://localhost:12001`，并将 `/api/v1` 与 `/files` 代理到 `API_TARGET`。默认值是 `http://localhost:11000`，与原管理后台的本地联调地址一致。也可以在 `.env.local` 中将 `API_TARGET` 指向可访问的 Node 或 Go 后端；前端不会保存或读取后端密钥。

登录凭据通过登录页填写。不要把真实凭据写入 `.env` 或提交到 Git。

## 常用命令

```sh
pnpm dev           # 本地开发
pnpm typecheck     # Vue SFC 与 TypeScript 类型检查
pnpm check         # Biome 格式、lint 与 import 整理检查
pnpm test          # Vitest 单元测试
pnpm build         # 类型检查并生成生产构建
pnpm preview       # 本地预览生产构建
pnpm gen:types     # 从 OpenAPI 契约重新生成 src/types/api.gen.ts
```

Biome 是本项目唯一的格式与 lint 工具，不使用 ESLint 或 Prettier。生成的 `src/types/api.gen.ts` 不手工修改。

## 页面与主要能力

- 登录与会话恢复：访问令牌内存保存，刷新令牌使用 HttpOnly Cookie；访问令牌失效时请求层合并并发刷新。
- 仪表盘：站点统计、分类分布、近期文章和评论。
- 内容管理：文章检索、筛选、批量软删除、投稿审核、Markdown 编辑、图片上传、发布设置和预览。
- 互动与分类：评论审核、回复、状态处理；最多四级分类树和标签维护。
- 账号和站点：用户角色/状态/等级、管理员重置密码、站点设置。
- 个人中心：个人资料、头像、密码、通知、点赞和收藏；普通会员可以访问个人中心，但不能访问管理控制台。

## 目录结构

```text
src/
├── api/          # 按契约域组织的 API 调用
├── app/          # Pinia 实例
├── assets/       # 全局样式
├── components/   # 共享界面组件
├── config/       # 导航与角色定义
├── layouts/      # 管理控制台和个人中心布局
├── lib/          # 请求、权限、错误码、文件 URL
├── pages/        # 按业务域组织的页面
├── router/       # 懒加载路由与权限守卫
├── stores/       # 认证状态
└── types/        # OpenAPI 生成类型与业务别名
```

推荐使用 VS Code 的 Vue - Official 扩展。需要扩展 API 时，先更新或确认 OpenAPI 契约，再执行 `pnpm gen:types`，随后在对应 `src/api/` 模块实现调用。
