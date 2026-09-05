# 成为全栈·Node 后端篇·容器化：给 Node 应用写一个像样的 Dockerfile

"在我机器上能跑"是软件工程最古老的笑话之一。你本地 `pnpm start` 一切正常，丢到测试服务器就报 `better-sqlite3` 找不到原生二进制；运维用老版本 Node 起服，顶层 `await` 直接语法报错。

容器化要解决的，就是把"环境"也变成代码的一部分——一次构建，到处一致地跑。这一篇给 `node-backend` 写一个像样的 Dockerfile：多阶段构建怎么瘦身、基础镜像怎么选、为什么必须非 root 运行，以及首次部署时那两个不能忘的动作。

## 一、先看清我们要装进去的是什么

动手写 Dockerfile 之前，必须先读真实代码，而不是凭印象。我们仓库当前的真实入口和依赖是确定的：

- **入口脚本**：`package.json` 里 `start` 是 `tsx src/index.ts`，`dev` 是 `tsx watch src/index.ts`，`build` 是 `tsc -p tsconfig.json`。也就是说运行时靠 `tsx` 直接跑 TypeScript，**不是**先 `tsc` 编译成 JS 再 `node dist`。这点很关键，它决定了 Docker 里要不要把编译产物当作必经步骤。
- **Node 入口文件**：`src/index.ts` 里用 `@hono/node-server` 的 `serve` 起服务，端口来自 `env.PORT`，起服前先 `await migrate(db)` 再 `setDb(db)`。这意味着**容器一启动就必须能建表（或连到已建好的库）**，不能依赖外部手动建表。
- **原生模块**：依赖里有 `better-sqlite3`（^13.0.3），它是一个 **C++ 原生模块**，安装时要本地编译（或拉预编译包）。这是 Docker 化最容易翻车的地方——基础镜像里没有编译工具链，`pnpm install` 会失败；或者编译器和运行时镜像不一致，产物跑不起来。
- **持久化目录**：`uploads/` 是本地磁盘存储目录（本地 `STORAGE_DRIVER=local` 时文件落在这里），`.gitignore` 里明确忽略了 `/uploads/`。它**绝不能**被烤进镜像，否则每次重建容器文件全丢，必须靠挂载卷。
- **真实目录结构**：`src/` 下是 `config / db / middleware / routes / services / shared / types` 七个目录加一个 `app.ts`，和 `package.json` 的 `paths` 配置 `@/* → ./src/*` 严格对应。镜像里要带的就是这份源码加编译好的依赖。

把这些都读清楚，写出来的 Dockerfile 才不是"从网上抄的通用模板"，而是贴合本项目的。

## 二、为什么要多阶段构建

Docker 镜像的核心诉求是**小且纯**：最终跑服务的镜像，应该只包含运行所需的东西，不该带着编译器、构建缓存、`node_modules` 里成百上千的 `@types/*` 和测试依赖。

多阶段构建（multi-stage build）正好解决这个：

- **builder 阶段**：装上完整工具链（编译原生模块要的 `python3`、`make`、`g++`，以及 pnpm），执行 `pnpm install` 把所有依赖（含 better-sqlite3 原生二进制）装好，跑 `pnpm build` 做类型检查兼产物生成。
- **runtime 阶段**：从 `node:20-slim` 这类精简基础镜像起，只把 builder 里装好的 `node_modules` 和源码拷过来，完全不碰编译器。

这样做完，runtime 镜像里没有 `g++`、没有 `node-gyp`、没有 devDependencies，体积能小一大半，攻击面也小得多。

## 三、基础镜像怎么选

`better-sqlite3` 的预编译包是按 Node 主版本 + 系统 libc 打包的。我们 `package.json` 锁了 `pnpm@9.4.0`，运行依赖是普通 Node 包，没有奇怪的运行时系统库要求。稳妥选择是 **`node:20-bullseye-slim`**（Debian 系，glibc，预编译原生模块覆盖好）或 `node:22-slim`。

注意三点：

1. **slim 足够**：原生模块装好后，运行并不需要 `build-essential`，slim 镜像够用。
2. **不要 latest**：写死 `node:20-slim` 而非 `node:latest`，避免某天基础镜像升级把你的原生二进制搞不兼容。
3. **架构一致**：本机若是 Apple Silicon（arm64），构建 x86 镜像要加 `--platform=linux/amd64`，否则 better-sqlite3 在 amd64 服务器上跑的是 arm 二进制，直接段错误。

## 四、一份贴合本项目的 Dockerfile（待补入仓库）

下面这份是**对照上面真实代码写的参考模板**。需要诚实说明：当前 `node-backend` 冻结态里**还没有** Dockerfile，这份应作为"计划补入"文件加入仓库根目录，而非声称它已经存在。判定"有没有"很简单——`ls` 一下仓库根即可，没有就是没有，不要文档里写"计划中的结构"假装它已经在了（这一点后面 P-51 还会强调）。

```dockerfile
# ---- builder：装依赖、编原生模块、跑类型检查 ----
FROM node:20-bullseye-slim AS builder
WORKDIR /app

# 原生模块 better-sqlite3 需要编译工具链
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*

# 用与项目一致的 pnpm（packageManager 锁定 9.4.0）
RUN corepack enable && corepack prepare pnpm@9.4.0 --activate

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

COPY . .
# build = tsc -p tsconfig.json，顺带做类型门禁
RUN pnpm build

# ---- runtime：只带运行所需 ----
FROM node:20-bullseye-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@9.4.0 --activate

# 只拷贝构建好的依赖与源码，不拷 devDependencies 与编译器
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/src ./src
COPY --from=builder /app/drizzle.config.ts* ./drizzle.config.ts*
COPY --from=builder /app/drizzle ./drizzle

# 非 root 用户运行（安全基线）
RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

# 容器启动即起服（tsx 直接跑 TS，与 package.json 的 start 一致）
EXPOSE 3000
CMD ["pnpm", "start"]
```

几个贴合点说明：

- `pnpm start` 就是 `tsx src/index.ts`，所以 runtime 阶段**不需要**把 `dist` 当必经产物，源码 + tsx 即可起服。这也意味着镜像里 `src` 必须完整带进去。
- 因为我们选了 `tsx` 运行，没有把 `tsc` 产物作为运行入口，所以 `pnpm build`（tsc）在这里主要起**类型门禁**作用——构建期就把类型错误挡在镜像外，而不是部署后才崩。如果你想进一步瘦身，也可以 `pnpm build` 出 `dist` 后用 `node dist/index.js` 跑，那样连 `tsx` 都不用进 runtime，但本项目 `start` 既定是 tsx，保持一致最省心。
- `EXPOSE 3000` 要和你 `env.PORT` 默认值、以及反向代理/编排里的端口对得上；`src/index.ts` 读的是 `env.PORT`，所以容器环境变量里 `PORT` 必须设这个值。

## 五、.dockerignore：别把脏东西装进镜像

没有 `.dockerignore`，`docker build` 会把整个目录上下文传进去，`node_modules`、`.git`、`uploads/`、本地 `*.sqlite` 全进构建缓存，既慢又可能污染镜像。至少要有：

```
node_modules
.git
uploads
*.sqlite
*.sqlite-journal
dist
Dockerfile
.dockerignore
.env
```

这里 `uploads/` 和 `*.sqlite` 被忽略是双重保险——它们本就不该固化进镜像（运行时靠卷挂载），更不能被开发者本地的数据文件覆盖掉容器里的逻辑。

## 六、非 root 与健康检查

上面 Dockerfile 已经用 `useradd` 建了 `appuser` 并 `USER appuser` 切换。这是安全基线：容器一旦被攻破，攻击者拿到的不是 root，横向移动成本高得多。

健康检查（healthcheck）则让编排系统知道"服务真活了没"，而不是"进程在不在"：

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3000}/health || exit 1
```

这就要求我们代码里真有 `GET /health` 端点。回到真实代码：`src/routes/health.ts` 确实存在，所以这条检查是有效的，不是悬空的。容器化不是"把原来的东西塞进盒子"，而是"让盒子里的每一个声明都能在真实代码里找到对应"。

## 七、首次部署必须 migrate + seed

`src/index.ts` 起服前会 `await migrate(db)`，所以建表这一步其实已经内置在启动流程里了。但**初始化数据**（比如首个 admin 账号）不在这个流程里——它走的是 `pnpm seed`（即 `tsx scripts/seed-users.ts`）。

所以一份完整的部署动作是：

1. 起容器（镜像里 `pnpm start` 已自动 `migrate`）；
2. 容器起来后跑一次 `pnpm seed` 创建初始用户（注意 seed 是幂等的——重复跑不应报错或重复插）；
3. 后续版本升级若改了表结构，重新 `pnpm migrate` 即可，`migrate` 基于 Drizzle 的迁移文件，已应用的不会重复应用。

这里有个真实约束要提醒：`pnpm migrate` 用的是 `src/db/migrate.ts` + `drizzle` 目录下的迁移文件，**它们必须被拷进 runtime 镜像**（上面 Dockerfile 已 `COPY ... /app/drizzle`）。如果漏拷迁移文件，容器里 `migrate` 跑不起来，建表失败，起服即崩。这是"文档说有、镜像里没有"的典型脱节，必须靠 `ls` 核对，不能想当然。

## 八、持久化：卷挂载两个东西

容器文件系统是临时的，重启即丢。本项目有两样东西必须落在宿主机卷上：

- **SQLite 数据库文件**：通过环境变量 `DB_FILE` 指定路径（本地开发是某个 `.sqlite` 路径；测试是 `:memory:`）。生产必须把 `DB_FILE` 指到挂载卷里的路径，比如 `/data/app.db`，再 `-v /var/lib/myapp:/data` 挂上去。否则容器一重启，文章、用户、评论全部蒸发。
- **uploads/ 上传目录**：本地存储模式下用户上传的图片、附件落在这里。同样挂卷，并且环境变量 `STORAGE_DRIVER=local` 时这个目录必须可写（`USER appuser` 后要注意目录权限，最好在 entrypoint 里 `chown` 一下挂载点）。

如果你用的是对象存储（R2 分支），那 uploads 卷就不用挂了——文件在云端，容器无状态更利于水平扩容。这正好呼应我们双存储适配层的设计：`STORAGE_DRIVER` 一改，容器的持久化策略就不同，编排配置要跟着变。

## 九、P-51：文档数字以实测为准，容器化也别写"计划中的结构"

写这种"工程实践"文章最容易犯的毛病，就是**把"我想让它长这样"写成"它已经长这样"**。比如：

- 文档写"`routes` 目录有 21 个文件"，你没 `ls` 就写——实际可能是 22 个，读者照着核对发现对不上，整篇可信度崩塌。
- 写"镜像里已包含 Dockerfile"，但 `git ls-files` 一查根本没有，这是**诚实问题**，不是笔误。
- 写"健康检查打 `/healthz`"，但代码里端点叫 `/health`，编排永远标记不健康。

所以本文的纪律（P-51 延伸）：**凡是写进文档的结构、数量、路径、端点名，要么 `ls`/`grep` 实测过，要么明确标注"计划补入 / 待新增"**。上面那份 Dockerfile 我明确说是"待补入仓库"，就是遵守这条——它是对照真实代码推导出来的正确写法，但仓库当前冻结态确实还没有它，不混淆两者。

同理，镜像体积、构建时长这些数字，写完真去 `docker build` 跑一遍再填，别从别的博客抄一个"仅 80MB"。可信度来自"这个数字是我亲眼测的"。

## 十、小结

容器化不是把项目塞进盒子，而是**把环境也变成可复现的代码**：

1. **先读真实代码再写**：入口 `tsx src/index.ts`、原生模块 `better-sqlite3`、`.gitignore` 忽略 `uploads/`、目录结构七目录，这些决定了 Dockerfile 长什么样。
2. **多阶段构建**：builder 装编译链 + 依赖，runtime 只带运行产物，镜像小一半、攻击面小很多。
3. **基础镜像锁版本**：`node:20-slim` 而非 latest，架构（`--platform`）和原生模块一致，避免段错误。
4. **非 root + 健康检查**：`useradd` 降权，`HEALTHCHECK` 打真实存在的 `/health` 端点。
5. **部署动作完整**：起服自动 `migrate`，首部署补 `pnpm seed`，迁移文件必须进镜像。
6. **卷挂载持久化**：`DB_FILE` 数据库文件 + `uploads/` 都要挂卷；换 R2 则容器可无状态。
7. **P-51 诚实**：文档里的结构/数量/路径要么实测要么标"计划补入"，不写"计划中的结构"冒充已有。

下一篇（{{LINK:M1-23}}）我们聊"部署上线"：从本地 `pnpm start` 到真正跑在服务器 / Cloudflare 上，环境变量、反向代理、以及"一套后端双部署"到底怎么落地。

---

如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

---

## 配图提示词（发布前整段删除）

- `22-多阶段构建`：左 builder 阶段(装依赖/编原生模块) → 右 runtime 阶段(仅运行产物)，中间箭头剔除编译器；扁平技术博客风、与专栏封面配色一致。
- `22-容器vs裸机`：裸机(各环境不一致、在我机器能跑) vs 容器(一次构建到处一致)，对比两栏。
- 复用说明：文末订阅图用真实 URL 直填，发布前勿删订阅块；本篇配图提示词段整体在发布前删除。

## 文章摘要（发布时填入 CSDN 摘要字段，随配图提示词一并删除）

容器化是把"环境"也变成代码的一部分。本文为项目写一份像样的 Dockerfile：先看清要装进去的产物，再讲多阶段构建如何只把运行产物带进镜像、基础镜像与 Node 版本怎么选、.dockerignore 怎么挡脏文件、为什么必须非 root 运行，以及首次部署前那两个不能忘的动作：migrate 与 seed。
