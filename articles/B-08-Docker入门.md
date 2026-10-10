# 成为全栈·基础补充·Docker 入门

这个专栏的六个端，**没有一个跑在 Docker 里**。

而这不是因为 Docker 不好用——**而是因为部署目标决定了技术选型**：后端部署在 Cloudflare Workers（一个 FaaS 平台），它不接受容器镜像。

而这个判断本身就值得讲：**Docker 解决的是"环境一致"，而 FaaS 解决的是"运维托管"。当平台已经托管了运维时，Docker 解决的问题就只剩一半。**

这篇讲 Docker 的核心概念，以及在这个项目里为什么它没出现——包括那个"一半"具体指什么。

{{IMG:B-08-封面}}

{{IMG:B-08-概念图}}

## 镜像和容器：两个词的差别

这是 Docker 里最该先分清的一对概念。

| 概念 | 类比 | 是什么 |
|---|---|---|
| **镜像（image）** | 安装盘 | 一个只读的文件系统快照 + 启动指令 |
| **容器（container）** | 装好的系统 | 镜像跑起来的一个实例，**有自己独立的进程和可写层** |

**关键在"独立"这个词。** 同一个镜像可以启动 N 个容器，它们：

- 共享同一个只读镜像层（不重复占空间）
- 各自有独立的**可写层**（一个容器里删掉文件，不影响另一个）
- 各自有独立的网络空间（但可以互相通信）

**而"独立可写层"这个特性解释了 Docker 里绝大多数行为。**

比如：容器里改了文件，**镜像没变**。所以容器销毁后重新启动，文件又回来了——**这是特性不是 bug**，它保证了环境的可重现性。

## Dockerfile：这个项目里的一个真实对照

虽然没有用 Docker，但这个项目里有一份"等价的声明"：

```json
{
  "name": "fullstack_reader",
  "dependencies": {
    "webview_flutter": "^4.14.1",
    "flutter_secure_storage": "...",
    "dio": "...",
    ...
  }
}
```

**`pubspec.yaml` 和 `package.json` 承担了 Dockerfile 一半的职责**——它们声明"这个项目需要什么"。

而另一半（"怎么构建成可运行的东西"）由平台负责：

| 需求 | Docker | 这个项目 |
|---|---|---|
| 声明依赖 | `package.json` + `package-lock.json` | **一样** |
| 声明运行环境 | `FROM node:22` | `compatibility_date = "2025-01-01"` |
| 声明构建步骤 | `RUN npm ci && npm run build` | `wrangler deploy` |
| 声明怎么启动 | `CMD ["node", "dist/index.js"]` | Workers 的 `fetch` 入口 |

**而第四行是最本质的差异。** Docker 里你写 `CMD`，FaaS 里你写 `export default { fetch }`——**都是"入口"，但平台替你做了进程管理。**

**而这里有一个我们真实踩过的坑，它恰好说明"声明运行环境"的重要性：**

```toml
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]
```

**这两行是 FaaS 版的 `FROM`。** 而 M1-34 那个 bug（M4-27 也提过）的根因正是——**运行环境的能力和我在开发机上的假设不一致。**

**Docker 里这类问题表现为"镜像里的 node 版本不对"，FaaS 里表现为"某个 API 不被支持"。** 而两者都是同一件事：**你在一个环境开发，却在另一个环境运行。**

## 这个专栏为什么不用 Docker

现在讲我做的判断，以及它的代价。

**目标环境不支持。** Cloudflare Workers 接受的是"一段 JS + 一组绑定"，不是容器镜像。**这不是"能不能改成 Docker"的问题，而是"这个平台的工作方式就是这样"。**

**而更深一层的原因是：用了 FaaS 就不需要 Docker 解决的大部分问题。**

| Docker 解决的问题 | FaaS 里谁解决 |
|---|---|
| 环境不一致 | **平台保证运行时** |
| 依赖冲突 | 平台镜像 + lock 文件 |
| 进程崩溃重启 | **平台自动** |
| 负载均衡 | 平台 |
| 滚动部署 | `wrangler deploy` |
| 水平扩容 | **平台自动** |
| 日志收集 | `wrangler tail` |
| **本地复现线上环境** | **❌ 没人解决** |

**最后一行是这个专栏真正付出的代价。**

而这个代价直接导致了 M1-34 那个 bug：本地是 Node（`fetch` 支持 `redirect: 'error'`），线上是 workerd（不支持）——**而没有任何机制提前告诉我这件事。**

B-17 记的那笔债就是这个：

> **CI 里应该有一条针对目标运行时的最小执行检查。当前状态是"这次靠手动复现发现"，不是"以后每次 CI 都会发现"。**

**所以"不用 Docker"这个选择的准确说法是**：**用它换来了运维的零负担，代价是环境差异要靠自己测。**

而这个取舍在教学项目上是合理的——**运维本身不是这个专栏要讲的东西**（那是 B-04 的事）。但它不该被隐藏，而应该像现在这样写清楚。

{{IMG:B-08-容器应用}}

## 如果要用 Docker，最小的那一层

假设这个项目要部署到一个自托管的 VPS（不是 Workers），那需要的 Dockerfile 大概是这样：

```dockerfile
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci                      # 严格按 lock 安装
COPY . .
RUN npm run build              # tsc → dist

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY package.json package-lock.json ./
RUN npm ci --omit=dev          # 只装生产依赖
USER node                      # 不用 root 跑
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

**这段里有五个决策，每一个都不是"习惯"而是"后果"：**

| 决策 | 不这么做会怎样 |
|---|---|
| **多阶段构建** | `dist` 和 devDependencies 一起进镜像，**镜像大一倍** |
| **`npm ci` 而非 `install`** | 装的版本可能和 lock 不一致（B-04 讲过） |
| **`--omit=dev`** | 测试框架、类型定义全进生产镜像 |
| **`USER node`** | **容器里是 root，任何漏洞都能改宿主文件** |
| **`EXPOSE`** | 不是"开放端口"，是**声明意图 + 让 healthcheck 知道检查谁** |

**而 `USER node` 那一行是 Docker 安全里最容易被省掉、也最不该省的一条。** Docker 默认以 root 运行——**而这意味着一个容器里的代码漏洞等于宿主机的 root 权限。**

**这条和 M4-24 讲的"图片请求移除鉴权头"是同一类思维**：**默认行为给了你更多权限，而更安全的做法需要主动写出来。**

## 数据持久化：容器是无状态的

如果这个后端用 Docker 部署，SQLite 文件会立刻带来一个问题。

```bash
docker run -d -v ./data:/app/data my-backend
```

`-v` 是把宿主机目录挂进容器。**而这是必需的**，因为容器是可销毁的——B-18 讲的那个"容器一删数据就没了"，正是新手最常遇到的坑。

**而这个项目的 SQLite 有三个文件级的持久化需求：**

| 数据 | 能不能丢 | 挂了会怎样 |
|---|---|---|
| 主数据库 | **不能** | **全站数据** |
| 本机草稿（Flutter 侧） | 能（M4-22 讲过是 `SharedPreferences`，不在后端） | 用户重写一遍 |
| 缓存 | **能** | 重新拉一遍 |

**而 `CacheLimits` 那一堆容量限制在 Docker 场景下会变得更重要**——因为容器的磁盘配额通常比本机小。

**不过话说回来**：如果真要部署到 VPS，多半会用 PostgreSQL 而不是 SQLite——**因为文件数据库和水平扩容不兼容**（B-13 讲的那四层缓存里，数据库层自己管不了多实例）。

**这也是为什么这个项目选 SQLite + D1**：**因为目标是"单机或单实例"，数据库选型和部署形态要匹配。**

## 这个专栏里和 Docker 等价的东西

虽然不用 Docker，但"声明式描述"这个思路在这个项目里到处出现。举三个：

```toml
# 1. 运行时声明（Docker 的 FROM）
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]

# 2. 绑定声明（Docker 的 ENV + VOLUME）
[[d1_databases]]
binding = "DB"
database_name = "node-backend"
database_id = "fe3d7e63-39e2-44f8-9218-0f6d9fe4dc16"

# 3. 路由声明（Docker 的 EXPOSE + 反向代理规则）
routes = [{ pattern = "api-befull.kao9.com", custom_domain = true }]
```

**而第二段那个 `binding = "DB"` 有一个绑定关系值得说**——它必须和代码里的名字一致：

```toml
# R2 绑定的注释写得很明确
# binding 必须与 src/config/env.ts 的 R2_BUCKET 一致，否则线上 STORAGE_DRIVER=r2 时
# createStorage 会因 env.R2_BUCKET 为 undefined 抛错，上传/附件接口全部 500。
```

**一个名字拼错，所有上传接口 500。** 而这个错误在本地测不出来——因为本地不用 R2 binding。

**这就是"声明式配置"的共同风险：声明和实现之间有一道隐式的约定，而约定不一致时只有运行时才会发现。**

**而这段注释的价值在于：它把这个隐式约定写成了显式的检查项。** 下一个人改名字时会看到它。


## 一条我一开始想省掉的事

我一开始想过用 `wrangler dev` 完全代替本地测试——**因为它跑的就是 workerd 环境，比 Node 更接近线上。**

**然后我遇到了 M1-34 那个 bug 的另一个变体。**

`wrangler dev` 用的是 Miniflare，它对 D1 有个模拟实现，而**那个实现和真正的 D1 有行为差异**（M1-33 讲的那个 `atomic` 就撞过——"本地 Miniflare 和线上 D1 表现一致了，而本地原生 Node 表现不同"）。

**所以我用 Miniflare 测出来"没问题"，而线上那个环境组合（真 D1 + workerd）有问题。**

**而问题的本质是：模拟器不是被模拟的那个东西。** 它模拟了大部分行为，但**不是全部**——而"不是全部"这件事，你无法通过测试发现。

这个教训我最后是这样解决的：

| 环境 | 用途 |
|---|---|
| 原生 Node + SQLite | **业务逻辑测试**（快，能跑完整测试套件） |
| Miniflare + D1 模拟 | **部分集成验证**（本地代码路径一致） |
| **线上只读验证** | **确认链路真的通** |

而**第三层是 B-17 记的那个 `production_read_test.dart`**——它只读、不写，用一个永远返回 null 的 `AnonymousVault` 保证不会污染任何用户数据。

**"模拟器不是被模拟的那个东西"这句话，是我从这次事故里学到的最有价值的一句。**

## 小结

Docker 这一章，沉淀下来的是四件事：

1. **镜像只读、容器可写** ——所以"改了文件"不影响镜像，环境可重现。
2. **依赖声明是这个专栏真正需要的部分** —— `package.json` / `pubspec.yaml` 是 Docker 的一半职责。
3. **不用 Docker 是一次明确的取舍** ——用运维的零负担换了环境一致性，而代价是"M1-34 那个类型的 bug 只能靠手动复现发现"。
4. **`USER node` 这类安全默认值不该省** ——容器默认 root、默认带 devDependencies，两个都是"能跑就行"的默认值。

而这一章真正的判断标准是第 3 条背后那个：

> **Docker 解决"环境一致"，FaaS 解决"运维托管"。** 当平台已经托管了运维，Docker 剩下的价值就只有一半——而你需要知道自己买的是哪一半。

这个专栏买的是"少讲运维"，代价是"环境差异要自己测"。**对教学项目来说这个取舍是对的**，但它应该被写出来（就像现在这样），而不是假装不存在。

下一篇讲 Nginx。它和这一章正好相反——**Nginx 是"你必须自己管运维"的那种东西**，而这个专栏把它交给 Cloudflare 了。

## 延伸阅读

- [Linux 服务器入门]({{LINK:B-04}})
- [部署上线：从本地起服到真正对外服务](https://blog.csdn.net/fungleo/article/details/164815866)
- [一套后端双部署：适配层如何让一份代码跑在两套运行时](https://blog.csdn.net/fungleo/article/details/164816647)

---
如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[成为全栈](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->
## 发布辅助信息

### 文章 Tag（6 个）

Docker、容器、Dockerfile、Docker Compose、部署、DevOps

### 文章简介（250 字以内）

Docker 镜像和容器解决的是运行环境可复制问题，不会自动解决数据持久化、密钥、备份和生产验收。本文解释镜像、容器、Dockerfile、多阶段构建、端口、网络、Compose、数据卷和原生依赖，并用 Node 示例展示构建与运行分离。还说明容器退出、端口不可达和数据库数据丢失的常见原因，以及如何区分“有 Dockerfile”和“已在目标环境运行”。

### 建议发布分类

开发工具 / Docker

### 封面短标题

把运行环境装进镜像

### 配图 AI 提示词

1. B-08-封面：Dockerfile 构建多阶段流水线生成镜像，容器连接数据库服务与持久卷。
2. B-08-概念图：镜像模板、容器实例、主机内核和 volume 的关系。
3. B-08-容器应用：放在正文同名占位处，镜像与容器关系示意：镜像作为模板、容器作为运行实例。

### 发布前核对

- [ ] 示例 Node 版本与仓库目标版本分别核实，说明示例需按项目调整。
- [ ] 不把 Docker volume 描述成备份，也不把 Dockerfile 描述成部署成功证据。
- [ ] 替换图片和链接，发布时删除辅助信息。
<!-- PUBLISH_ASSIST_END -->
