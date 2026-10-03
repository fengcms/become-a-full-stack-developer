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

// ---------------------------------------------------------------------------
// 字体层级
// ---------------------------------------------------------------------------

/// 字号单位 sp，随系统字体缩放；标题字重上限 w700，正文只用 w400/w500。
abstract final class AppType {
  static const double display = 24; // 焦点标题、空态主标题（≥600dp 可升至 28）
  static const double h1 = 24; // 页面主标题、文章详情标题
  static const double h2 = 20; // 区块标题
  static const double h3 = 17; // 列表项标题、卡片标题
  static const double reading = 17; // 文章正文（唯一）
  static const double body = 15; // 常规正文、表单值
  static const double label = 14; // 按钮文字、Tab 文字
  static const double caption = 13; // 摘要、说明
  static const double micro = 11; // 时间、计数、徽章

  static const double navigation = 10; // 已确认原型中的细分字号
  static const double metadata = 11.5; // 已确认原型中的细分字号
  static const double smallLabel = 12; // 已确认原型中的细分字号
  static const double listSummary = 12.5; // 已确认原型中的细分字号
  static const double adjacentTitle = 13.5; // 已确认原型中的细分字号
  static const double menuTitle = 14.5; // 已确认原型中的细分字号
  static const double listTitle = 16; // 已确认原型中的细分字号
  static const double statistic = 18; // 已确认原型中的细分字号
  static const double avatarLetter = 22; // 已确认原型中的细分字号
  static const double heroTitle = 30; // 已确认原型中的细分字号
  static const double heroWatermark = 46; // 已确认原型中的细分字号
  static const double largeWatermark = 96; // 已确认原型中的细分字号
  static const double draftTitle = 15.5;
  static const double lhDisplay = 1.35;
  static const double lhHeading = 1.45;
  static const double lhBody = 1.7;
  static const double lhReading = 1.85;
}

/// 中文字体族：只用系统字体，不请求外部字体、不打包中文字体文件。
const List<String> kFontFallback = <String>[
  'PingFang SC',
  'Noto Sans SC',
  'Microsoft YaHei',
];
