# Go 后端 · M6

Go 1.26 + net/http + GORM。使用冻结 OpenAPI 1.12.0 实现68个操作，默认 PostgreSQL 17，同时验证 MySQL 8.4 与 SQLite。完整架构、迁移和验收材料在 [docs/go-backend](../docs/go-backend/README.md)。

## 本机启动

需要 Go 1.26.6 或兼容的更新补丁版本、C编译器和Docker。SQLite驱动使用CGO；本机macOS工具链已通过构建。

```bash
cd go-backend
docker compose -p befull-m6 up -d --wait
# 首次配置；如果 .env 已存在，请保留并检查其内容。
cp .env.example .env
# 将 JWT_SECRET 改为随机密钥；配置 SEED_USERNAME 和 SEED_PASSWORD。
make migrate
make seed
make run
```

`server/migrate/seed` 自动读取当前目录 `.env`，已有环境变量优先。`.env`、数据库、上传文件和二进制都被Git忽略。seed只显式执行，不随服务启动；已有用户名拒绝覆盖。健康端点：`http://127.0.0.1:8080/api/v1/health`，文章：`/api/v1/articles`。

当前这台机器已经准备独立 `befull_dev` 开发库和本地 `.env`。启动后的演示管理员为 `m6admin` / `m6-local-password`，仅供localhost开发；配置中JWT使用随机密钥。重启只需启动compose和 `make run`，不用重复seed。

## 可选数据库

通过 `.env` 或环境变量切换，不修改代码。例如：

```bash
DB_DRIVER=sqlite DATABASE_URL=./local.db make migrate
DB_DRIVER=sqlite DATABASE_URL=./local.db make run

DB_DRIVER=mysql \
DATABASE_URL='root:local-go-only@tcp(127.0.0.1:13306)/befull_go?charset=utf8mb4&parseTime=true&loc=UTC' \
make migrate
```

Docker数据库密码是独立本地开发值；生产使用独立账号、凭据和TLS。compose的项目持久卷保留本地数据；不要对有用数据执行 `down -v`。

## 验证与构建

```bash
make verify       # 格式、vet、冻结快照、全部SQLite领域/HTTP测试
make matrix       # 真实三库全流程、升级、导入；独立临时测试库自动清理
make build        # bin/server、migrate、data、seed；原生CGO构建
go test -race ./...
go run golang.org/x/vuln/cmd/govulncheck@v1.8.0 ./...
```

快照校验和Node对照需要已安装的 `node-backend` 依赖。客户端smoke沿用管理后台Vitest与Flutter工具链，命令见 [验证报告](../docs/go-backend/07-验证与兼容报告.md) 和 [运行手册](../docs/go-backend/06-运行与迁移手册.md)。

```bash
bash scripts/benchmark-local.sh
# 报告写到新建 /tmp/befull-m6-bench.*，不使用线上数据库。
```

Linux多阶段构建配方在Dockerfile，保留CGO/glibc，运行用户为10001。基础镜像manifest已验证；完整容器构建和部署环境运行不属于本机原生验证结论。

## 离线数据工具

```bash
TRANSFER_DATABASE_URL=/absolute/path/to/node-copy.db \
bin/data -mode export -driver sqlite -file /secure/path/snapshot.json

TRANSFER_DATABASE_URL='postgres://USER:PASSWORD@HOST/EMPTY_DB?sslmode=require' \
bin/data -mode import -driver postgres -file /secure/path/snapshot.json -dry-run
# 复核后去掉 -dry-run；目标库需先 migrate，且所有业务表为空（站点单例除外）。
```

保留13张业务表、原ID/密码哈希/微信身份与日期；不复制refresh和阅读去重。工具不搬运附件对象，真实切换要按 [迁移手册](../docs/go-backend/06-运行与迁移手册.md) 执行冻结、文件核查和回退。

当前部署拓扑为单个写服务实例；分类树和共享对象操作仍有进程内协调，公开限流也是进程内。真实微信/R2联调与生产切换单列验收，本轮没有访问生产写入。
