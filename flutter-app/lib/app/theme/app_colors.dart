import 'package:flutter/material.dart';

import 'app_theme.dart';

/// 语义颜色扩展负责主题插值，具体浅色/深色色板在主题入口集中维护。
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

  static const AppColors light = AppPalettes.light;
  static const AppColors dark = AppPalettes.dark;

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
