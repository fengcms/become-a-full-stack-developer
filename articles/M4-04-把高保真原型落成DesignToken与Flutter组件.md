# 成为全栈·Flutter App 篇·把高保真原型落成 Design Token 与 Flutter 组件

我拿到高保真原型时，页面看起来已经很完整；真正开始实现后，颜色、间距、字体和按钮状态却很快分叉。逐页复制像素会让第一屏接近，之后每次调整都越来越难。

这篇从项目已有原型和主题令牌出发，展示如何把视觉决策变成可复用语义，再通过组件和多状态验收收敛差异。读者需要熟悉 Flutter ThemeData 与基础布局。

{{IMG:M4-04-封面}}

## 从截图找规则，而不是逐页抄像素

如果每个页面分别写 `Color(0xff...)`、`EdgeInsets.all(16)`，首屏或许很像原型，第二十个页面却会出现一串近似蓝色、相近圆角和不一致的按钮高度。令牌把视觉决策命名：品牌色、文本层级、间距、圆角、页面背景、卡片表面和分隔线。

```dart
abstract final class AppSpace {
  static const page = 20.0;
  static const section = 24.0;
  static const item = 12.0;
}
```

项目实际令牌集中在 `app/theme/design_tokens.dart` 与 `app_colors.dart`，上面代码示意命名方式；编写文章前应以文件当前常量为准，不把示例值误称为代码实值。

{{IMG:M4-04-令牌}}

## ThemeExtension 管可扩展的产品语义

Flutter `ThemeData` 已有基础色彩和文字样式，但产品通常还需要骨架色、正文表面、品牌浅底和状态色等语义。项目将这些值放入主题扩展，并分别构造 Light、Dark 配色。深色模式不是对浅色截图做反色：输入框、代码块、表格、评论回复和空态都要有明确表面与对比度。

```dart
final theme = ThemeData(
  colorScheme: colorScheme,
  extensions: <ThemeExtension<dynamic>>[
    AppColors.light,
  ],
);
```

从上下文取主题语义，让 Widget 不知道“这个颜色的十六进制是什么”。主题切换改变视觉而不应清空文章数据或正在编辑的草稿。

## 组件提取看复用和所有权

项目的共享组件包括 `PageFrame`、`AsyncPane`、`StateMessage`、`SubmitButton` 和文章列表组件。它们复用的是明确稳定的结构：页面边距、加载/空/错状态、按钮禁用与提交中反馈。只在一个页面出现、且和页面状态紧密相连的组件，则可作为页面私有组件拆到 `part` 文件，不必为了“组件化”对外公开。

```text
跨页面稳定视觉/行为 → shared/widgets
单页面展示细节 → 页面私有组件
主题语义 → ThemeExtension / token
```

组件边界由复用和状态所有权决定，不是文件行数超过某个数字就必须抽象。过度抽象会让原型一个 2dp 边框的调整穿过许多间接层。

## 还原要覆盖状态，不只看正常态

原型为页面提供正常、加载、空、错误、登录态与主题状态。验收至少要比较典型设备宽度下的首页、列表、正文、表单，以及浅色/深色。颜色肉眼接近还不够：标题换行会移动整张卡片，字体放大后不能裁掉关键操作，触控目标也要足够大。

本项目记录了 320–430dp 的大字体布局检查，Android Pixel 8 模拟器有实际界面验收；这不是所有厂商设备和辅助技术都通过的证明。发布前仍需真机检查系统选择器、读屏和相机/相册权限。

## 视觉验收可以记录差异而非凭记忆调参

给每个重点页面固定设备尺寸、系统字体倍率和主题，保存原型与 Flutter 截图。比较时先处理结构差异：容器宽度、首屏焦点高度、文本换行、滚动起点；然后才微调颜色和阴影。把所有偏差记录为令牌问题、组件问题或内容差异，可以避免一处补丁破坏别的页面。

原型里的假图片和数字需由真实接口数据替代，比较时要区分“布局偏差”和“真实内容不同”。项目明确没有把演示统计带进线上页面，这种内容真实性也属于还原验收。

## Token 命名描述用途，不描述页面位置

`brand`、`textSecondary`、`surfaceElevated` 比 `homeBlue`、`detailGray` 更适合共享，因为多个页面可能使用同一种语义，页面也可能改版。组件依赖语义 token 后，切换主题只替换语义映射；若颜色名字包含页面位置，复用时就会产生新的近似 token。

```dart
final colors = Theme.of(context).extension<AppColors>()!;
Container(color: colors.surfaceElevated);
```

示例展示语义读取方式；实际项目通过 `context.colors` 扩展访问。生产代码需避免在构建路径中用 `!` 绕过 ThemeExtension 配置遗漏；主题构建入口应保证 light/dark 都装配扩展，测试可断言两个主题的语义字段完整。

## 组件设计考虑状态组合

按钮不是一个颜色和圆角，而是默认、按下、禁用、提交中状态；卡片也需覆盖图片缺失、摘要很长和深色主题。把状态在共享组件里统一呈现，页面只传动作和数据，能减少视觉漂移，但不应抽象各页面仅有一次的特殊交互。


## 贴着工程代码读实现

下面这段节选自 `flutter-app/lib/app/theme/design_tokens.dart 第 1–69 行`（保留原始实现；为突出主线省略了文件其余部分）。读代码时可以顺着调用链确认：切换 Brightness 后逐个检查语义色、间距和字号的调用来源。沿着调用链读下去，才能看清这个选择如何影响实际页面。

```dart
import 'package:flutter/material.dart';

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

  /// 页面左右边距
  static const double page = s4;

  /// 触控目标下限（docs/flutter-app/02 §1 硬要求）
  static const double minTapTarget = 44;
}

abstract final class AppRadius {
  static const double xs = 4; // 徽章、标签、小缩略图
  static const double sm = 6; // 输入框、次级按钮
  static const double md = 8; // 卡片、图片、按钮（默认）
  static const double lg = 12; // 底部面板、抽屉顶部
  static const double full = 999; // 头像、胶囊标签

  static const BorderRadius rXs = BorderRadius.all(Radius.circular(xs));
  static const BorderRadius rSm = BorderRadius.all(Radius.circular(sm));
  static const BorderRadius rMd = BorderRadius.all(Radius.circular(md));
  static const BorderRadius rLg = BorderRadius.all(Radius.circular(lg));
  static const BorderRadius rFull = BorderRadius.all(Radius.circular(full));
}

abstract final class AppDuration {
  static const Duration fast = Duration(milliseconds: 120); // 按下态
  static const Duration base = Duration(milliseconds: 200); // 淡入、展开
  static const Duration page = Duration(milliseconds: 250); // 页面转场
  static const Curve curve = Curves.easeOutCubic;
}

// ---------------------------------------------------------------------------
// 布局与系统字体缩放
// ---------------------------------------------------------------------------

/// 06 §3：字号单位是 sp，Flutter 侧的缩放由 `MediaQuery.textScaler` 承担。
/// 放大到 1.3 倍时正文（`AppType.reading`）不得横向溢出——
/// 这里夹紧上限，配合文本组件的 `maxLines` / `TextOverflow.ellipsis` 兜底；
/// 正文若被截断，应改为整体放大字号而非省略号截断。
abstract final class AppLayout {
  /// 允许的最大系统文本缩放倍数（06 §3 验收值）。
  static const double maxTextScale = 1.3;

  /// 挂在 `MaterialApp.builder` 上：
  /// `MaterialApp(builder: AppLayout.clampTextScale, ...)`
  static Widget clampTextScale(BuildContext context, Widget? child) =>
      MediaQuery.withClampedTextScaling(
        maxScaleFactor: maxTextScale,
        child: child ?? const SizedBox.shrink(),
      );

  /// 需要按缩放自适应间距时使用（缩放越大，留白同步放宽）。
  static double scaledSpace(BuildContext context, double space) {
    final s = MediaQuery.textScalerOf(context)
        .scale(1.0)
        .clamp(1.0, maxTextScale);
    return space * s;
  }
}
```

## 把容易出错的路径走一遍

我会用这个场景做一次可复现排查：**同一语义颜色在页面里各写一个导致深色主题漂移**。先切换 Brightness 后逐个检查语义色、间距和字号的调用来源；如果把问题定位在“散落魔法数”，修正方向是“由语义 token 和 ThemeExtension 集中定义，再做对比度验证”。最后再验证正常路径没有退化，并把边界条件留在自动化检查里。

| 方案比较 | 简化做法 | 当前实现/推荐做法 |
|---|---|---|
| 本文核心选择 | 散落魔法数 | 语义令牌 |
| 错误处理 | 失败后清空或静默忽略 | 保留可恢复状态，给出明确反馈 |
| 验证方式 | 只检查成功结果 | 注入边界条件并检查回归 |

| 排错步骤 | 要观察什么 | 通过条件 |
|---|---|---|
| 复现 | 同一语义颜色在页面里各写一个导致深色主题漂移 | 可以稳定触发或明确构造该输入 |
| 定位 | 切换 Brightness 后逐个检查语义色、间距和字号的调用来源 | 找到责任层和状态归属 |
| 修正 | 由语义 token 和 ThemeExtension 集中定义，再做对比度验证 | 失败不污染后续页面或账号 |

## 小结

视觉还原的稳定路径是：原型确认规则，令牌固化语义，主题装配明暗模式，共享组件承载重复交互，页面私有组件保留局部所有权，最后用多状态截图和设备尺寸验证。组件越多并不自动越一致；一致性来自单一事实源和覆盖真实状态的验收。

## 延伸阅读

- [Flutter 工程骨架与 OpenAPI 代码生成]({{LINK:M4-03}})
- [主题与可访问性：深浅色、大字号和触控体验]({{LINK:M4-25}})
- [响应式、可访问性与错误状态](https://blog.csdn.net/fungleo/article/details/167172856)

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
