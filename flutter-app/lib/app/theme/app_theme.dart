import '../../shared/prototype_icons.dart';
// ============================================================================
// app_theme.dart · Flutter APP 设计令牌
//
// 与 docs/flutter-app/06-UI设计规范与设计令牌.md 一一对应。
// 浅色继承网站已确认的 A 方案（纯白／晴蓝）；深色为 APP 新增独立设计（非颜色反转）。
// 所有文字/背景对比度已实算达标（正文 ≥4.5:1）。
//
// 落地位置：M4 工程创建后放到 lib/app/theme/app_theme.dart
// 用法：
//   MaterialApp(
//     theme: buildAppTheme(Brightness.light),
//     darkTheme: buildAppTheme(Brightness.dark),
//     themeMode: themeMode,          // 跟随系统 / 浅色 / 深色，持久化到本地
//     builder: AppLayout.clampTextScale,   // 夹紧系统字体缩放（06 §3）
//   )
//   // 业务里取色：
//   final c = Theme.of(context).extension<AppColors>()!;
//   Container(color: c.brandSubtle)
// ============================================================================

import 'package:flutter/material.dart';

// ---------------------------------------------------------------------------
// 颜色令牌
// ---------------------------------------------------------------------------

@immutable
class AppColors extends ThemeExtension<AppColors> {
  const AppColors({
    required this.bgBase,
    required this.bgSubtle,
    required this.surface,
    required this.surfaceSunken,
    required this.surfaceElevated,
    required this.heroWashFrom,
    required this.heroWashTo,
    required this.line,
    required this.lineStrong,
    required this.lineButton,
    required this.fieldBorder,
    required this.textTitle,
    required this.textBody,
    required this.textMuted,
    required this.textPlaceholder,
    required this.textInverse,
    required this.brand,
    required this.brandHover,
    required this.brandSolid,
    required this.brandSubtle,
    required this.brandOnSubtle,
    required this.focusRing,
    required this.scrim,
    required this.success,
    required this.successBg,
    required this.warning,
    required this.warningBg,
    required this.danger,
    required this.dangerBg,
    required this.statusPublished,
    required this.statusPublishedBg,
    required this.statusPending,
    required this.statusPendingBg,
    required this.statusDraft,
    required this.statusDraftBg,
    required this.statusRejected,
    required this.statusRejectedBg,
    required this.skeleton,
    required this.codeBg,
    required this.codeFg,
  });

  // 背景与容器
  final Color bgBase; // 页面底、卡片底、Header
  final Color bgSubtle; // 搜索框、轻量分区、Footer
  final Color surface; // 卡片、弹层、抽屉
  final Color surfaceSunken; // 代码块、引用块、表头
  final Color surfaceElevated; // 抽屉、浮层、输入框
  // 焦点区渐变（06 §2.1 `color.bg.wash`）。ThemeExtension 不能直接持有
  // LinearGradient，故拆成两色，组件用 `heroWash` getter 取渐变。
  final Color heroWashFrom;
  final Color heroWashTo;

  // 描边
  final Color line; // 列表与模块分割线
  final Color lineStrong; // 需要更明确边界的容器
  // 次级按钮边界。06 §2.1 已立此令牌（#C7DBEA）；06 §2.4 未列深色取值，
  // 此处沿用深色 lineStrong 的值，待产品 AI 确认是否要在 §2.4 单列。
  final Color lineButton;
  final Color fieldBorder; // 输入框静止边界（非文本图形，门槛 3:1）

  // 文字
  final Color textTitle; // 标题（禁止纯黑）
  final Color textBody; // 正文
  final Color textMuted; // 日期、摘要、辅助
  final Color textPlaceholder; // 占位文字
  final Color textInverse; // 实色按钮上的文字

  // 品牌
  final Color brand; // 链接、选中态
  final Color brandHover; // 悬停/按下反馈
  final Color brandSolid; // 主按钮实底
  final Color brandSubtle; // 当前项底、轻提示底
  final Color brandOnSubtle; // 浅蓝底上的文字（必须用这个，brand 在浅蓝底上只有 4.29:1）
  final Color focusRing; // 焦点环
  final Color scrim; // 弹层遮罩

  // 语义
  final Color success;
  final Color successBg;
  final Color warning;
  final Color warningBg;
  final Color danger;
  final Color dangerBg;

  // 业务状态（对齐契约枚举）
  final Color statusPublished; // Article.status = published
  final Color statusPublishedBg;
  final Color statusPending; // pending article status; comments expose only immediate POST results
  final Color statusPendingBg;
  final Color statusDraft; // draft
  final Color statusDraftBg;
  final Color statusRejected; // Comment.status = rejected
  final Color statusRejectedBg;

  // 其他
  final Color skeleton;
  final Color codeBg;
  final Color codeFg;

  static const AppColors light = AppColors(
    bgBase: Color(0xFFFFFFFF),
    bgSubtle: Color(0xFFF7FAFD),
    surface: Color(0xFFFFFFFF),
    surfaceSunken: Color(0xFFF5F9FC),
    surfaceElevated: Color(0xFFFFFFFF),
    heroWashFrom: Color(0xFFF0F7FE),
    heroWashTo: Color(0xFFE4F0FB),
    line: Color(0xFFE9EFF5),
    lineStrong: Color(0xFFD5E2ED),
    lineButton: Color(0xFFC7DBEA),
    fieldBorder: Color(0xFF8397AB),
    textTitle: Color(0xFF2F4256),
    textBody: Color(0xFF34465A),
    textMuted: Color(0xFF607286),
    textPlaceholder: Color(0xFF8A99A8),
    textInverse: Color(0xFFFFFFFF),
    brand: Color(0xFF3277B5),
    brandHover: Color(0xFF245D91),
    brandSolid: Color(0xFF3277B5),
    brandSubtle: Color(0xFFEDF5FC),
    brandOnSubtle: Color(0xFF2A6AA3),
    focusRing: Color(0xFF3277B5),
    scrim: Color(0x73121820),
    success: Color(0xFF276954),
    successBg: Color(0xFFEDF7F2),
    warning: Color(0xFF7A6122),
    warningBg: Color(0xFFFAF5E9),
    danger: Color(0xFF9E3D3D),
    dangerBg: Color(0xFFFCF1F1),
    statusPublished: Color(0xFF3277B5),
    statusPublishedBg: Color(0xFFEDF5FC),
    statusPending: Color(0xFF7A6122),
    statusPendingBg: Color(0xFFFAF5E9),
    statusDraft: Color(0xFF5C6C80),
    statusDraftBg: Color(0xFFF0F3F6),
    statusRejected: Color(0xFF9E3D3D),
    statusRejectedBg: Color(0xFFFCF1F1),
    skeleton: Color(0xFFEDF3F8),
    codeBg: Color(0xFFF7FAFD),
    codeFg: Color(0xFF3E627F),
  );

  static const AppColors dark = AppColors(
    bgBase: Color(0xFF121820),
    bgSubtle: Color(0xFF171E27),
    surface: Color(0xFF1A222C),
    surfaceSunken: Color(0xFF161C24),
    surfaceElevated: Color(0xFF212B36),
    heroWashFrom: Color(0xFF1B2733),
    heroWashTo: Color(0xFF16202A),
    line: Color(0xFF2E3A46),
    lineStrong: Color(0xFF3A4754),
    lineButton: Color(0xFF3A4754),
    fieldBorder: Color(0xFF4A5A69),
    textTitle: Color(0xFFE8EFF6),
    textBody: Color(0xFFC6D2DE),
    textMuted: Color(0xFF8FA0B2),
    textPlaceholder: Color(0xFF6E7E8F),
    textInverse: Color(0xFFFFFFFF),
    brand: Color(0xFF5EA0D8),
    brandHover: Color(0xFF7FB6E4),
    brandSolid: Color(0xFF37709F),
    brandSubtle: Color(0xFF1C2E3E),
    brandOnSubtle: Color(0xFF7FB6E4),
    focusRing: Color(0xFF5EA0D8),
    scrim: Color(0x99000000),
    success: Color(0xFF7FCBA8),
    successBg: Color(0xFF17281F),
    warning: Color(0xFFE0BC72),
    warningBg: Color(0xFF2E2718),
    danger: Color(0xFFEF9A9A),
    dangerBg: Color(0xFF2F1D1D),
    statusPublished: Color(0xFF7FB6E4),
    statusPublishedBg: Color(0xFF1C2E3E),
    statusPending: Color(0xFFE0BC72),
    statusPendingBg: Color(0xFF2E2718),
    statusDraft: Color(0xFF93A4B6),
    statusDraftBg: Color(0xFF232B34),
    statusRejected: Color(0xFFEF9A9A),
    statusRejectedBg: Color(0xFF2F1D1D),
    skeleton: Color(0xFF212B36),
    codeBg: Color(0xFF161C24),
    codeFg: Color(0xFF9CC4E4),
  );

  /// 焦点区渐变。CSS 侧写作 `linear-gradient(115deg, from, to)`，
  /// 115deg 的走向近似左上 → 右下，此处用对角对齐。
  LinearGradient get heroWash => LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: <Color>[heroWashFrom, heroWashTo],
  );

  /// 按契约枚举取文章状态色，避免各页面各写一套。
  Color statusColor(String status) => switch (status) {
    'published' => statusPublished,
    'pending' => statusPending,
    'draft' => statusDraft,
    'rejected' => statusRejected,
    _ => textMuted,
  };

  Color statusColorBg(String status) => switch (status) {
    'published' => statusPublishedBg,
    'pending' => statusPendingBg,
    'draft' => statusDraftBg,
    'rejected' => statusRejectedBg,
    _ => bgSubtle,
  };

  @override
  AppColors copyWith({
    Color? bgBase,
    Color? bgSubtle,
    Color? surface,
    Color? surfaceSunken,
    Color? surfaceElevated,
    Color? heroWashFrom,
    Color? heroWashTo,
    Color? line,
    Color? lineStrong,
    Color? lineButton,
    Color? fieldBorder,
    Color? textTitle,
    Color? textBody,
    Color? textMuted,
    Color? textPlaceholder,
    Color? textInverse,
    Color? brand,
    Color? brandHover,
    Color? brandSolid,
    Color? brandSubtle,
    Color? brandOnSubtle,
    Color? focusRing,
    Color? scrim,
    Color? success,
    Color? successBg,
    Color? warning,
    Color? warningBg,
    Color? danger,
    Color? dangerBg,
    Color? statusPublished,
    Color? statusPublishedBg,
    Color? statusPending,
    Color? statusPendingBg,
    Color? statusDraft,
    Color? statusDraftBg,
    Color? statusRejected,
    Color? statusRejectedBg,
    Color? skeleton,
    Color? codeBg,
    Color? codeFg,
  }) {
    return AppColors(
      bgBase: bgBase ?? this.bgBase,
      bgSubtle: bgSubtle ?? this.bgSubtle,
      surface: surface ?? this.surface,
      surfaceSunken: surfaceSunken ?? this.surfaceSunken,
      surfaceElevated: surfaceElevated ?? this.surfaceElevated,
      heroWashFrom: heroWashFrom ?? this.heroWashFrom,
      heroWashTo: heroWashTo ?? this.heroWashTo,
      line: line ?? this.line,
      lineStrong: lineStrong ?? this.lineStrong,
      lineButton: lineButton ?? this.lineButton,
      fieldBorder: fieldBorder ?? this.fieldBorder,
      textTitle: textTitle ?? this.textTitle,
      textBody: textBody ?? this.textBody,
      textMuted: textMuted ?? this.textMuted,
      textPlaceholder: textPlaceholder ?? this.textPlaceholder,
      textInverse: textInverse ?? this.textInverse,
      brand: brand ?? this.brand,
      brandHover: brandHover ?? this.brandHover,
      brandSolid: brandSolid ?? this.brandSolid,
      brandSubtle: brandSubtle ?? this.brandSubtle,
      brandOnSubtle: brandOnSubtle ?? this.brandOnSubtle,
      focusRing: focusRing ?? this.focusRing,
      scrim: scrim ?? this.scrim,
      success: success ?? this.success,
      successBg: successBg ?? this.successBg,
      warning: warning ?? this.warning,
      warningBg: warningBg ?? this.warningBg,
      danger: danger ?? this.danger,
      dangerBg: dangerBg ?? this.dangerBg,
      statusPublished: statusPublished ?? this.statusPublished,
      statusPublishedBg: statusPublishedBg ?? this.statusPublishedBg,
      statusPending: statusPending ?? this.statusPending,
      statusPendingBg: statusPendingBg ?? this.statusPendingBg,
      statusDraft: statusDraft ?? this.statusDraft,
      statusDraftBg: statusDraftBg ?? this.statusDraftBg,
      statusRejected: statusRejected ?? this.statusRejected,
      statusRejectedBg: statusRejectedBg ?? this.statusRejectedBg,
      skeleton: skeleton ?? this.skeleton,
      codeBg: codeBg ?? this.codeBg,
      codeFg: codeFg ?? this.codeFg,
    );
  }

  @override
  AppColors lerp(ThemeExtension<AppColors>? other, double t) {
    if (other is! AppColors) return this;
    Color mix(Color a, Color b) => Color.lerp(a, b, t)!;
    return AppColors(
      bgBase: mix(bgBase, other.bgBase),
      bgSubtle: mix(bgSubtle, other.bgSubtle),
      surface: mix(surface, other.surface),
      surfaceSunken: mix(surfaceSunken, other.surfaceSunken),
      surfaceElevated: mix(surfaceElevated, other.surfaceElevated),
      heroWashFrom: mix(heroWashFrom, other.heroWashFrom),
      heroWashTo: mix(heroWashTo, other.heroWashTo),
      line: mix(line, other.line),
      lineStrong: mix(lineStrong, other.lineStrong),
      lineButton: mix(lineButton, other.lineButton),
      fieldBorder: mix(fieldBorder, other.fieldBorder),
      textTitle: mix(textTitle, other.textTitle),
      textBody: mix(textBody, other.textBody),
      textMuted: mix(textMuted, other.textMuted),
      textPlaceholder: mix(textPlaceholder, other.textPlaceholder),
      textInverse: mix(textInverse, other.textInverse),
      brand: mix(brand, other.brand),
      brandHover: mix(brandHover, other.brandHover),
      brandSolid: mix(brandSolid, other.brandSolid),
      brandSubtle: mix(brandSubtle, other.brandSubtle),
      brandOnSubtle: mix(brandOnSubtle, other.brandOnSubtle),
      focusRing: mix(focusRing, other.focusRing),
      scrim: mix(scrim, other.scrim),
      success: mix(success, other.success),
      successBg: mix(successBg, other.successBg),
      warning: mix(warning, other.warning),
      warningBg: mix(warningBg, other.warningBg),
      danger: mix(danger, other.danger),
      dangerBg: mix(dangerBg, other.dangerBg),
      statusPublished: mix(statusPublished, other.statusPublished),
      statusPublishedBg: mix(statusPublishedBg, other.statusPublishedBg),
      statusPending: mix(statusPending, other.statusPending),
      statusPendingBg: mix(statusPendingBg, other.statusPendingBg),
      statusDraft: mix(statusDraft, other.statusDraft),
      statusDraftBg: mix(statusDraftBg, other.statusDraftBg),
      statusRejected: mix(statusRejected, other.statusRejected),
      statusRejectedBg: mix(statusRejectedBg, other.statusRejectedBg),
      skeleton: mix(skeleton, other.skeleton),
      codeBg: mix(codeBg, other.codeBg),
      codeFg: mix(codeFg, other.codeFg),
    );
  }
}

// ---------------------------------------------------------------------------
// 间距、圆角、尺寸
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 主题装配
// ---------------------------------------------------------------------------

ThemeData buildAppTheme(Brightness brightness) {
  final c = brightness == Brightness.dark ? AppColors.dark : AppColors.light;
  final isDark = brightness == Brightness.dark;

  final base = isDark
      ? ThemeData.dark(useMaterial3: true)
      : ThemeData.light(useMaterial3: true);

  TextStyle t(double size, double height, FontWeight w, Color color) =>
      TextStyle(
        fontSize: size,
        height: height,
        fontWeight: w,
        color: color,
        fontFamilyFallback: kFontFallback,
      );

  return base.copyWith(
    scaffoldBackgroundColor: c.bgBase,
    canvasColor: c.bgBase,
    extensions: <ThemeExtension<dynamic>>[c],

    colorScheme: base.colorScheme.copyWith(
      brightness: brightness,
      primary: c.brand,
      onPrimary: c.textInverse,
      surface: c.surface,
      onSurface: c.textBody,
      secondary: c.brand,
      onSecondary: c.textInverse,
      secondaryContainer: c.brandSubtle,
      onSecondaryContainer: c.brandOnSubtle,
      surfaceContainerHighest: c.surfaceElevated,
      surfaceTint: Colors.transparent,
      error: c.danger,
      outline: c.line,
    ),

    // 深色下阴影不可见，用描边表达层级（06 §4.3）
    cardTheme: CardThemeData(
      color: c.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: AppRadius.rMd,
        side: BorderSide(color: isDark ? c.lineStrong : c.line),
      ),
    ),

    appBarTheme: AppBarTheme(
      backgroundColor: c.surface,
      foregroundColor: c.textTitle,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      toolbarHeight: 52,
      titleTextStyle: t(15, 1.4, FontWeight.w600, c.textTitle),
      shape: Border(bottom: BorderSide(color: c.line)),
    ),

    bottomNavigationBarTheme: BottomNavigationBarThemeData(
      backgroundColor: c.surface,
      selectedItemColor: c.brand,
      unselectedItemColor: c.textMuted,
      selectedLabelStyle: t(11, 1.3, FontWeight.w600, c.brand),
      unselectedLabelStyle: t(11, 1.3, FontWeight.w400, c.textMuted),
      type: BottomNavigationBarType.fixed,
      elevation: 0,
    ),

    iconTheme: IconThemeData(color: c.textBody, size: 20),
    actionIconTheme: ActionIconThemeData(
      backButtonIconBuilder: (_) => const PrototypeIcon('back'),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: c.surface,
      surfaceTintColor: Colors.transparent,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(12)),
      ),
    ),
    chipTheme: base.chipTheme.copyWith(
      backgroundColor: c.surface,
      selectedColor: c.brandSubtle,
      side: BorderSide(color: c.line),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(99)),
      labelStyle: t(12.5, 1.4, FontWeight.w400, c.textBody),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      showCheckmark: false,
    ),
    listTileTheme: ListTileThemeData(
      titleTextStyle: t(14.5, 1.5, FontWeight.w400, c.textBody),
      subtitleTextStyle: t(11.5, 1.6, FontWeight.w400, c.textMuted),
      iconColor: c.textMuted,
    ),
    dividerTheme: DividerThemeData(color: c.line, thickness: 1, space: 1),

    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: c.surfaceElevated,
      hintStyle: t(AppType.body, 1.5, FontWeight.w400, c.textPlaceholder),
      contentPadding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.s3,
        vertical: AppSpacing.s3,
      ),
      border: OutlineInputBorder(
        borderRadius: AppRadius.rSm,
        borderSide: BorderSide(color: c.fieldBorder),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: AppRadius.rSm,
        borderSide: BorderSide(color: c.fieldBorder),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: AppRadius.rSm,
        borderSide: BorderSide(color: c.focusRing, width: 2),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: AppRadius.rSm,
        borderSide: BorderSide(color: c.danger),
      ),
    ),

    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: c.brandSolid,
        foregroundColor: c.textInverse,
        minimumSize: const Size(0, AppSpacing.minTapTarget),
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.s5),
        shape: RoundedRectangleBorder(borderRadius: AppRadius.rMd),
        textStyle: t(AppType.label, 1.4, FontWeight.w500, c.textInverse),
      ),
    ),

    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: c.brand,
        backgroundColor: c.surface,
        minimumSize: const Size(0, AppSpacing.minTapTarget),
        side: BorderSide(color: c.lineButton),
        shape: RoundedRectangleBorder(borderRadius: AppRadius.rMd),
        textStyle: t(AppType.label, 1.4, FontWeight.w500, c.brand),
      ),
    ),

    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: c.brand,
        minimumSize: const Size(0, AppSpacing.minTapTarget),
        textStyle: t(AppType.label, 1.4, FontWeight.w500, c.brand),
      ),
    ),

    snackBarTheme: SnackBarThemeData(
      backgroundColor: c.textTitle,
      contentTextStyle: t(AppType.caption, 1.5, FontWeight.w400, c.bgBase),
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: AppRadius.rFull),
    ),

    textTheme: TextTheme(
      displaySmall: t(
        AppType.display,
        AppType.lhDisplay,
        FontWeight.w700,
        c.textTitle,
      ),
      headlineSmall: t(
        AppType.h1,
        AppType.lhHeading,
        FontWeight.w600,
        c.textTitle,
      ),
      titleLarge: t(
        AppType.h2,
        AppType.lhHeading,
        FontWeight.w600,
        c.textTitle,
      ),
      titleMedium: t(AppType.h3, 1.5, FontWeight.w600, c.textTitle),
      bodyLarge: t(
        AppType.reading,
        AppType.lhReading,
        FontWeight.w400,
        c.textBody,
      ),
      bodyMedium: t(AppType.body, AppType.lhBody, FontWeight.w400, c.textBody),
      labelLarge: t(AppType.label, 1.5, FontWeight.w500, c.textBody),
      bodySmall: t(AppType.caption, 1.55, FontWeight.w400, c.textMuted),
      labelSmall: t(AppType.micro, 1.4, FontWeight.w400, c.textMuted),
    ),
  );
}

// ---------------------------------------------------------------------------
// 业务状态 → 文案 + 图标（06 §6.5：状态必须图文并存，不能只靠颜色）
// ---------------------------------------------------------------------------

/// 使用 IconData 而非字符串，保证 tree-shaking 生效、不引外部图标包。
class ArticleStatusView {
  const ArticleStatusView(this.label, this.icon);
  final String label;
  final IconData icon;

  static ArticleStatusView of(String status) => switch (status) {
    'published' => const ArticleStatusView('已发布', Icons.check_circle_outline),
    'pending' => const ArticleStatusView('待审核', Icons.schedule),
    'draft' => const ArticleStatusView('草稿', Icons.edit_note),
    'rejected' => const ArticleStatusView('未通过', Icons.error_outline),
    _ => ArticleStatusView(status, Icons.help_outline),
  };
}

// ---------------------------------------------------------------------------
// 错误分类文案（docs/flutter-app/01 §4：不得统一显示「加载失败」）
// ---------------------------------------------------------------------------

class ApiErrorView {
  const ApiErrorView(this.title, this.detail, this.icon);
  final String title;
  final String detail;
  final IconData icon;

  /// 传入后端业务码或网络错误类型，得到具体文案。
  static ApiErrorView of(Object error) => switch (error) {
    'offline' => const ApiErrorView(
      '网络不可用',
      '当前设备没有网络连接，已保留你正在浏览的内容。',
      Icons.wifi_off,
    ),
    'timeout' => const ApiErrorView(
      '请求超时',
      '服务器响应超过 15 秒，可以下拉刷新再试一次。',
      Icons.schedule,
    ),
    'e401' => const ApiErrorView(
      '登录已过期',
      '会话已失效，需要重新登录后继续。',
      Icons.lock_outline,
    ),
    'e403' => const ApiErrorView('没有访问权限', '当前账号无权查看该内容。', Icons.block),
    'e404' => const ApiErrorView(
      '内容不存在',
      '该内容可能已被删除或链接有误。',
      Icons.inbox_outlined,
    ),
    'e429' => const ApiErrorView(
      '请求过于频繁',
      '请稍后重试。公开列表与搜索接口有频率限制。',
      Icons.hourglass_empty,
    ),
    'e500' => const ApiErrorView(
      '服务器异常',
      '服务端暂时不可用，与你的操作无关。',
      Icons.error_outline,
    ),
    _ => const ApiErrorView('出了点问题', '请重试，若持续失败请稍后再来。', Icons.error_outline),
  };
}
