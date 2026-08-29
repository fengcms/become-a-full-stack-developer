# M2-Phase5-NOTES · 仪表盘（M2-17，替换探针）

> 时间：2026-08-29。状态：已交付，四门门禁全绿（test 51 passed）。
> 风格对齐后端 `docs/node-backend/B0-NOTES.md`：交付物 / 关键决策 / 关键设计 / 运行方式 / 待留意。

## 一、交付物

| 文件 | 作用 |
| --- | --- |
| `src/components/dashboard/StatsChart.tsx` | recharts 环形饼图，呈现 `/categories/stats` 分类文章分布；抽独立组件避免撑大页面 |
| `src/pages/dashboard/DashboardPage.tsx` | 改写：分类分布改 recharts 图；新增近期文章 / 近期评论 Top N；待审卡纳入统计网格 |
| `src/api/site.test.ts` | 契约守卫（2 例）：钉死 `getSiteStats→/stats`、`getCategoryStats→/categories/stats` 路径与信封 `data` 形状 |

> 注：`/stats`、`/categories/stats` 的 api 函数（`src/api/site.ts` 的 `getSiteStats` / `getCategoryStats`）与 `useSiteStats` / `useCategoryStats` 钩子在**基座阶段（M2-09）已落地**，当时就接了真实端点（"探针"即是真数据）。Phase 5 是**增强收口**，不是从零替换。

## 二、关键决策 / 选型理由

- **recharts 已装**（R3 风险核实通过：`package.json` 中 `recharts@^3.10.1`）。按计划 Phase 5 明确要求"图表拆 `StatsChart`"，故把原 CSS 条形升级为 recharts 环形饼图。
- **分类分布用环形饼图**：直观表达各分类占比，配 Legend 列出分类名 + 颜色。
- **近期文章**：`listAdminArticles({ sort: '-createdAt', pageSize: 5 })`——契约 `GET /admin/articles` **支持** `sort` 参数（openapi:2365 引用 `Sort`），`-createdAt` 倒序合法。
- **近期评论**：⚠️ **计划与契约偏差**——计划写 `GET /admin/comments?sort=-createdAt`，但契约 `GET /admin/comments`（openapi:2119-2143）**只有** `page`/`pageSize`/`status`/`articleId`，**无 `sort`**。按契约实现：取默认前 5 条 + 前端 `localeCompare` 按 `createdAt` 兜底倒序，确保"近期"语义稳定、不依赖后端默认顺序。
- **权限边界**：近期文章 / 评论仅 `editor+` 可见（`canManageArticles` / `canModerateComments`）；`member` 只看 4 张统计卡 + 分类图，符合后台职责边界。
- **状态标签复用语义令牌**：文章 `status-draft/pending/published`、评论 `status-approved/rejected/reviewing`（均在 `index.css`），与 ArticleListPage / CommentListPage 完全一致。

## 三、关键设计

- **StatsChart**：`ResponsiveContainer(h-64)` + `PieChart` 环形（`innerRadius=42 / outerRadius=80 / paddingAngle=2`）+ `PALETTE`（8 色 HSL 循环，`key=item.id`）+ `Tooltip`(`${value} 篇`) + `Legend`。明暗主题下扇区色均可读。
- **DashboardPage 布局**：
  - 统计卡网格：`xl:grid-cols-5`（editor 含待审卡）/ `xl:grid-cols-4`（member）。
  - 下方 `lg:grid-cols-3`：分类分布图 + 近期文章（editor+）+ 近期评论（editor+）；member 仅见分类图。
  - loading / empty 分支齐全（Skeleton、空态提示）。
- **recentComments 的 select**：`filter(Boolean(createdAt)) → sort(localeCompare) → slice(5)`，用 `?? ''` 而非 `!` 断言，规避 biome `noNonNullAssertion`。
- 日期格式 `date-fns` 的 `format(new Date(v), 'yyyy-MM-dd HH:mm')`，与列表页统一。

## 四、运行方式（门禁）

```
pnpm typecheck   # tsc -b --noEmit，0 错
pnpm lint        # biome check --write，No fixes；CI 只读 biome check EXIT=0
pnpm test        # vitest 51 passed（+2 来自 site.test.ts）
pnpm build       # 成功；DashboardPage chunk 336.46 kB / gzip 99.06 kB（含 recharts，仅仪表盘页 lazy 加载）
```

> 构建告警：md-editor 563.94 kB（owner 已裁决接受）。recharts 使 DashboardPage chunk 升至 336 kB，因路由级 `lazy` 仅仪表盘页承担、不影响首屏，暂不改。

## 五、待留意 / 偏差

1. **评论端点无 sort（计划偏差）**：切勿按 `M2-开发计划.md` §5 给 `GET /admin/comments` 传 `sort`，契约不支持（传了会被忽略或 400）。「近期」由前端 `createdAt` 兜底保证。
2. **recharts 体积**：若后续追求极致首屏，可把 `StatsChart` 单独 `dynamic import()`，但当前 lazy 路由已隔离，非必要。
3. **分类图数据顺序**：`/categories/stats` 返回顺序由后端定；饼图仅展示占比，顺序无业务影响。
4. 未改动契约、未改冻结后端逻辑；本次仅前端增强。文档均未 git commit（owner 自管）。
