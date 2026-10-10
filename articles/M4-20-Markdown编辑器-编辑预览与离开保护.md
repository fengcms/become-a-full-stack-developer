# 成为全栈·Flutter App 篇·Markdown 编辑器：编辑、预览与离开保护

编辑器有两个按钮：编辑、预览。切一下。就这样。

我最初的实现就是切一下——然后发现用户抱怨"预览之后回来，我的东西没了"。

原因很蠢：我在切换时重建了 `TextEditingController`，而新 controller 是空的。**文本还在 `TextField` 的渲染里，但数据源已经被换掉了。**

这个 bug 让我意识到一件事——**编辑器里所有的状态必须活在同一个生命周期里**，而不是各自为政。M4-19 讲了投稿状态机，这一篇讲的是编辑器**界面**这一层。

{{IMG:M4-20-封面}}

## 编辑/预览切换：Controller 不能重建

现在看正确的做法。切换按钮只是个开关：

```dart
/// 编辑/预览切换保留同一组文本控制器，不丢失未保存内容。
class _EditorModes extends StatelessWidget {
  const _EditorModes({
    required this.preview,
    required this.length,
    required this.onMode,
  });
  final bool preview;
  final int length;
  final ValueChanged<bool> onMode;
  @override
  Widget build(BuildContext context) => Row(
    children: [
      for (final mode in [false, true])
        OutlinedButton(
          style: OutlinedButton.styleFrom(
            backgroundColor: preview == mode
                ? context.colors.brandSubtle
                : context.colors.surface,
            shape: RoundedRectangleBorder(borderRadius: AppRadius.rSm),
          ),
          onPressed: () => onMode(mode),
          child: Text(mode ? '预览' : '编辑'),
        ),
      const Spacer(),
      Text('$length / 65535', style: context.text.labelSmall),
    ],
  );
}
```

`for (var mode in [false, true])` 这个循环同时生成了两个按钮，`preview == mode` 决定哪个高亮。**两个按钮共享同一个 `onMode` 回调，状态只有一份。**

而真正关键的变化在内容的组合：

```dart
AbsorbPointer(
  absorbing: busy,
  child: preview ? previewBody : form,
)
```

**`form` 是常驻的，不是切换时新建的。** `previewBody` 也是同一个 Widget 实例的两个分支，而 `TextEditingController` 在编辑器页面 State 里，从 `initState` 活到 `dispose`。

所以切换只改变**渲染哪一棵子树**，数据源完全不动。

这个思路推广开来就是：**编辑器页面里所有的状态都活在同一个生命周期里。** 标题、摘要、正文、封面、分类、标签——全部是 `editor.dart` 那个 State 的字段。切换模式、切分类、失败重试，都没有一样东西被重建。

## 那个长度计数器

右上角那个 `1234 / 65535` 看着不起眼，它有两个作用：

**一、告诉用户还剩多少。** 到上限之后不能继续输入——这不是拒绝服务，而是**服务端契约的限制**（`content` 字段最大 65535）。如果让用户写到 60000 字然后提交失败，那个报错毫无意义。

**二、它是一个免费的"内容确实被输入了"的信号。** 因为 `length` 来自 controller，所以它变了一定意味着 controller 变过。这一点在判断"内容有没有改"时可以直接用。

而 `65535` 这个数字**应该从契约来**，而不是写死在界面里。如果哪天服务端改成 65536，这里得跟着改。现在的做法是它写在设计稿里，改的时候记得两处一起改——**这是一个已知的不足，不是完美的方案。**

{{IMG:M4-20-编辑流程}}

## 忙碌期为什么要锁住整个表单

`AbsorbPointer(absorbing: busy)` 那一行，我一开始觉得没必要。

理由很朴素：**保存的时候，用户如果继续打字，那次保存存的是哪一版？**

时序：用户点保存 → 请求发出（携带当时的内容）→ 请求在飞 → 用户继续打字 → 请求回来 → 界面显示"保存成功" → **但用户刚打的那段字没保存，而且他不知道。**

更糟的情况是第二篇讲的那个：**他在保存成功之后继续打字，然后触发离开保护**——因为 `dirty` 判断是基于"和服务端的差异"，而服务端刚更新过，所以这一版被判成"未修改"，直接放他离开。**用户刚打的字没了。**

`AbsorbPointer` 解决的就是这个：**请求期间整个表单不接受输入。**

它比 `IgnorePointer` 更合适的地方在于：`AbsorbPointer` 不仅屏蔽了触摸，还让被包裹的子树**不参与焦点和语义**，对屏幕阅读器来说内容也是"不可交互"的。而 `IgnorePointer` 只挡触摸，可访问性上不完全。

而"忙碌"这个状态需要覆盖的**不止保存**。上传图片、提交审核、切回预览重新渲染——凡是会改内容的异步操作，都算 busy。理由统一：**如果用户能在请求期间改内容，那这次请求的结果和用户看到的内容就不对应。**

## 保存按钮的三个细节

底部那条：

```dart
/// 保存和送审共享忙碌状态，避免重复写入。
class _EditorSaveBar extends StatelessWidget {
  ...
  child: Row(
    children: [
      Expanded(
        child: OutlinedButton(
          onPressed: busy ? null : () => save(false),
          child: Text(status == 'draft' ? '保存草稿' : '保存修改'),
        ),
      ),
      if (status == 'draft') ...[
        const SizedBox(width: 12),
        Expanded(
          child: SubmitButton(
            label: '提交审核',
            busy: busy,
            onPressed: () => save(true),
          ),
        ),
      ],
      if (status != 'draft' && busy)
        const Padding(
          padding: AppInsets.small,
          child: CircularProgressIndicator(),
        ),
    ],
  ),
```

三个细节：

**一、按钮文案跟着状态变。** `status == 'draft'` 时是"保存草稿"，其他状态是"保存修改"。因为这两种保存的语义不一样：前者是"存在草稿箱里"，后者是"更新我的稿件"。

**二、"提交审核"按钮只在草稿状态存在。** 这和 M4-19 的 `actionsFor` 是同一套规则，只是落在界面层。**待审核和已发布状态不显示它**，因为不能重复提交。

而"保存修改"在任何非草稿状态都显示——待审核能改，已发布也能改（M4-19 讲过，改已发布的会重新进审核）。

**三、busy 时显示转圈的位置不一样。** 草稿状态有两个按钮，`SubmitButton(busy: busy)` 自带转圈；非草稿状态只有一个按钮，所以单独显示一个 `CircularProgressIndicator`。

这个差异是外观问题，但它反映了一个真实区别：**草稿状态的保存栏有两个可能触发的动作，需要在两个按钮上都表达忙碌；非草稿状态只有一个按钮需要。**

而 `onPressed: busy ? null : ...` 这个写法保证了**两个按钮共享同一个 busy 状态，不可能一个在转圈另一个还能点**。注释说的就是这个——避免重复写入。

## 离开保护：什么时候该拦，什么时候该放

M4-19 提过 `PopScope` 的三个条件，这里补上"什么时候算脏"的判断标准。

```dart
canPop: allowLeave || (!dirty && !busy),
```

`dirty` 不是"用户碰过键盘"，而是**当前内容和服务端内容实际有差异**。

这个区别很重要。设想用户打开编辑器、随手点了几下又全部撤销——**内容和服务端一样，不该拦。** 如果用"碰过就脏"的判断，用户会频繁看到"确定离开吗"，然后学会无脑点确定——**拦截提示一旦被用户无视，就等于没有。**

而比较的对象是**服务端那份**，不是进页面时的那份。因为服务端可能在用户编辑期间变了（M4-19 讲的并发场景）。

`allowLeave` 那一条更微妙：**保存成功后要给一条出路。**

用户点保存 → 成功 → 服务端内容更新 → `dirty` 自动变成 false → 可以直接退。

但如果保存过程中状态更新有延迟（比如 `allowLeave` 是在 `finally` 里清的），就会有一个瞬间：请求成功了、内容显示"已保存"、但 `dirty` 还没重算。**这时候用户退出，会被一个不该出现的弹窗拦住。**

所以 `allowLeave` 是个显式标志位，在保存成功的分支里设置。它和 `dirty` 分工不同：

| |含义 | 谁来清 |
|---|---|---|
| `dirty` | 内容和服务端有差异 | 每次内容变化时重算 |
| `allowLeave` | **刚刚保存成功**，这次可以走 | 保存成功时置位，下次内容变化时清零 |

**为什么要分开？** 因为"内容没差异"和"用户刚保存过"是两种不同的状态。前者是事实，后者是意图。而离开保护拦的是**意图**——用户在保存成功后还想走，这本身没有问题，不该被拦。

{{IMG:M4-20-离开保护}}

## 上传失败：正文必须留着

编辑器里有个图片上传。失败的时候：

```dart
if (uploadFailed)
  ListTile(
    title: const Text('图片上传失败，正文已保留'),
    trailing: TextButton(
      onPressed: busy ? null : retryUpload,
      child: const Text('重试'),
    ),
  ),
```

那条 `ListTile` 插在表单和保存栏之间，不占内容的空间，但足够显眼。

**"正文已保留"这四个字是刻意加的。**

因为用户遇到上传失败时的第一反应是"完了，白写了"。如果不告诉他正文还在，他可能会选择放弃——**重新读一遍自己刚写的东西，比多点一下重试麻烦得多。**

而这个提示还带了一个"重试"按钮。**因为上传失败通常是可以重试的**（网络抖动、图片太大被拒），而不是必须重新操作整个流程。

顺带说图片上传的客户端校验：

```dart
final ext = file.name.split('.').last.toLowerCase();
const types = {
  'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
  'webp': 'image/webp', 'gif': 'image/gif',
};
if (!types.containsKey(ext)) {
  throw const ApiFailure('请选择 PNG、JPG、GIF 或 WebP 图片');
}
if (await file.length() > 10 * 1024 * 1024) {
  throw const ApiFailure('图片不能超过 10MB');
}
```

**在发请求之前就拦住。** 三个点：

- **扩展名白名单**，同时用于推导 MIME type——不信任客户端给的头，用文件名推断
- **`toLowerCase()`**：`.PNG` 和 `.png` 是同一个文件，用户不该因为大小写被拒
- **大小限制在本地做**，不让用户传完 20MB 上传完才发现超限

而抛出的是 `ApiFailure`——**复用了 M4-08 那个错误类型**。所以它会自动走到统一的错误展示路径，不需要单独处理。

## 这个页面的组件拆分

看这几段代码，它们都是 `part of '../editor.dart'`：

```dart
part 'editor/editor_save_bar.dart';
part 'editor/editor_modes.dart';
part 'editor/editor_body.dart';
part 'editor/recover_draft.dart';
```

用 `part` 而不是独立文件，是因为它们都要访问 editor 那个 State 里的私有字段——`status`、`busy`、`preview`、`form`、`previewBody`。

M4-17 讲过这个取舍：**`part` 文件不能自己 import，也不能独立测试。** 但这里四个组件共享同一批状态参数，拆成独立文件的话每个 `build` 都要传七八个参数，签名比代码还长。

**我接受的判断标准是：当一个组件的状态来源就是父类的私有字段时，用 `part`。** 因为那些字段本来就不该被外部访问，用 `part` 恰好保持了这种私有性。

而 `editor_body.dart` 那个 `AbsorbPointer` 的位置——**包住内容和表单，但不包括保存栏**。这也是有意的：

```dart
Expanded(
  child: SingleChildScrollView(
    padding: AppInsets.page,
    child: AbsorbPointer(absorbing: busy, child: preview ? previewBody : form),
  ),
),
saveBar,
```

保存栏在外面，所以它**自己的** `onPressed: busy ? null` 生效——忙碌时按钮禁用，但表单区域的输入也被锁。**两个层次都挡住了。**

## 验收该看什么

编辑器是交互最重的页面，测试重点在"状态转换"而不是"渲染"：

| 场景 | 该验证 |
|---|---|
| 编辑 → 预览 → 编辑 | 内容完全一致 |
| 预览状态下保存 | 保存的是编辑的内容 |
| 保存中尝试输入 | 输入被忽略 |
| 保存成功后立刻退出 | 不弹离开确认 |
| 改了又撤销 | 不算 dirty |
| 草稿状态 | 只显示"提交审核" |
| 待审核状态 | 不显示"提交审核" |
| 上传失败 | 正文还在，有重试按钮 |
| 内容超过上限 | 拦在客户端 |

第一行"编辑 → 预览 → 编辑"就是这次修的那个 bug 的回归测试。**它现在是一个显式用例，而不是靠手动点两下确认。**

## 一条我一开始想省掉的事

`dirty` 的计算，我最初写成"只要用户输入过就标记为脏"。

结果测试时发现一个问题：我打开编辑器，随便按了个空格然后删掉，测试失败了——因为它被标记成 dirty。

修的时候顺手想明白了：**这个标记的用途是"决定要不要拦用户"，那么它的准确度就比速度重要。** 多拦一次，用户就会开始无脑忽略；少拦一次，用户丢一次内容。**少拦的代价大得多，但也不能多拦。**

所以现在的判断是逐字段比较当前值和基线值。慢一点（几个字符串比较），但准确。

顺带一个相关的判断：**基线值什么时候更新？** 每次保存成功后更新，而不是每次加载时更新。因为如果保存成功后用户又改了一版，然后又保存——第二次保存失败，那么基线应该是"上次成功保存的内容"，而不是"第一次保存的内容"。

`allowLeave` 这个标志位的逻辑也是这样：**它在内容变化时必须被清掉。** 如果用户在保存成功后立刻改了点什么然后尝试退出，`allowLeave` 如果还在，就放他走了——**而这次修改没保存。**

现在它在 controller 的监听回调里被重置。这个位置不好找，是我在 review 的时候被提醒的：**"这个标志在哪清？"** 答案是"在任何非程序化的内容变化时"。

## 小结

编辑器这一页的技术点不多，但它们都在"状态生命周期"这一个主题上：

1. **切换模式不重建状态** —— Controller 常驻，只切换渲染哪棵子树。
2. **忙碌期锁输入** —— 否则请求期间的操作会导致"保存的版本和看到的版本不一致"。
3. **离开保护用差异判断，不用意图判断** —— 因为拦截提示一旦被无视就等于没有。
4. **失败提示要告诉用户"什么都没丢"** —— "正文已保留"四个字比一个错误图标有用得多。

第二条（忙碌期锁输入）是我认为最重要的一条，因为它防的不是崩溃，而是一种**静默的数据丢失**：用户继续打字 → 保存成功 → 界面显示已保存 → 那些字其实没保存。

这和 M4-19 的 `draftWrite` 串行链是同一个问题的两面：**在编辑器里，任何"用户以为保存了但其实没有"的情况，比任何报错都严重。**

下一篇讲图片上传——它是编辑器里最容易出问题的部分，涉及原生文件选择、大小校验、进度回调和失败恢复。

## 延伸阅读

- [投稿状态机：草稿、待审核与已发布]({{LINK:M4-19}})
- [Markdown 编辑器：预览、暗色主题与连续图片粘贴](https://blog.csdn.net/fungleo/article/details/166107729)
- [表单页范式：校验、数据回填与未保存保护](https://blog.csdn.net/fungleo/article/details/165986069)

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
3. `M4-20-离开保护`：16:9 中文流程图，编辑器离开保护的拦截与放行判定，标出上传失败时正文必须保留，深蓝底亮蓝。

### 发布前核对

- [ ] 替换 3 处配图占位符
- [ ] M4-19、M4-22、M2-10 发布后回填站内链接
- [ ] 编辑组件职责与当前 editor.dart 核对
- [ ] 已删除本辅助区
