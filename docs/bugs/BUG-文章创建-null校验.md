# BUG 报告 · 后台创建文章时 `summary/coverImage/slug` 校验失败（code 4001）

- **发现日期**：2026-08-31
- **发现方式**：后台 `/articles/new` 表单提交，浏览器 Network 抓包 + curl 复现
- **严重度**：🔴 高（阻塞「创建文章」主流程，admin 也无法创建）
- **结论**：**后端 BUG（违背冻结契约）。前端实现正确。**
- **所有权边界**：根因在 `node-backend`（M1 已冻结，tag `node-backend-v1.0`）。修复须经后端 owner 确认后走增量维护（fix → 门禁复绿 → commit → 必要时 bump patch tag），前端 AI 不擅自改后端。

---

## 1. 现象

后台新建文章（标题 `222`、正文 `111`，其余留空），接口返回：

```json
{
  "code": 4001,
  "message": "参数校验失败",
  "data": {
    "errors": [
      { "field": "summary",    "message": "Invalid input: expected string, received null" },
      { "field": "coverImage", "message": "Invalid input" },
      { "field": "slug",       "message": "Invalid input: expected string, received null" }
    ]
  },
  "requestId": "62199858-f713-4a94-8c8e-fdc303a9fe64",
  "timestamp": "2026-08-31T04:04:59.475Z"
}
```

复现 curl（请求体由前端发出，已核对一致）：

```bash
curl 'http://localhost:12000/api/v1/articles' \
  -H 'authorization: Bearer <admin jwt>' \
  -H 'content-type: application/json' \
  --data-raw '{"title":"222","content":"111","summary":null,"coverImage":null,"categoryId":null,"tags":[],"slug":null,"status":"draft"}'
```

关键观察：`categoryId` 同样是 `null`，但**后端没有报错**；只有 `summary/coverImage/slug` 报错。

---

## 2. 根因分析（三方证据，以契约为唯一真相源）

### 2.1 契约（冻结 · `docs/api/openapi.v1.yaml` v1.11.0）

`POST /api/v1/articles` → `ArticleCreate` schema（行 515–540）：

```yaml
ArticleCreate:
  type: object
  properties:
    title:     {type: string, maxLength: 200}
    summary:    {type: string, nullable: true, maxLength: 500}        # ← nullable: true
    content:   {type: string, maxLength: 65535}
    coverImage: {type: string, format: uri, maxLength: 512, nullable: true}  # ← nullable: true
    categoryId: {type: integer, nullable: true}
    tags:      {type: array, items: {type: string}}
    slug:      {type: string, nullable: true}                        # ← nullable: true
    status:    {type: string, enum: [draft, pending, published]}
  required: [title, content]
```

契约白纸黑字：`summary / coverImage / slug` 均声明 **`nullable: true`**，即 JSON `null` 是合法取值；`required` 仅 `title`、`content`。
→ **按契约，前端发 `null` 完全合法。**

### 2.2 前端（正确 · `manage-frontend`）

`src/pages/articles/ArticleFormPage.tsx`（Phase 1，文件头注释第 26 行已声明对齐契约）：

```ts
// 表单校验 schema（与 ArticleCreate 对齐：summary/coverImage/slug 为空串时提交转 null）
const schema = z.object({
  summary:    z.string().max(500),
  coverImage: z.string().max(512),
  slug:       z.string(),
  // ...
})

const onSubmit = (values: FormValues) => {
  const payload: ArticleCreate = {
    title: values.title,
    content: values.content,
    summary:    values.summary || null,     // 空串 → null
    coverImage: values.coverImage || null,  // 空串 → null
    categoryId: values.categoryId ? Number(values.categoryId) : null,
    tags: values.tags,
    slug: values.slug || null,              // 空串 → null
    status: values.status,
  }
  createMut.mutate(payload, { onSuccess: () => navigate('/articles') })
}
```

前端**故意**把空串转 `null` 发出——这是对契约 `nullable: true` 的忠实实现（空值用 `null` 显式表达，而非省略 key）。

**类型层佐证**（契约 → `openapi-typescript` 生成）：`src/types/api.gen.ts:1360`：

```ts
ArticleCreate: {
  title: string;
  summary?: string | null;       // ← null 合法
  content: string;
  coverImage?: string | null;    // ← null 合法
  categoryId?: number | null;
  tags?: string[];
  slug?: string | null;          // ← null 合法
}
```

前端 `payload` 赋值 `null` 能过 `tsc`（四门门禁 build 绿），证明**前端实现类型正确、契约对齐**。

### 2.3 后端（BUG · `node-backend/src/routes/articles-write.ts`）

`createArticleSchema`（行 30–39）：

```ts
const createArticleSchema = z.object({
  title:      z.string().min(1).max(200),
  summary:    z.string().max(500).optional(),                          // ❌ 仅放行 undefined，拒 null
  content:    z.string().min(1).max(65535),
  coverImage: z.string().url().max(512).optional().or(z.literal('')),  // ❌ 仅放行 undefined / ''，拒 null
  categoryId: z.number().int().positive().optional().nullable(),      // ✅ 正确放行 null
  tags:       z.array(z.string()).optional(),
  slug:       z.string().optional(),                                  // ❌ 仅放行 undefined，拒 null
  status:     z.enum(['draft', 'pending', 'published']).optional(),
})
```

**根因**：Zod 的 `.optional()` 只接受 `undefined`，**不接受 `null`**。而契约语义是 OpenAPI 的 `nullable: true`（接受 `null`）。二者语义不对齐，导致后端比契约更严，错误拒收合法的 `null`。

`.or(z.literal(''))` 仅为后端对 `coverImage` 的额外宽松（允许空串），并不覆盖 `null`，故 `coverImage: null` 仍报泛化错误 `Invalid input`——与现象吻合。

**后端自身不一致**（关键旁证）：同 schema 内 `categoryId` 用了 `.optional().nullable()`，所以 `categoryId: null` 被放行、不报错；而 `summary/coverImage/slug` 漏写 `.nullable()`，于是 `null` 被拒。报错现象（`categoryId` 静默通过、另三字段报错）与「后端 schema 局部未对齐 nullable」严丝合缝。

---

## 3. 结论

| 维度 | 是否合规 | 说明 |
|---|---|---|
| 契约 `ArticleCreate` | — | 真相源：`summary/coverImage/slug` 均 `nullable: true` |
| 前端实现 | ✅ 正确 | 空值发 `null`，类型对齐 `string \| null`，build 绿 |
| 后端实现 | ❌ 违规 | Zod 用 `.optional()` 未 `.nullable()`，拒收契约允许的 `null` |

**这是后端接口违背冻结契约的 BUG，不是前端实现问题。** 前端严格按契约行事，不应为后端校验过严背锅。

> 纪律提醒：本项目铁律「契约是唯一真相源，前端只消费不改」「凡涉及 schema 改动必须先做冲突分析并请求确认，不擅自写代码」。根因落在后端 schema，属 M1 冻结仓库，修复须走后端 owner 确认 + 增量维护流程。

---

## 4. 建议修复方案（后端，待后端 owner 确认）

文件：`node-backend/src/routes/articles-write.ts`，`createArticleSchema`（行 30–39）。

把三个漏写 `nullable` 的字段与契约对齐（`.nullish()` = `.optional().nullable()`，同时放行 `undefined` 与 `null`）：

```diff
 const createArticleSchema = z.object({
   title:      z.string().min(1).max(200),
-  summary:    z.string().max(500).optional(),
+  summary:    z.string().max(500).nullish(),
   content:    z.string().min(1).max(65535),
-  coverImage: z.string().url().max(512).optional().or(z.literal('')),
+  coverImage: z.string().url().max(512).nullish().or(z.literal('')),
   categoryId: z.number().int().positive().optional().nullable(),
   tags:       z.array(z.string()).optional(),
-  slug:       z.string().optional(),
+  slug:       z.string().nullish(),
   status:     z.enum(['draft', 'pending', 'published']).optional(),
 });
```

`updateArticleSchema` 通过 `createArticleSchema.extend({...})` 继承，**无需再改**，一并生效。

说明：
- `coverImage` 的 `.or(z.literal(''))` 可保留（后端对空串的既有宽松），与 `.nullish()` 叠加后 `null / undefined / '' / url` 全部放行，与契约 `nullable: true` + `format: uri` 不冲突。
- 不建议改为「前端省略 key 发 `undefined`」作为 workaround：那会掩盖后端契约违规、违背「前端忠实契约」原则，且 `null` 仍是契约允许的合法值，正确做法是后端补齐 `nullable`。

---

## 5. 修复后验证

后端（node-backend 门禁）：

```bash
cd node-backend && pnpm test        # 既有 articles.test 应全绿；可补一条「summary/coverImage/slug 传 null 创建成功」用例
```

前端（manage-frontend，已绿，无须改动）：

```bash
cd manage-frontend && pnpm typecheck && pnpm test
```

端到端（复现 curl）：发送 `{"title":"222","content":"111","summary":null,"coverImage":null,"categoryId":null,"tags":[],"slug":null,"status":"draft"}` 应返回 `code: 0` 且创建成功。

---

## 6. 常见误解澄清（为什么不是前端 bug）

- ❌「前端不该发 `null`，应该省略字段 / 发空串」：契约 `nullable: true` 显式允许 `null`，且前端生成类型 `summary?: string | null` 也允许 `null`；发 `null` 是契约正确表达，非前端之过。
- ❌「前端 zod 没限制所以乱发」：前端 zod 仅做 UI 层体验校验（max 长度等），最终 payload 类型由契约生成类型把关；此处前端完全合规。
- ✅ 真正问题在后端 Zod schema 与契约 `nullable` 语义不对齐，且后端内部 `categoryId` 已用 `.nullable()` 而另三字段未用，属局部疏漏。

---

## 7. 关联

- 契约维护批次：本 BUG 属「契约 ↔ 实现偏差回流」，建议登记到后端「契约维护批次」（与 M2 第四轮审阅 R5 `/me/likes` 裸数组偏差同类问题，均需在门禁加反向断言防回归）。
- 前端侧已对 `POST /articles` 各字段有 `articles.test.ts` 守卫；可补充一条「前端空值发 `null`」的反向断言，固化「前端忠实契约」行为，防后人误改。
