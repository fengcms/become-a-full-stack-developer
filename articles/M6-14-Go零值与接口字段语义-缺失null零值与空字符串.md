# 成为全栈·Go 后端篇·Go 零值为什么会改坏接口：缺失、null、0 与空字符串

> JSON 里的“没传”与“传了 false”看起来都很简单，落到 Go struct 更新时却可能被合并。跨语言接口要先保存字段存在性，再解释字段值。

{{IMG:M6-14-封面}}

> 本文代码快照：提交 ceac4e0。契约版本 1.12.0；代码示例为简化示意，发布前按实际 mapper 复核。

## 前言：成功响应也可能悄悄写错数据

假设会员编辑资料时明确把简介清空，请求传 bio 为空字符串。另一个请求没有带 bio，意思是“保留原值”。再一种情况，客户端传 bio 为 null，契约可能将它定义为清空，也可能禁止。三个请求看起来只差一处，却代表三种操作。

Go 的 string 零值是空串，bool 是 false，数字是 0。如果把 JSON 解码到普通 struct，字段缺失和显式零值很容易变成同一份 Go 值；如果使用 GORM 的 Updates(struct)，零值字段还可能默认不更新。结果可能是接口返回成功，却留下旧数据。

M6 使用 values.Fields 保留提交字段集合，并按契约字段白名单转换到数据库更新 map。本文从 JSON 语义、Go 解码、GORM 更新和响应 DTO 四个阶段拆解。原则很直接：先知道客户端提交了什么，再决定数据库应该改变什么。

## 一、几种输入状态必须分开

| JSON 情况 | 字段存在？ | 值 | 常见含义 |
|---|---:|---|---|
| 属性省略 | 否 | 无 | 本次不修改 |
| field 为 null | 是 | null | 显式清空或违反约束 |
| field 为 false | 是 | 布尔假 | 明确关闭 |
| field 为 0 | 是 | 数字零 | 明确归零 |
| field 为空字符串 | 是 | 空字符串 | 明确清空文本 |

具体含义由 operation 契约决定。有些 PUT 要求所有必填字段，省略就应验证失败；某些 PATCH 允许部分字段更新；可空字段允许 null，但空字符串可能仍是合法字符串，或被业务校验拒绝。常见语义不能代替逐接口定义。

上表的“常见含义”只是参考，真正决定语义的是每个 operation 的 schema：同一个 status 字段，在 PATCH 里可能是可选枚举，在 PUT 里可能是必填；同一个 bio，在资料接口允许 null 清空，在注册接口则可能直接拒绝 null。把契约当成唯一依据，才不至于“按感觉实现”。如果 schema 与客户端实际行为发生冲突，应先记录证据，再考虑契约版本变更，而不是让某一端悄悄偏离。

数组也有同样问题：缺失数组和空数组可以分别代表保留关系与清除全部关系。若只看解码后的 nil slice，业务无法知道客户端是否提交了空数组。字段存在性本身就是接口语义的一部分。

## 二、普通 struct 为什么不总够用

普通 ProfileInput 结构体包含 string 和 bool 字段时，解码空对象与显式传入空串、false 的对象，得到的字段值可能完全一样。struct 记住了结果，却没记住原始 JSON 里哪些 key 出现过。

指针可以区分某些值，例如 nil 与指向空字符串，但 null 与省略通常仍都会变成 nil。为每个字段增加 Value、Valid、Set 三种状态可以保留更多信息，却会让 DTO 繁琐，并需要谨慎实现自定义 JSON 解码。

项目先使用 JSON Schema 验证请求，再通过 values.Fields 表示实际提交的字段。Fields 是 map[string]any；Has(k) 判断 key 是否出现，String、Bool、Int 等方法读取经过校验的值。字段存在性靠 Has 判断，不能用值是不是零值推断。它的几个访问方法本身都很短：

~~~go
// internal/values/values.go（节选）
// Has 检查字段是否提交；值为 NULL 仍视为已提交。
func (f Fields) Has(k string) bool { _, ok := f[k]; return ok }

// String 读取已校验的字符串字段，缺失时返回空字符串。
func (f Fields) String(k string) string { s, _ := f[k].(string); return s }

// Bool 读取已校验的布尔值，缺失时返回 false。
func (f Fields) Bool(k string) bool { b, _ := f[k].(bool); return b }

// Int 统一读取 JSON 数值和领域调用的整数表示。
func (f Fields) Int(k string) int64 {
	switch n := f[k].(type) {
	case int64:
		return n
	case int:
		return int64(n)
	case float64:
		return int64(n)
	case json.Number:
		i, _ := n.Int64()
		return i
	}
	return 0
}
~~~

`Has` 与取值方法是两件独立的事：`Has` 回答“键在不在”，取值方法回答“值是什么”。`Bool` 和 `Int` 在缺失时返回零值 0 和 false，这个行为本身没错，问题是调用方若只用它们，就丢掉了键是否存在这一层信息。所以项目里凡是需要区分“没提交”和“提交了零值”的地方，都要显式先调用 `Has`。

这也限定了 Fields 的使用前提：它不是任意未校验 JSON 的通用转换器。请求必须先经过 body 大小限制、JSON 解码和对应 operation schema 校验。无效字符串传入数字字段，应在 HTTP 边界得到字段错误，而不是一路变成 0 再写数据库。

## 三、用白名单构造更新 map

业务 mapper 要维护服务端白名单，不要把输入 map 直接交给 GORM。否则客户端可能尝试更新 id、role、deleted_at 等不允许字段；也不要把任意 JSON key 拼成数据库列名。

对部分更新，可以显式构造 map：

~~~go
patch := map[string]any{}
if fields.Has("isFeatured") {
    patch["is_featured"] = fields.Bool("isFeatured")
}
if fields.Has("summary") {
    patch["summary"] = fields.String("summary")
}
if len(patch) > 0 {
    err := tx.Model(&model.Article{}).
        Where("id = ?", articleID).
        Updates(patch).Error
}
~~~

真实项目里的写法更贴近领域对象：必填字段直接读，可选字段才用 Has 包一层。分类保存就是这样：

~~~go
// internal/taxonomy/categories.go（节选）
	c.Name = in.String("name")
	c.Slug = in.String("slug")
	if in.Has("description") {
		c.Description = in.Text("description")
	}
	if in.Has("parentId") {
		c.ParentID = in.Number("parentId")
	}
	if in.Has("sortOrder") {
		c.SortOrder = in.Int("sortOrder")
	}
	c.UpdatedAt = s.Now().UnixMilli()
~~~

`name` 与 `slug` 是必填，直接读；`description`、`parentId`、`sortOrder` 可选，只有提交了才覆盖目标字段。`Text` 与 `Number` 返回指针，正好承载可空列的 null 语义。这也说明白名单不必都是一张 `patch` map：当领域对象本身就是待写结构时，逐字段的 `Has` 判断同样构成白名单——被省略的字段根本不会被赋值。

代码是示意，字段名和 mapper 位置须按绑定快照复核。资料、阅读进度、站点配置、文章修改的允许字段和 null 规则不同，应在各自领域包中表达。

## 四、GORM Updates(struct) 的零值陷阱

GORM 的 Updates(struct) 默认通常跳过零值字段。把文章 IsFeatured 设为 false，或 SortOrder 设为 0，直接把 struct 传给 Updates 可能不会写入数据库。表面上 SQL 成功，实际更新集合不含这些字段。

用 map 更新时，map 中的零值会作为明确值写入。但“换 map 就行”仍不够：只应加入请求里存在且可写的字段。若 mapper 只将非零值加入 map，会重新引入同一个问题；若无条件加入所有字段，缺失字段又可能被覆盖为零值。正确顺序是先由 Fields.Has 判断提交情况，再根据契约白名单映射数据库列。

也不要对所有操作无差别使用 Select("*")。完整 PUT 和部分 PATCH 的语义不同：PUT 可以要求全部字段存在；PATCH 则只更新出现的字段。具体规则由契约 schema 和领域动作共同决定。

这里有一个反直觉的点：GORM 用 map 更新时，零值会被当作明确值写入。这既是我们想要的行为（提交 false 就写 false），也是风险来源（把整个请求 body 无条件转成 map，就会把未提交的字段一起写成零值）。所以“用 map 就不用担心零值”只对了一半——它解决了“零值写不进去”的问题，却没有解决“哪些字段应该被写”的问题。后者只能由字段存在性和白名单回答。

## 五、NULL、空字符串和可空数据库列

若 GORM model 使用普通 string，SQL NULL 和空字符串无法表示为两个不同的 string 值。nullable 字段可以使用指针或专用 nullable 类型；输入 Fields 则能保留 key 存在而值为 nil。账号表就是按这个规则写的：

~~~go
// internal/platform/model/users.go
// User 账号行；密码哈希和凭据配置标志不直接序列化为 HTTP 响应。
type User struct {
	ID                    int64   `gorm:"column:id;primaryKey;autoIncrement"`
	Username              string  `gorm:"column:username"`
	PasswordHash          string  `gorm:"column:password_hash"`
	CredentialsConfigured bool    `gorm:"column:credentials_configured"`
	Role                  string  `gorm:"column:role"`
	Email                 *string `gorm:"column:email"`
	DisplayName           *string `gorm:"column:display_name"`
	AvatarURL             *string `gorm:"column:avatar_url"`
	Bio                   *string `gorm:"column:bio"`
	Level                 int64   `gorm:"column:level"`
	Status                string  `gorm:"column:status"`
	CreatedAt             int64   `gorm:"column:created_at"`
	UpdatedAt             int64   `gorm:"column:updated_at"`
}

func (User) TableName() string { return "users" }
~~~

可空资料字段是 `*string`，必填的 `Username`、`Role`、`Status` 是值类型。`PasswordHash` 同样在 model 里，但它是密码哈希，绝不能出现在响应 DTO 中——这正是持久化行与响应投影必须分开的原因之一。

领域代码根据契约判断：

~~~go
if fields.Has("bio") {
    if fields["bio"] == nil {
        updates["bio"] = nil // 仅在契约允许 null 清空时
    } else {
        updates["bio"] = fields.String("bio")
    }
}
~~~

提交空字符串应写空字符串，不应自动变成 SQL NULL，除非契约明确定义了规范化。若数据库列为 NOT NULL，应该在 schema 或领域边界给出清楚错误，而不是让数据库异常充当用户验证。

输出也要独立处理。数据库里的空时间应映射为 JSON null；真实时间再按契约转成 UTC 毫秒字符串。缺少输出字段、输出 null、输出空字符串会产生不同客户端行为。输入 presence 与输出 projection 是两个问题，不要让 ORM 自动序列化替接口作决定。

## 六、数组更新和关系表

标签关系可以这样解释：没提交 tagIds 就不触碰关系；提交空数组表示清除全部标签；提交 ID 列表则重新同步。若只检查 len(tagIDs) 是否为零，就无法区分前两种情况。先看 Fields.Has，再决定是否运行关系同步。

事务负责让文章主表和关系调整共同提交或回滚；presence 决定这次是否应该调整关系。阅读进度的 0、null 和缺失也应分别定义：0% 可能表示刚开始阅读，null 可能表示移除已保存进度，缺失可能表示客户端只更新阅读时间并保留进度。Go 技术类型不能直接替业务作决定。

## 七、三种结构分别回答三个问题

Article model 描述数据库持久化字段；输入 mapper 处理契约允许改变的字段；响应 DTO 决定客户端可见字段。它们分别回答“数据库存什么”“这次允许改什么”“接口应返回什么”。

分开结构可以防止任意 JSON key 更新 ORM model、零值被跳过造成假成功、null 被折叠为省略、内部列意外暴露，以及旧 struct tag 在 schema 更新后仍支配输入行为。映射会多几行，但它本身就是兼容层。跨语言重写的重点，是把依赖 JavaScript 对象语义的假设转成明确规则。

## 八、测试要检查数据库后置状态

对每个部分更新接口，先建立可辨识的初值，再验证不同请求：

| 初始值 | 请求 | 预期后置状态 |
|---|---|---|
| bio 为“旧简介” | 未提交 bio | 仍为“旧简介” |
| bio 为“旧简介” | bio 为空字符串 | 变为空字符串 |
| 可空字段非空 | 提交 null | 按契约清空或拒绝 |
| isFeatured 为 true | 提交 false | 明确变为 false |
| progress 为 80 | 提交 0 | 明确变为 0 |
| 已有关联标签 | tagIds 为空数组 | 关系全部移除 |
| 已有关联标签 | 未提交 tagIds | 原关系不变 |

还要覆盖类型错误、未知属性、权限不足和事务中途失败。只验证响应 code=0 看不到 ORM 忽略零值或 mapper 擅自清空关系；重新查询数据库才能证明接口对业务状态的影响。

一个实用的检查习惯是：每写完一个部分更新接口，就立刻问自己“如果客户端把每个可选字段轮流省略一遍，后置状态应该是什么”。把这张期望表先写下来，再对照测试结果，比事后解释“为什么这列没变”省事得多。字段语义表不是文档负担，它是能直接变成测试用例的设计产物。

## 小结：先保留提交事实，再应用更新规则

Go 的零值简洁，却不携带客户端是否提交的历史。M6 先经过 schema 校验，再由 Fields 保留 key 是否出现，最后由领域 mapper 的白名单构造 GORM 更新。NULL、false、0、空串、空数组和缺失因此可以分别处理。

若实现部分更新，先写字段语义表，再选普通 struct、指针、nullable wrapper 或 map。最终测试要验证数据库后置状态。接口正确性常常就藏在“用户明确要清空”和“用户没有提到它”之间。前者要求把字段写成用户给的值，后者要求原样保留，两者不能共用同一个 Go 零值。

## 延伸阅读

- [冻结 OpenAPI 3.1 怎么接入 Go：生成器之外的选择]({{LINK:M6-13}})
- [从 Drizzle 到 GORM：同一套业务的 ORM 取舍]({{LINK:M6-04}})
- [点赞收藏与会员记录：关系表如何守住计数不变量]({{LINK:M6-25}})
- [契约先行：设计一套被多个客户端复用的 API](https://blog.csdn.net/fungleo/article/details/164140515)

---
如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[成为全栈](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->
## 发布辅助信息

### 文章 Tag（6 个）

Go、Golang、JSON、GORM、接口设计、数据库更新

### 文章简介（250 字以内）

Go 的零值与 GORM 更新容易把字段缺失、null、false、0 和空字符串混为一谈。本文结合 M6 的 values.Fields、OpenAPI schema 校验与白名单更新映射，解释资料字段、布尔开关、阅读进度和标签数组的语义，并说明为什么不能直接将请求 JSON 映射到 ORM model。文章给出基于数据库后置状态的测试方法，定位“响应成功但数据没改”的隐蔽问题。

### 建议发布分类

后端 / Go

### 封面短标题

缺失不等于零值

### 配图 AI 提示词

1. M6-14-封面：浅蓝白技术插画，表现 JSON 字段缺失、null、false、0、空字符串经过 Go Fields 识别、白名单 mapper 和数据库更新的流程，强调五种状态不同。
2. M6-14-字段语义：用视觉表格对照“缺失保持、null 清空或拒绝、false/0/空串明确写入”，连接到数据库后置状态测试。

### 发布前核对

- [ ] 字段示例按具体 endpoint 契约核对，可空规则不可泛化。
- [ ] 核对 Values.Fields 与 GORM Updates 行为的代码快照。
- [ ] 替换图片和站内链接；发布时删除辅助信息。
<!-- PUBLISH_ASSIST_END -->
