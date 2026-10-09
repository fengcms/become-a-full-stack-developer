# 成为全栈·Flutter App 篇·把高保真原型落成 Design Token 与 Flutter 组件

这一篇是从"设计"跨到"实现"的桥梁，也是这个项目里**返工最多的一批**。

原因不是原型做得不好——原型是做得很好的。返工的原因是：**原型里的每一个视觉决策，在代码里都需要一个"对应物"，而这个对应物不是我凭空想的。**

举个具体的。原型上那张焦点卡片右上角有个淡淡的 `{ API }` 水印，实现的时候我发现：它不是"一段文字加一点灰色"，它依赖三件事——渐变背景（水印要在它上面才看得见）、`withValues(alpha: .08)` 的透明度、以及**当前是深色还是浅色**。

少任何一件，那个水印就不对。而在深色模式下，`.08` 的黑色水印会完全看不见。

这篇讲怎么把原型翻译成代码，以及为什么这件事的难点**不在实现，在约束的传递**。

![成为全栈·Flutter App 篇·把高保真原型落成 Design Token 与 Flutter 组件](https://i-blog.csdnimg.cn/direct/fe9da5ea69ae44fd9bd4019056647efa.png)

## 从间距开始：先定住最不可能出错的

翻译原型的第一步不是画界面，是**把那些"到处都会用到"的量定下来**。

```dart
/// 4 基准间距刻度。移动端页面左右边距统一 [s4]（16dp）。
abstract final class AppSpacing {
  static const double s1 = 4;
  static const double s2 = 8;
  static const double s3 = 12;
  static const double s4 = 16;
  static const double s5 = 20;
  static const double s6 = 24;
  static const double s8 = 32;
  static const double s10 = 40;
  static const double page = s4;
  /// 触控目标下限（docs/flutter-app/02 §1 硬要求）
  static const double minTapTarget = 44;
}
```

**只有八个值。** 而原型里那些"看起来差不多"的间距，现在必须归到这八个里的某一个。

这个"归类"的过程本身就是有价值的——**它会暴露原型里的不一致**。比如原型里同一个层级的标题，上面间距 24 下面 12，而另一个地方是上面 20 下面 12——**归类时必须决定统一成哪个**，而这个决定会暴露"原来它们不一样"。

**令牌的作用不只是省事，更是强制做决定。**

而 `minTapTarget = 44` 那个注释很关键——它标注了出处（设计规范 §1）。**凡是有硬性要求的令牌，都要写清楚它的来源**，这样将来有人想改的时候，会知道自己改的不只是一个数字。

圆角、动效同理：

```dart
abstract final class AppRadius {
  static const double xs = 4; // 徽章、标签、小缩略图
  static const double sm = 6; // 输入框、次级按钮
  static const double md = 8; // 卡片、图片、按钮（默认）
  static const double lg = 12; // 底部面板、抽屉顶部
  static const double full = 999; // 头像、胶囊标签
}
```

**每个值后面都写了"用在哪"。** 这不是注释洁癖——半年后有人想用 `md` 做输入框，他能在这一行看出"输入框应该是 `sm`"。

## 颜色：语义名，不是色值

颜色的翻译比间距难，因为**颜色在深浅色下要变成另一个颜色**，而这在原型上通常只画了一遍。

现在的做法是自定义一套语义：

```dart
class AppColors extends ThemeExtension<AppColors> {
  static const AppColors light = AppPalettes.light;
  static const AppColors dark = AppPalettes.dark;
  ...
  @override
  AppColors lerp(ThemeExtension<AppColors>? other, double t) { ... }
}
```

而组件里这样用：

```dart
Text(
  'API',
  style: TextStyle(
    color: context.colors.textTitle.withValues(alpha: .08),
  ),
)
```

**注意这里没有出现任何具体的色值。** 它写的是"标题色 + 8% 透明度"，而不是"灰色 8% 不透明度"。

这个差别的意义在深色模式下才显现：

| 如果写 | 深色下 |
|---|---|
| `Colors.grey.withOpacity(0.08)` | 固定灰，永远不变 |
| `context.colors.textTitle.withValues(alpha: .08)` | 跟随主题，深色下是浅色的 8% |

**这就是为什么不能让业务代码碰颜色**——不是因为"不优雅"，是因为**一旦碰到，深浅色就一定会漏。**

而 `withValues(alpha:)` 而不是 `withOpacity()` 也有讲究：Flutter 新版本推荐前者，因为它在透明度无效值（比如大于 1）时行为更明确。

## 渐变：ThemeExtension 的一个限制

那个水印依赖卡片背景的渐变：

```dart
child: Ink(
  decoration: BoxDecoration(
    gradient: context.colors.heroWash,
    borderRadius: AppRadius.rMd,
  ),
```

`heroWash` 在 `AppColors` 里，但它**不是 `Color` 类型**——`ThemeExtension` 不能直接持有渐变对象，因为框架要求扩展类型可以比较相等、可以实现 `lerp`，而渐变的相等语义不明确。

现在的解法是 `AppColors` 里存两个端点色，需要渐变的地方现算：

```dart
// 焦点区渐变（06 §2.1 `color.bg.wash`）
LinearGradient(
  colors: [context.colors.bgWash, context.colors.surface],
)
```

**代价是：渐变的构造散落在各个组件里。** 而散落意味着**改渐变定义时要改很多处**。

另一个选择是单独做一个 `AppGradients extends ThemeExtension<AppGradients>`，把渐变集中管理。**这个我最终没做**——理由是渐变只用在三四个地方，散落的成本还能接受，而多一个扩展类的复杂度更高。

**这是一个我知道有争议的取舍。** 如果后面渐变用到十几处，就应该收回来。

![把令牌接到 Flutter 的主题系统](https://i-blog.csdnimg.cn/direct/b974b45790344d5fb9321f0d71706d44.png)

## ThemeBuilder：把令牌接到 Flutter 的主题系统

令牌定义完了，但 Flutter 的组件（`Card`、`ListTile`、`FilledButton`）读的是 `ThemeData` 里的配置，不是我们的令牌。

所以需要一个"翻译层"：

```dart
ThemeData buildAppTheme(Brightness brightness) {
  final c = brightness == Brightness.light ? AppColors.light : AppColors.dark;
  final base = brightness == Brightness.dark
      ? ThemeData.dark(useMaterial3: true)
      : ThemeData.light(useMaterial3: true);
  return base.copyWith(
    extensions: <ThemeExtension<dynamic>>[c],
    iconTheme: IconThemeData(color: c.textBody, size: 20),
    dividerTheme: DividerThemeData(color: c.line, thickness: 1, space: 1),
    ...
  );
}
```

而这个文件有三百多行，因为 Material 的组件主题非常多：

```
_colorScheme   _cardTheme   _bottomNavigationBarTheme
_bottomSheetTheme   _chipTheme   _listTileTheme   _filledButtonTheme
```

**每一个都是"把这个 Material 组件的默认外观换成我们令牌里的值"。**

这层的必要性在于：**如果不管它，`Card` 组件会用 Material 默认的圆角（4dp）和阴影**，而原型上要的是 `AppRadius.md`（8dp）且无阴影。

而 `_cardTheme(bool isDark, AppColors c)` 这个签名里的 `isDark` 参数值得注意——**有些样式在深浅色下是不同的**，不只是颜色值不同（比如阴影的强度、卡片的表面色）。所以那些地方需要分支。

**"只是颜色不同"和"样式结构就不同"，是这一层最需要小心的区别。** 前者靠 `AppColors` 的两套调色板解决，后者得在 ThemeBuilder 里显式判断。

## 组件怎么从原型里拆出来

原型上那个焦点卡片，实现时是这样：

```dart
/// 焦点卡片保持原型渐变、标题截断与文章入口。
class _StoryCard extends StatelessWidget {
  const _StoryCard({required this.a});
  final Article a;
  @override
  Widget build(BuildContext context) => Padding(
    padding: AppInsets.pageTop,
    child: Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => context.push('/articles/${a.route}'),
        borderRadius: AppRadius.rMd,
        child: Ink(
          decoration: BoxDecoration(
            gradient: context.colors.heroWash,
            borderRadius: AppRadius.rMd,
          ),
```

**三层嵌套不是代码风格问题，是功能要求。**

`Material` + `InkWell` + `Ink` 这三件套是 Flutter 实现"带背景的点击区域 + 水波纹动画"的标准结构：

- `Material` 提供水波纹绘制的表面
- `InkWell` 提供点击区域和手势
- `Ink` 提供实际的背景绘制（渐变、边框）

少任何一个，水波纹就不生效或者背景画不出来。

而 `color: Colors.transparent` 是必需的——因为默认的 `Material` 会画一个默认背景色，和我们的 `Ink` 渐变叠在一起。

**`onTap: () => context.push('/articles/${a.route}')` 这一行接上了 M4-14 讲的 `route`**（有 slug 用 slug，没有用 id）。

而注释说的"标题截断"，在下面几行的 `Text` 里：

```dart
Text(
  ...,
  maxLines: 2,
  overflow: TextOverflow.ellipsis,
)
```

**"截断"是原型上的一个明确要求**（"标题最多两行"），而实现时容易漏——因为在测试数据下标题都很短。

这条经验：**原型上所有"最多几行""最小多大"的限制，都要在实现时显式写出来**，哪怕测试数据看不出差别。因为真实数据的标题会长得多。

## 从原型到代码，最容易丢的三样东西

翻译过程中我总结出三类最容易丢失的：

| 丢失的 | 原型上 | 代码里 | 怎么发现 |
|---|---|---|---|
| **状态** | 加载中/空/错误/有内容 | 只画了"有内容" | 连点两次会看到 |
| **极端数据** | 长标题、空头像 | 用正常数据测 | 换成真实数据 |
| **交互反馈** | 按下变色、水波纹 | 静态按钮 | 真机点一下 |

第一类最严重。原型通常只画"理想状态"，而代码必须处理所有状态。M4-10 讲的 `AsyncPane` 那段 `build` 就是在补原型上没有的三层：

```dart
if (value == null) {
  return error != null
      ? StateMessage(error: error, onRetry: () => load(force: true))
      : const ArticleSkeleton(count: 2);
}
```

**骨架屏是原型上通常不画的东西**——因为画出来不好看，设计稿往往只给内容态。

但它是必须的，否则用户等待时看到的是空白屏幕，而空白屏幕会被理解成"App 卡了"。

第二类的例子是**图片加载失败**。原型上永远是那张图，而真实环境会有 404、会有网络问题。

第三类最隐蔽：**按下态的视觉反馈**在原型上通常是一个标注，而实现时容易用默认的水波纹代替——而默认水波纹的颜色可能和我们的主题不搭。

## 零色值这条纪律怎么守住

M4-25 讲过"代码里不允许写色值"，这里说怎么在实际工作中守住。

**靠自觉肯定守不住**，所以有两个机制。

**一、代码评审时检查。** 但人工检查不可靠——因为 `Color(0xFF...)` 在几十行里可能只出现一次，而人的注意力会集中在"逻辑对不对"上。

**二、脚本扫描。** 这才是有效的：

```python
# 检查逻辑（示意）
if re.search(r'Color\(0x[0-9A-Fa-f]+\)', dart_source):
    print('发现硬编码色值')
```

**而且要扫得更宽**：不只是 `Color(0x...)`，还有 `Colors.red` 这类命名颜色（Material 的静态调色板）。

而脚本的价值在于**它不会有注意力问题**——它每次都扫全文。

**但脚本只能抓"存在"，抓不到"用对了"。** 比如有人写 `context.colors.textTitle`（存在）但用在了一个应该用 `textBody` 的地方（用错了），脚本抓不到。

**这类语义正确性只能靠 review，而 review 的时候需要知道"哪些选择是有意的"**——所以设计规范文档里要写清楚每个语义色的用途。

顺带说一个我踩过的坑：**M4-25 提到有个 `color.info` 令牌悬空**——设计规范里写了它，但 `AppColors` 里没有实现。这导致实现时有人找不到对应的语义色，就用了最接近的那个（`textMuted`），**结果"提示信息"的颜色变成了普通灰**。

**令牌定义和实现必须一一对应**，而这条也只能靠检查发现——只不过检查的是"规范里有的，代码里有没有"。

## 一条我一开始想省掉的事

那个水印，我第一版写的是固定颜色：

```dart
// 第一版
color: Colors.black.withValues(alpha: .08),
```

在浅色模式下完全正常。**切到深色模式它就消失了**——因为深色背景上画深色水印，等于没有。

我是在深色模式下对比原型才发现的。而这个 bug 的恶劣之处在于：**它不是"少了一个效果"，而是"效果在深色下反着来"**——如果你没看原型，可能根本不会觉得少了什么。

改成 `context.colors.textTitle.withValues(alpha: .08)` 之后，两个模式都对。

**这个 bug 让我明白了一件事：一个视觉元素在两种主题下的表现，是两个独立的实现，不是"同一个实现的两种配色"。**

而如果当初把它写成固定颜色，它就只有一个实现——**而那个实现在一个主题下是对的**。

顺带说，这个教训和 M4-24 讲的那个"图片请求带鉴权头"是同一类：**一个在开发环境（只有一个配置）下完全正确的东西，在多配置场景下会出错。** 开发的时候只有浅色模式、只有一个 API 环境，所以这些 bug 完全不会暴露。

## 小结

这一篇讲的其实不是组件怎么写，是**约束怎么传递**：

1. **先定令牌，再写组件** —— 而且令牌要覆盖"到处都会用到"的量。
2. **语义名代替色值** —— 因为深浅色下"什么是对的颜色"会变。
3. **ThemeBuilder 是翻译层** —— 它把令牌接到 Material 组件的默认外观上。
4. **原型的状态、极端数据、交互反馈最容易丢** —— 三类都要显式补。
5. **纪律靠脚本，不靠自觉** —— 人不会有意识地每次都找色值。

第 4 条我觉得最重要。**原型是静态的，而代码必须处理所有状态**——这个差距不是靠"更仔细地看原型"能补上的，因为原型上根本没有那些状态。

而第 5 条是这一篇的方法论核心：**凡是能用机器检查的纪律，就不要交给人。** 这和 M4-25 讲的那个"触控目标 ≥ 44"是同一个思路。

**而"在单一配置下正确的东西"这个类别，是我做这一批最大的收获**——它解释了为什么很多 bug 偏偏在生产环境出现：开发时只有一个环境、一个主题，而生产有两个。

下一篇讲 Riverpod 的状态边界——那是这个 App 里状态类型最多的一层。

## 延伸阅读

- [Riverpod 状态边界：会话、服务端数据和表单草稿]({{LINK:M4-06}})
- [主题与可访问性：深浅色、大字号和触控体验]({{LINK:M4-25}})
- [用真实 API 构建首页：焦点、最新与热门内容]({{LINK:M4-10}})
- [写后缓存失效与图片缓存治理]({{LINK:M4-24}})

---

如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->

## 发布辅助信息

### 文章 Tag（6 个）

`Flutter`、`Design Token`、`UI设计`、`主题适配`、`移动开发`、`全栈开发`

### 文章简介（250 字以内）

从高保真原型到 Flutter 页面，关键不是逐页抄颜色和间距，而是提取可复用的设计令牌、明暗主题语义和稳定组件边界。本文结合项目实际目录说明哪些组件应共享、哪些应留在页面内部，并讨论多状态、多尺寸截图验收的价值与限制。

### 建议发布分类

全栈开发 / Flutter

### 封面短标题

原型规则如何进入代码

### 配图 AI 提示词

1. `M4-04-封面`：16:9 中文设计工程封面，手机高保真原型被拆解为颜色/间距/字体 token，再组合成 Flutter 组件和浅色深色主题，蓝白和青绿配色，标题“原型规则如何进入代码”。
2. `M4-04-令牌`：16:9 清晰架构图，Design Token → ThemeExtension → shared widgets → page widgets，附明暗模式和 loading/empty/error 状态例子，中文字形准确。

### 发布前核对

- [ ] 替换 2 处配图占位符
- [ ] M4-03、M4-25、M3-20 发布后回填站内链接
- [ ] 将示例 token 数值与当前源码核对
- [ ] 已删除本辅助区
