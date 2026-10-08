# M6 Go 后端 · 审阅材料索引

本目录只放**评审侧**产物，不侵入 `go-backend/`。

| 文件 | 说明 |
|---|---|
| [M6-Go后端代码审阅报告.md](M6-Go后端代码审阅报告.md) | **第一轮审阅报告（73/100）**：结论速览、8 项优点、P0~P2 问题清单（12 条工单）、评分明细、评审方自我订正、诚实边界 |
| [M6-Go后端代码第一轮审阅回复.md](M6-Go后端代码第一轮审阅回复.md) | **开发方回复**（被审基线 `043fda2`，整改提交 `9590cb1`）：A-1~A-12 逐项落点、量化复核、验证结果、边界保留 |
| [M6-Go后端代码第二轮审阅报告.md](M6-Go后端代码第二轮审阅报告.md) | **第二轮审阅报告（94/100）**：独立复跑 + 第二把尺子交叉验证、12 工单验收、对回复 §5 的裁定、门禁盲区新发现（文档与实现不符） |
| [check_go_quality.go](check_go_quality.go) | **门禁**（Go AST，13 条断言 + `--selftest`）。真实代码 `PASS=3 / FAIL=10`（非空跑）；自检注入 11 类缺陷 **13/13 全红** |
| [check_go_ast.go](check_go_ast.go) | **量化探针**（Go AST 真语法树）：函数长度与嵌套、注释覆盖、导出符号文档、`err`/`e` 命名惯例、长闭包 |

## 用法

```bash
cd go-backend
go run ../docs/go-backend/review/check_go_quality.go .               # 生产代码验收
go run ../docs/go-backend/review/check_go_quality.go . --with-tests  # 含测试
go run ../docs/go-backend/review/check_go_quality.go --selftest      # 验证断言会红
go run ../docs/go-backend/review/check_go_ast.go .                   # 纯量化输出
```

## 与既有材料的分工

- **本目录（评审侧）**：代码工艺 + 教学可读性。
- [`docs/go-backend/07`](../07-验证与兼容报告.md)、[`09`](../09-开发交付与验收.md)、[`reports/`](../reports/)：功能正确性、契约一致性、三库兼容、性能 —— **不由本审阅线评分**。

## 评分链

| 轮次 | 得分 | 门禁 |
|---|---:|---|
| 第一轮（`043fda2`） | **73/100** | `check_go_quality.go`：`PASS=3 / FAIL=10` |
| 第二轮（`9590cb1`） | **94/100** | 生产 `PASS=13 / FAIL=0`；自检 13/13 全红；含测试 `9 / 4` |
