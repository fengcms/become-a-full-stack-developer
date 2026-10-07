# 成为全栈·Node 后端篇·Node 测试通过，Workers 登录为什么仍然 500

> 这次失败不是业务规则写错了，而是请求还没有发出去，运行时就拒绝了一个配置选项。

{{IMG:M1-34-封面}}

## 前言：两个 Secret 上传成功，然后呢？

小程序的微信登录代码已经接好，后端身份与首次账号设置测试也通过了。最后缺的，是线上 AppID 和 AppSecret。

把两项 Secret 上传到 Cloudflare，工具明确显示成功。我又检查了一遍密钥名称，没问题。此时点击“微信快捷登录”，按理应该进入会员中心。

结果是 500。

这时最容易冒出来的判断，是“密钥是不是抄错了”或者“微信接口是不是不通”。我没有立刻重置 AppSecret：普通文章接口仍然正常，说明服务没整体倒下；而 Secret 存在，只证明配置上传成功，不能证明微信请求已经执行。

这一篇按实际排查顺序，讲一个很短的代码错误，怎样穿过单测和部署检查。读完之后，希望各位看官下次遇到“本地绿、线上红”，能少改几次没有证据的问题。

> 环境与代码：本次发生于 2026-10-07，项目 Worker 兼容日期为 2025-01-01。修复提交 `268d493`；本文描述这一运行环境的观察，不推定所有版本行为相同。

## 一、先确认失败在哪条边界

微信登录至少跨过四层：小程序取得 code，业务后端收到请求，后端向微信交换身份，自己的系统查人并签发会话。

收到 500，并不能直接定位其中哪一层。我先做了两个低成本检查：

| 检查 | 结果 | 能支持的判断 |
|---|---|---|
| 普通文章 GET | code 0 | Worker 普通读接口仍可用 |
| secret list | 两项微信 Secret 存在 | 上传到目标 Worker 的键名正确 |

再使用一个故意无效的 code 调用 callback。它同样返回 500，而不是预期的凭证无效。

这个探测不用于验证登录成功，更不用于创建身份。它的价值是把“创建会员、写数据库”暂时排除在主要排查路径之外：无效 code 应该先在平台交换阶段被拒绝。

密钥仍可能有问题，但现在没有理由只盯着密钥。

## 二、错误隐藏得安全，也可能隐藏得太彻底

原实现捕获上游异常，返回统一内部错误，不把微信敏感字段交给客户端。这个方向没错，但日志不足以区分“缺少配置”“请求失败”和“微信拒绝”。

我加的是受控原因，而不是 `console.error(error)`：

```ts
console.warn('[wechat.exchange]', {
  reason: 'transport_or_invalid_response',
});
```

其他分支可以记录静态原因、HTTP 状态或上游数值错误码。不能直接打印 URL：交换请求的查询串里有 AppSecret 和临时 code。异常原文、微信响应全文也可能把这些东西顺手带出来。

线上诊断随后指向 `transport_or_invalid_response`。这个原因覆盖请求与解析，不足以直接指认某个参数，却足以让我把注意力移回 fetch，而不是继续改数据库或密码逻辑。

**脱敏不是把每个字符替换成星号，而是先决定日志真正需要哪些字段。** 原始 tail 里可能还有请求头和身份信息，文章素材只保留诊断结论，不复制整个事件。

## 三、在 workerd 里，那个合法选项不合法了

出问题的原请求是：

```ts
// 修复前的配置
const response = await fetch(url, {
  signal: AbortSignal.timeout(8000),
  redirect: 'error',
});
```

当初选 `error` 的意图很明确：请求包含凭据，不允许被重定向到别处。这个安全要求没有错，错在未经验证地认为当前边缘运行时接受该选项。

我用本机 Miniflare/workerd，保持项目兼容日期，构造了最小请求。目标 URL 不含真实 Secret，也不需要有效 code。返回的 TypeError 直接指出：当前运行时接受 follow 或 manual，拒绝 error。

```text
TypeError: Invalid redirect value ... "follow" or "manual"
```

这里只摘录定位所需的错误片段。异常在处理请求选项时发生，因此不会有微信返回的业务错误码。重置十次 AppSecret，也改变不了运行时对 redirect 参数的判断。

一个重要细节是，我复现的是**实际执行**，不是检查 TypeScript 类型。类型声明允许某个字符串，不能证明每一种目标运行时都执行相同语义。

{{IMG:M1-34-排查证据链}}

## 四、改成 manual，不能顺手把禁止跳转丢了

最快的“修复”也许是删掉 redirect，或者改成 follow。但请求恢复成功，不代表安全要求被保留。

本次选择手动处理，同时拒绝非成功状态：

```ts
const response = await fetch(url, {
  signal: AbortSignal.timeout(8000),
  redirect: 'manual',
});
if (!response.ok) {
  console.warn('[wechat.exchange]', {
    reason: 'http_status', status: response.status,
  });
  throw new Error('upstream');
}
```

这段来自 `src/services/wechat.ts`。3xx 不属于成功状态，因此不会进入身份解析；我们也不读取 Location 后再请求。

| 配置方向 | 请求行为 | 本次判断 |
|---|---|---|
| error | 当前 workerd 在请求阶段拒绝选项 | 不可用 |
| follow | 自动跟随跳转 | 不符合本次凭据边界 |
| manual + 检查状态 | 保留跳转响应，交业务代码拒绝 | 采用 |

修复的目标，是让同一个安全意图在目标环境里成立，而不是单纯把报错关掉。

当前 [Cloudflare Request 文档](https://developers.cloudflare.com/workers/runtime-apis/request/) 也应作为核查入口；通用文档与本次执行结果需要结合具体版本、兼容日期阅读。我们已经拿到的运行时证据，不能被一句“类型里有这个值”替代。

## 五、为什么 mock 测试没有发现它？

原测试替换了全局 fetch：给某个 code 返回模拟 openid，随后检查同一身份只建一人、账号设置与旧 refresh 撤销等行为。

这样的测试不会执行真实 RequestInit 参数校验。你传 error，mock 仍然返回一个成功 Response。

这不意味着业务测试没价值，只说明它的边界更窄：它证明“上游给出某种结果后，我们如何处理”，没有证明“目标运行时能发出这条请求”。

针对本次修复，我们增加了一个 302 回归用例，关键断言如下：

```ts
expect(fetchMock).toHaveBeenCalledTimes(1);
expect(fetchMock).toHaveBeenCalledWith(
  expect.any(URL),
  expect.objectContaining({ redirect: 'manual' }),
);
expect(await db.select().from(users)).toHaveLength(0);
```

完整测试还断言 callback 返回 500。它保护的是不跟随跳转、不因失败创建会员，而不是仅把新字符串记在测试里。

但这个 mock 仍不能替代 workerd 复现。所以我保留三层检查：业务分支测试、目标运行时参数执行、真实平台登录。不同层次不是重复劳动，各自覆盖一块盲区。

## 六、部署之后，要按证据强度逐步确认

修复后，TypeScript 和微信相关 10 项测试通过，代码重新部署到目标 Worker。线上验证分两步：

1. 故意无效的 code 从 500 变成 401 / 1002。这证明请求进入了微信凭据校验，尚不能证明真实会员登录。
2. 开发者工具调用真实 `wx.login`，再请求线上 callback，进入“微信会员”的会员中心，显示首次设置用户名密码入口。

这次才可以说：真实微信登录已通过。实际设置密码后登录 APP/网站，以及真实身份重复登录复用同一 userId，仍未逐项人工操作；后端相关逻辑测试通过，不等于所有平台验收都完成。

还有一个部署细节值得记住：前端 AppID 不会自动变成后端配置。本次使用 `WECHAT_MINI_APP_ID` 与 `WECHAT_MINI_APP_SECRET`，写入目标 Worker 的 Secrets，原 JWT_SECRET 保留。[Cloudflare Secrets 文档](https://developers.cloudflare.com/workers/configuration/secrets/) 说明了配置方式；本地文件存在、上传成功和新版本运行是三个不同状态。

不要把 Secret 值写进命令参数、文章代码或调试截图。文中需要的是配置名、结果与版本证据，不是生产凭据。

## 七、下次遇到线上 500，我会怎么缩小范围

我会先沿请求边界列假设，再找能排除假设的证据：普通接口是否正常，配置是否在目标环境，上游请求是否真正发出，错误发生在参数校验、网络、响应解析还是业务写入。

如果某层只能返回一个宽泛错误，就补一条受控诊断；如果怀疑运行时差异，就构造不依赖真实身份的最小复现。不要一次修改网络、数据和凭据三层，否则“好了”也不知道是哪一步起作用。

## 小结

这次问题最终只有一个选项需要修改，真正有价值的却是排查路径：密钥核对、脱敏诊断、运行时复现、安全语义保持、回归、真实验证。

我也会把“测试通过”写得更具体。mock 测试通过，说明业务分支成立；workerd 执行通过，说明当前运行环境接受这条请求；真实微信登录通过，才说明这一次平台身份确实接到了我们的会员系统。

读者下次遇到本地绿、线上红，先问绿色到底覆盖了哪一层。这个问题，比再跑十遍相同测试更有用。

## 延伸阅读

- [一套后端双部署：适配层如何让一份代码跑在两套运行时](https://blog.csdn.net/fungleo/article/details/164816647)
- [结构化日志与请求链路追踪](https://blog.csdn.net/fungleo/article/details/164363025)
- [微信登录与首次账号设置]({{LINK:M1-33}})

---

如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->

## 发布辅助信息

### 文章 Tag（6 个）

`Node.js`、`CloudflareWorkers`、`FetchAPI`、`微信登录`、`故障排查`、`后端测试`

### 文章简介（250 字以内）

微信密钥已上传、Node 测试已通过，线上登录却返回 500。本文还原一次真实排查：从普通接口与配置核验，到受控脱敏日志，再用 workerd 复现 redirect:error 参数被拒绝的问题。通过 manual 与拒绝 3xx 保留禁止重定向的安全要求，并补充请求次数和不建号回归。结合修复后的 401 探测与真实 wx.login 成功，说明 mock、运行时验证和平台实测各自能证明什么。

### 建议发布分类

全栈开发 / Node.js

### 封面短标题

本地绿，线上红

### 配图 AI 提示词

1. `M1-34-封面`：16:9 技术博客封面，左侧绿色“Node 测试”，右侧橙红“Workers 500”，中间放大镜定位 redirect 参数，下方青色修复箭头。深蓝背景，只出现中文标题“本地绿，线上红”，不展示真实凭据、日志截图、品牌 Logo。
2. `M1-34-排查证据链`：插入第三节后，16:9 横向排查信息图，依次“密钥存在”“交换阶段失败”“workerd 参数复现”“manual 拒绝跳转”“无效 code 401”“真实登录成功”；前两节点不能直接连到成功。静态原因日志作旁注“无密钥、无身份原文”。深蓝与青绿配色，文字清晰，结构优先。

### 发布前核对

- [ ] 替换两处配图，回填 M1-33 链接
- [ ] 代码使用修复提交 268d493 或包含该修复的后续快照
- [ ] 保留具体环境限定，不写成任何 Workers 版本都不支持 error
- [ ] 不粘贴生产 Secret、完整 tail 事件或临时 code
- [ ] CSDN 预览检查表格和代码；删除发布辅助区

<!-- PUBLISH_ASSIST_END -->
