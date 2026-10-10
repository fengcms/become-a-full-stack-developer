# 成为全栈·Go 后端篇·Go 上线准备：CGO、单写拓扑与生产切换演练

> 一个可执行的 Dockerfile 不等于已部署；一个能连三种数据库的二进制也不等于任意拓扑都安全。上线准备首先要列明制品、存储、写入拓扑和每项未完成验收。

{{IMG:M6-31-封面}}

> 本文代码快照：提交 ceac4e0。Linux Dockerfile 已审阅，完整镜像构建、真实微信/R2 联调和生产切换未作为本轮已完成项。

## 前言：上线不是最后一条 make run

M6 Go 服务已经在本地 PostgreSQL 环境运行，三个数据库通过真实测试，提供四个独立程序：server、migrate、seed、data。Dockerfile 给出 Linux 多阶段构建方案，使用 CGO 与 Debian/glibc 支持 SQLite 原生依赖，以非 root 用户运行。

这些事实构成上线准备，不是生产上线结果。本机原生构建通过，不能替代目标 Linux 镜像完整 build/run；代码中配置了 R2 provider，不能证明真实 bucket 凭据与权限可用；Go 实现了冻结 API，不表示域名、TLS、代理、监控和回滚已部署。

本文围绕目标拓扑、构建制品、数据库与对象存储准备、迁移前后检查和回退流程，给出一个可执行的上线验收清单。

## 一、先选清楚服务拓扑

当前工程按单写服务实例设计：文章分类树更新和共享对象 key 操作依赖进程内互斥；SQLite 使用单写连接；公开端点 limiter 也是进程内状态。单实例可以理解这些保护范围；多个副本各有自己的 mutex 和限流窗口，无法互相协调。

因此，若部署多个写实例，不能只增加副本数就宣称正确。要先把分类拓扑变更移到数据库级锁或版本控制，附件共享对象生命周期改用跨实例协调/队列，限流接入共享网关或存储。PostgreSQL 支持多客户端本身不意味着所有业务锁都跨副本生效。

一个保守拓扑可以是单个 Go 写服务实例 + PostgreSQL + R2 + 反向代理/TLS。是否需要多实例，依据可用性目标和负载决定；教学工程当前的实现范围不应被写成高可用集群。

{{IMG:M6-31-拓扑}}

## 二、四个程序与镜像职责

make build 输出 server、migrate、data、seed。运行中的容器常驻只需要 server；发布/运维流程使用独立的一次性 migrate job；data 用于人工批准的数据搬迁；seed 只为开发环境创建样例，生产环境不应随服务启动自动跑它。

Dockerfile 的 build stage 使用 Go 1.26.6 Debian Bookworm 编译四个 CGO_ENABLED=1 的二进制，runtime stage 使用 debian:bookworm-slim，安装 CA certificates，创建 UID/GID 10001 的非 root 用户，将上传目录赋予该用户。当前镜像 ENTRYPOINT 默认启动 server，迁移 job 可以通过容器 command override 调用 migrate。容器需要限制只读根文件系统时，应为 SQLite/local upload 另挂持久化目录并提供写权限。

CGO 是 SQLite 驱动的构建条件之一。镜像基于 glibc 的 Debian builder 和 runtime，避免在 Alpine/musl 环境简单复制二进制导致链接失败。Go 二进制是否完全静态、证书路径和架构需按实际 buildx 目标验证。当前文档记载基础镜像 manifest 已验证，但没有把完整容器构建与部署环境运行说成通过。

## 三、数据库和文件存储需要各自的运行计划

生产数据库选 PostgreSQL 时，应创建最小权限的应用账号、TLS 连接、连接池预算、备份与恢复策略；migration job 使用受限 DDL 账号，与常驻服务账号隔离。服务启动执行 ping，但不会运行表迁移；数据库 schema 必须先通过独立 migrate。

R2 配置由 endpoint/bucket/access key/secret 等组成，密钥只通过运行环境注入。要实际验证 Put/Get/Delete、MIME、权限策略、超时和删除错误；替身 HTTP 测试不能代替真实 bucket。local provider 则要求持久卷、磁盘容量、备份、权限、目录清理和恢复测试。

反向代理负责 TLS、请求体上限与转发配置时，应与 Go server 的 HTTP 超时、CORS、可信代理范围相匹配。trusted proxy 配置不能把任意公网来源都当可信；Cookie Secure/SameSite 要在实际域名和 HTTPS 下测试。上线还需指标、结构化日志、错误告警和健康检查，不要从本机访问 127.0.0.1 推断线上探针配置。

## 四、CGO 与可重复构建检查

在与目标平台一致的 CI 或本机容器中执行完整构建：下载锁定的 go.mod/go.sum、编译四个程序、记录 Go 版本与镜像 digest，运行 go test 和必要的 matrix。检查镜像里没有 .env、快照、测试数据库、开发账号或编译器缓存。容器用户应非 root；上传目录权限应经过写入测试。

然后真实启动容器：连接隔离 PostgreSQL，运行 migration job，启动 server，检查 health、登录、读写文章、附件上传/下载、SIGTERM 关闭和数据库连接释放。只看 docker build 成功仍不证明 server 能使用真实环境配置。

当前本机原生 Go 构建和完整 Docker build 是不同证据。若完整 Linux 容器尚未执行，就保持“配置已准备，待目标环境构建验收”的说法。

## 五、生产数据切换应作为独立发布事件

迁移 runbook 应包括：指定冻结窗口和责任人；暂停 Node 后端所有业务写入；备份并验证旧数据库；只读导出 13 张业务表；在目标 PostgreSQL 执行 DDL；运行 dry-run；真实导入；检查行数、身份、文章/关系、评论树、附件引用、like_count 与 sequence；单独复制对象字节并核验 hash；启动 Go 对只读和受控写接口 smoke；切换流量；观察日志、错误率、延迟与数据库指标。

快照不迁移 refresh_tokens 和阅读去重记录，因此用户要重新登录，阅读冷却重置。若冻结窗口中仍有旧端写入，静态快照会漏数据。不能两套后端同时任意写，再通过比较总行数假设可合并。

## 六、回退必须考虑切流后的新写入

切回 Node 不只是把 DNS 改回去。Go 服务运行期间可能已经接受新文章、评论、互动和账号设密；Node schema 与业务行为还有已记录差异，反向迁移数据未必安全。切换前要定义回退阈值、停写时机、差异数据保留策略、附件对象清理和用户会话影响。

可行的保守做法是在一段观察窗口内限制高风险写操作，或准备专门的反向导出审计和人工补录计划。具体方法取决于产品可接受的停机与丢写风险。没有经过测试的回退方案，不应只用一条“DNS 回滚”概括。

## 七、上线前检查表

| 类别 | 验收问题 |
|---|---|
| 二进制/镜像 | 目标架构 build、运行库、证书、非 root、CGO/SQLite 都实测了吗？ |
| 数据库 | schema 已迁移？账号权限、TLS、连接预算、备份恢复已验证？ |
| 拓扑 | 当前是否单写实例？进程锁/限流边界是否与副本数匹配？ |
| 文件 | R2 或持久卷真实读写？附件 key 与数据库记录一致？ |
| HTTP | TLS、CORS、Cookie、可信代理、body limit 和超时在真实域名验收？ |
| 观测 | health、请求日志、错误率、数据库 pool、磁盘/对象告警可用？ |
| 数据 | 停写、快照、导入、审计、序列、对象复制与核查可复现？ |
| 回退 | 切流后的新写入、会话失效和附件变化如何保留？ |
| 权限 | 密钥、备份与 snapshot 如何访问、轮换、加密和销毁？ |

每项结果都记录环境、版本、日期、命令、日志位置和异常处理。尚未执行的保持 TODO，不用 Dockerfile 代码或本地 smoke 充数。

{{IMG:M6-31-切换}}

## 小结：部署准备和生产上线是两个阶段

M6 提供 Go 1.26.6 多阶段 CGO Dockerfile、四个命令、PostgreSQL 主库和三数据库测试；当前实现按单写实例拓扑，并通过本地与真实测试数据库验证业务。完整 Linux 镜像构建运行、线上真实微信/R2、反向代理和数据切换仍需在目标环境验收。

把上线工作拆成制品验证、运行拓扑、外部存储、迁移、切流与回退。只有每步都拿到目标环境证据，才能将“准备好了”升级为“已上线”。

## 延伸阅读

- [部署上线：从本地起服到真正对外服务](https://blog.csdn.net/fungleo/article/details/164815866)
- [一套后端双部署：适配层如何让一份代码跑在两套运行时](https://blog.csdn.net/fungleo/article/details/164816647)
- [容器化：给 Node 应用写一个像样的 Dockerfile](https://blog.csdn.net/fungleo/article/details/164721321)
- [后端测试策略：单元、集成与测试数据库](https://blog.csdn.net/fungleo/article/details/164720486)

---
如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[成为全栈](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->
## 发布辅助信息

### 文章 Tag（6 个）

Go、Golang、Docker、CGO、PostgreSQL、生产部署

### 文章简介（250 字以内）

Go 服务准备上线要验证什么？本文对照 M6 的 Dockerfile 和交付报告，说明 CGO/SQLite 与 Debian/glibc、多阶段镜像、四个运行命令、PostgreSQL 权限、单写实例边界、R2/local 存储、反向代理与数据切换回退。文章明确完整容器构建、真实微信/R2 联调和生产迁移不是本轮已完成证据，并给出目标环境验收表。

### 建议发布分类

后端 / Go

### 封面短标题

准备部署不等于已上线

### 配图 AI 提示词

1. M6-31-封面：Go 多阶段构建，CGO SQLite 与 Debian/glibc，非 root 容器；再连接单写 Go 服务、PostgreSQL、R2、TLS 反代，强调验收边界。
2. M6-31-切换：停写、备份、导出、空库迁移、数据/对象导入、核查、切流、观察、回退分阶段流程图。
3. `M6-31-拓扑`：放在正文同名占位处，生产切换是独立发布事件：停写、备份、导出、空库迁移、数据与对象导入、核查、切流，每一步都可回退。


### 发布前核对

- [ ] 核对 Dockerfile 与交付报告里完整构建/部署的实际状态。
- [ ] 不写成已生产部署、真实 R2/微信或线上数据迁移。
- [ ] 切换回退策略须按正式环境和数据写入要求复核。
- [ ] 替换图片与链接，发布时删除辅助信息。
<!-- PUBLISH_ASSIST_END -->
