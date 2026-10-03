import 'package:flutter/material.dart';

import 'app_colors.dart';
import 'design_tokens.dart';
export 'app_colors.dart';
export 'design_tokens.dart';
export 'theme_builder.dart';
export 'status_views.dart';

/// 原型浅色/深色的唯一色板来源；组件不得复制色值。
abstract final class AppPalettes {
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
}

/// 语法高亮颜色随主题变化，解析后的词法节点保持可复用。
abstract final class AppSyntax {
  /// 代码高亮复用主题配色，词法缓存不携带颜色以支持即时切换外观。
  static Map<String, Color> palette(Brightness brightness, AppColors colors) {
    final dark = brightness == Brightness.dark;
    final keyword = Color(dark ? 0xffc4a0f5 : 0xff8b5cf6);
    final number = Color(dark ? 0xffedbd83 : 0xffa65f19);
    return {
      'keyword': keyword,
      'built_in': keyword,
      'string': Color(dark ? 0xff6fcfb4 : 0xff0f766e),
      'comment': colors.textMuted,
      'number': number,
      'literal': number,
      'title': colors.brand,
      'attr': colors.brand,
    };
  }
}

/// 原型中复用的留白组合；特殊单次布局仍可使用带令牌的动态间距。
abstract final class AppInsets {
  static const page = EdgeInsets.all(AppSpacing.s4);
  static const compact = EdgeInsets.all(AppSpacing.s3);
  static const small = EdgeInsets.all(AppSpacing.s2);
  static const featureCard = EdgeInsets.all(AppSpacing.s5);
  static const panel = EdgeInsets.all(AppSpacing.s6);
  static const emptyState = EdgeInsets.all(AppSpacing.s8);
  static const codeInline = EdgeInsets.all(10);
  static const pageHorizontal = EdgeInsets.symmetric(horizontal: AppSpacing.s4);
  static const sectionVertical = EdgeInsets.symmetric(vertical: AppSpacing.s4);
  static const link = EdgeInsets.symmetric(vertical: AppSpacing.s1);
  static const codeBlock = EdgeInsets.symmetric(vertical: AppSpacing.s2);
  static const articleReactions = EdgeInsets.symmetric(vertical: AppSpacing.s5);
  static const control = EdgeInsets.symmetric(
    horizontal: AppSpacing.s3,
    vertical: AppSpacing.s2,
  );
  static const toolbar = EdgeInsets.symmetric(
    horizontal: AppSpacing.s4,
    vertical: AppSpacing.s3,
  );
  static const welcome = EdgeInsets.symmetric(
    horizontal: AppSpacing.s4,
    vertical: AppSpacing.s8,
  );
  static const tinyBadge = EdgeInsets.symmetric(horizontal: 7, vertical: 3);
  static const statusBadge = EdgeInsets.symmetric(
    horizontal: AppSpacing.s2,
    vertical: AppSpacing.s1,
  );
  static const categoryBadge = EdgeInsets.symmetric(
    horizontal: AppSpacing.s2,
    vertical: 3,
  );
  static const breadcrumb = EdgeInsets.symmetric(horizontal: 6);
  static const sectionBottom = EdgeInsets.only(bottom: AppSpacing.s4);
  static const groupBottom = EdgeInsets.only(bottom: AppSpacing.s3);
  static const summaryBottom = EdgeInsets.only(bottom: AppSpacing.s5);
  static const sectionTop = EdgeInsets.only(top: AppSpacing.s4);
  static const groupTop = EdgeInsets.only(top: AppSpacing.s3);
  static const itemTop = EdgeInsets.only(top: AppSpacing.s2);
  static const replyTop = EdgeInsets.only(top: 6);
  static const smallTextTop = EdgeInsets.only(top: 5);
  static const progressTop = EdgeInsets.only(top: 10);
  static const formBottom = EdgeInsets.only(bottom: 10);
  static const inlineRight = EdgeInsets.only(right: AppSpacing.s2);
  static const metadataRight = EdgeInsets.only(right: 6);
  static const quoteLeft = EdgeInsets.only(left: 9);
  static const codeLabel = EdgeInsets.only(left: AppSpacing.s3);
  static const nestedLeft = EdgeInsets.only(left: AppSpacing.s4);
  static const replyQuote = EdgeInsets.only(top: 6, bottom: AppSpacing.s2);
  static const pageTop = EdgeInsets.fromLTRB(
    AppSpacing.s4,
    AppSpacing.s4,
    AppSpacing.s4,
    0,
  );
  static const sectionHeader = EdgeInsets.fromLTRB(
    AppSpacing.s4,
    AppSpacing.s3,
    AppSpacing.s4,
    0,
  );
  static const intro = EdgeInsets.fromLTRB(
    AppSpacing.s4,
    AppSpacing.s5,
    AppSpacing.s4,
    AppSpacing.s2,
  );
  static const sectionTitle = EdgeInsets.fromLTRB(
    AppSpacing.s4,
    AppSpacing.s6,
    AppSpacing.s4,
    0,
  );
  static const floatingNotice = EdgeInsets.fromLTRB(
    AppSpacing.s4,
    AppSpacing.s2,
    AppSpacing.s4,
    76,
  );
  static const tagLabel = EdgeInsets.fromLTRB(10, 2, 10, 0);
}
