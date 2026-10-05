# 成为全栈·Flutter App 篇·Markdown 编辑器：编辑、预览与离开保护

写作几分钟后按返回，用户不关心我们的控制器拆得多漂亮，只关心正文还在不在。移动设备上，系统手势、应用切换、上传失败和服务端冲突都可能让编辑页离开正常流程。

这篇沿着 `EditorPage` 的 controller、500ms 本机保存队列、预览切换和 `PopScope`，还原一个稿件从编辑到保存的生命周期。

{{IMG:M4-20-封面}}

## 编辑态和预览态共享同一份内容

编辑器有标题、摘要、分类、标签、封面等元信息，也有 Markdown 正文。切换预览只是改变显示方式，不应生成另一份正文副本。否则编辑后预览内容过期，来回切换还可能覆盖光标和草稿。

```text
Editor state
├── metadata: title / summary / category / tags
├── markdown: source text
└── mode: edit | preview
```

预览使用和发布阅读尽可能接近的解析组件，但编辑中的未保存内容是私有数据，不能进入公开代码 token 缓存或公共文章缓存。

{{IMG:M4-20-编辑流程}}

## 保存请求只在必要字段变化时发送

编辑器需要校验必填字段、长度和状态允许的动作。保存草稿与提交审核是不同动作，不要让一个“保存”按钮根据模糊逻辑偷偷切换状态。失败时保留所有输入和上传关联，向用户定位错误并允许恢复。

## 离开保护要覆盖系统返回

仅拦截 App 内工具栏返回不够，Android 系统返回手势和路由 pop 也可能离开。页面需判断是否有未保存改动，再显示确认；确认离开意味着用户明确放弃当前内存编辑态，但本机恢复副本仍按产品策略可供稍后恢复。

别把任何输入都当成 dirty：页面刚载入的服务端值是初始基准；保存成功后重置基准；图片上传状态或元信息变更也要纳入 dirty 判定。

## 组件拆分不转移表单所有权

项目将编辑页拆成 `editor_metadata.dart`、`editor_body.dart`、`editor_preview.dart`、工具栏和保存动作组件；控制器、提交、校验与页面生命周期仍由宿主编辑页拥有。私有展示组件不接收整个 State，而是接收明确字段、控制器和回调。

## Dirty 状态相对基线是更好的后续改进

当前编辑器在加载完成后，任一输入监听器触发就设置 `dirty = true`，保存成功后复位；用户把字段改回原值，仍会被提示未保存。这是简单而保守的离开保护。更精确的方案是编辑器加载时保存一份规范化基线，dirty 表示可提交字段与基线不同；服务器保存成功后再用确认结果更新基线。

```text
baseline = normalize(serverArticle)
current = normalize(editorFields)
isDirty = current != baseline || pendingUploads.isNotEmpty
```

规范化可处理标签空格、可选摘要等非语义差异，但不能把用户输入静默改写。离开拦截只在 `isDirty` 为真时提示；上传中也需告知仍有待完成操作。测试应覆盖系统 back、路由 pop、保存失败、保存成功后返回和编辑器切换预览。若引入基线比较，要保证自动恢复本机副本后 dirty 为真，即使它与服务器原稿接近也不能误删恢复数据。

## 编辑器是一个小型事务流程

一次“提交审核”可拆为校验、等待上传完成、构造载荷、写服务端、接收权威状态、更新基线并清除恢复副本。任一步失败都要知道哪些动作已经发生。例如图片上传已成功但文章保存失败，附件 URL 可以保留在编辑态；不能因此清掉正文或本机副本。

```text
validate fields → await uploads → save/create draft
→ install server response → update baseline → clear recovery copy
```

若用户在网络响应前离开，离开保护应区分“正在提交”和“未保存”。重复点按钮要禁用或共用同一个提交任务，避免重复创建；页面被销毁后仍应由服务层完成必要状态处理，UI 回写则先检查 mounted/epoch。

## 本机自动保存是节流写入，不是服务端保存

控制器变化后页面设置 500ms Timer，再将标题、摘要、正文、标签、分类、封面和服务端基线时间写入 SharedPreferences。连续输入会取消前一个 Timer；写队列 `draftWrite` 串行执行，避免较早的异步落盘晚于较新内容。

```text
keystroke → dirty=true → cancel prior timer
500ms quiet → JSON snapshot → serialized preferences write
server save success → await pending write → remove recovery key
```

本机自动保存失败会提示用户尽快保存服务端；页面销毁时仍尝试持久化 dirty 内容，但没有 UI 可展示错误。因此它降低意外丢稿概率，不是绝对持久化保证，设备存储损坏或卸载仍可能丢失。


## 贴着工程代码读实现

下面这段节选自 `flutter-app/lib/features/editor/editor_form.dart 第 4–97 行`（保留原始实现；为突出主线省略了文件其余部分）。读代码时可以顺着调用链确认：修改字段、保存成功、再返回，观察 dirty 状态是否重置。沿着调用链读下去，才能看清这个选择如何影响实际页面。

```dart
class _EditorForm extends StatelessWidget {
  const _EditorForm({
    required this.status,
    required this.dirty,
    required this.id,
    required this.title,
    required this.summary,
    required this.content,
    required this.toolbar,
  });
  final String status;
  final bool dirty;
  final int? id;
  final TextEditingController title;
  final TextEditingController summary;
  final TextEditingController content;
  final Widget toolbar;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Row(
        children: [
          StatusBadge(status),
          const SizedBox(width: 12),
          Text(
            dirty
                ? '有未保存的修改'
                : id == null
                ? '尚未保存'
                : '已与服务器同步',
            style: context.text.bodySmall,
          ),
        ],
      ),
      const SizedBox(height: 16),
      const Text(
        '标题 *',
        style: TextStyle(
          fontSize: AppType.caption,
          fontWeight: FontWeight.w500,
        ),
      ),
      const SizedBox(height: 7),
      TextField(
        key: const ValueKey('editor-title'),
        controller: title,
        maxLength: 200,
        decoration: const InputDecoration(hintText: '不超过 200 字'),
      ),
      const Text(
        '摘要',
        style: TextStyle(
          fontSize: AppType.caption,
          fontWeight: FontWeight.w500,
        ),
      ),
      const SizedBox(height: 7),
      TextField(
        controller: summary,
        maxLength: 500,
        minLines: 2,
        maxLines: 4,
        decoration: const InputDecoration(hintText: '一到两句话说清这篇文章解决什么问题'),
      ),
      const Text(
        '正文（Markdown）',
        style: TextStyle(
          fontSize: AppType.caption,
          fontWeight: FontWeight.w500,
        ),
      ),
      const SizedBox(height: 7),
      TextField(
        key: const ValueKey('editor-content'),
        controller: content,
        minLines: 14,
        maxLines: null,
        maxLength: 65535,
        maxLengthEnforcement: MaxLengthEnforcement.enforced,
        style: const TextStyle(
          fontFamily: 'monospace',
          fontSize: AppType.caption,
          height: 1.85,
        ),
        decoration: const InputDecoration(
          hintText: '开始写作…',
          alignLabelWithHint: true,
        ),
      ),
      toolbar,
    ],
  );
}
```

## 把容易出错的路径走一遍

我会用这个场景做一次可复现排查：**离开保护只看字段是否曾变化，保存后仍持续弹窗**。先修改字段、保存成功、再返回，观察 dirty 状态是否重置；如果把问题定位在“永久 dirty bool”，修正方向是“将初始快照与当前 payload 比较，并在成功保存后更新基线”。最后再验证正常路径没有退化，并把边界条件留在自动化检查里。

| 方案比较 | 简化做法 | 当前实现/推荐做法 |
|---|---|---|
| 本文核心选择 | 永久 dirty bool | 内容快照比较 |
| 错误处理 | 失败后清空或静默忽略 | 保留可恢复状态，给出明确反馈 |
| 验证方式 | 只检查成功结果 | 注入边界条件并检查回归 |

| 排错步骤 | 要观察什么 | 通过条件 |
|---|---|---|
| 复现 | 离开保护只看字段是否曾变化，保存后仍持续弹窗 | 可以稳定触发或明确构造该输入 |
| 定位 | 修改字段、保存成功、再返回，观察 dirty 状态是否重置 | 找到责任层和状态归属 |
| 修正 | 将初始快照与当前 payload 比较，并在成功保存后更新基线 | 失败不污染后续页面或账号 |

## 小结

移动编辑器要让编辑/预览共享单一内容源，显式区分保存与提交审核，离开保护覆盖系统返回，并在失败时保留用户数据。UI 拆文件可以降低阅读负担，但不应让多个子组件各自维护一份稿件状态。

## 延伸阅读

- [投稿状态机：草稿、待审核与已发布]({{LINK:M4-19}})
- [本机稿件恢复：恢复范围与冲突判断]({{LINK:M4-22}})
- [Markdown 编辑器：预览、暗色主题与图片粘贴](https://blog.csdn.net/fungleo/article/details/166107729)

---

如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->

## 发布辅助信息

### 文章 Tag（6 个）

`Flutter`、`Markdown编辑器`、`表单设计`、`草稿保存`、`移动开发`、`全栈开发`

### 文章简介（250 字以内）

移动 Markdown 编辑器的首要目标是保护用户内容。本文结合 Flutter 投稿页说明编辑/预览如何共享单一状态、元信息如何校验、保存草稿与提交审核如何区分、系统返回如何触发未保存保护，以及组件拆分为何不应分散表单所有权。

### 建议发布分类

全栈开发 / Flutter

### 封面短标题

先保护用户写下的内容

### 配图 AI 提示词

1. `M4-20-封面`：16:9 中文移动写作封面，手机 Markdown 编辑器与预览共享同一内容，系统返回时弹出未保存确认，草稿内容安全保留。
2. `M4-20-编辑流程`：16:9 状态图，服务端初始稿件→编辑态→预览态→保存/提交→失败保留输入→离开确认，蓝色流程。

### 发布前核对

- [ ] 替换 2 处配图占位符
- [ ] M4-19、M4-22、M2-10 发布后回填站内链接
- [ ] 编辑组件职责与当前 editor.dart 核对
- [ ] 已删除本辅助区
