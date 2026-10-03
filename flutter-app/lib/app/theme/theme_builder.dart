import 'package:flutter/material.dart';

import '../../shared/prototype_icons.dart';
import 'app_theme.dart';

/// 应用主题只装配组件主题；页面通过语义令牌读取颜色与尺寸。
ThemeData buildAppTheme(Brightness brightness) {
  final c = brightness == Brightness.dark ? AppColors.dark : AppColors.light;
  final isDark = brightness == Brightness.dark;

  final base = isDark
      ? ThemeData.dark(useMaterial3: true)
      : ThemeData.light(useMaterial3: true);

  return base.copyWith(
    scaffoldBackgroundColor: c.bgBase,
    canvasColor: c.bgBase,
    extensions: <ThemeExtension<dynamic>>[c],

    colorScheme: _colorScheme(base, brightness, c),

    // 深色下阴影不可见，用描边表达层级（06 §4.3）
    cardTheme: _cardTheme(isDark, c),

    appBarTheme: _appBarTheme(c),

    bottomNavigationBarTheme: _bottomNavigationBarTheme(c),

    iconTheme: IconThemeData(color: c.textBody, size: 20),
    actionIconTheme: ActionIconThemeData(
      backButtonIconBuilder: (_) => const PrototypeIcon('back'),
    ),
    bottomSheetTheme: _bottomSheetTheme(c),
    chipTheme: _chipTheme(base, c),
    listTileTheme: _listTileTheme(c),
    dividerTheme: DividerThemeData(color: c.line, thickness: 1, space: 1),

    inputDecorationTheme: _inputDecorationTheme(c),

    filledButtonTheme: _filledButtonTheme(c),

    outlinedButtonTheme: _outlinedButtonTheme(c),

    textButtonTheme: _textButtonTheme(c),

    snackBarTheme: _snackBarTheme(c),

    textTheme: _textTheme(c),
  );
}

TextStyle _textStyle(double size, double height, FontWeight w, Color color) =>
    TextStyle(
      fontSize: size,
      height: height,
      fontWeight: w,
      color: color,
      fontFamilyFallback: kFontFallback,
    );

ColorScheme _colorScheme(ThemeData base, Brightness brightness, AppColors c) =>
    base.colorScheme.copyWith(
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
    );

CardThemeData _cardTheme(bool isDark, AppColors c) => CardThemeData(
  color: c.surface,
  elevation: 0,
  margin: EdgeInsets.zero,
  shape: RoundedRectangleBorder(
    borderRadius: AppRadius.rMd,
    side: BorderSide(color: isDark ? c.lineStrong : c.line),
  ),
);

AppBarTheme _appBarTheme(AppColors c) => AppBarTheme(
  backgroundColor: c.surface,
  foregroundColor: c.textTitle,
  elevation: 0,
  scrolledUnderElevation: 0,
  centerTitle: false,
  toolbarHeight: 52,
  titleTextStyle: _textStyle(15, 1.4, FontWeight.w600, c.textTitle),
  shape: Border(bottom: BorderSide(color: c.line)),
);

BottomNavigationBarThemeData _bottomNavigationBarTheme(AppColors c) =>
    BottomNavigationBarThemeData(
      backgroundColor: c.surface,
      selectedItemColor: c.brand,
      unselectedItemColor: c.textMuted,
      selectedLabelStyle: _textStyle(11, 1.3, FontWeight.w600, c.brand),
      unselectedLabelStyle: _textStyle(11, 1.3, FontWeight.w400, c.textMuted),
      type: BottomNavigationBarType.fixed,
      elevation: 0,
    );

BottomSheetThemeData _bottomSheetTheme(AppColors c) => BottomSheetThemeData(
  backgroundColor: c.surface,
  surfaceTintColor: Colors.transparent,
  shape: const RoundedRectangleBorder(
    borderRadius: BorderRadius.vertical(top: Radius.circular(12)),
  ),
);

ChipThemeData _chipTheme(ThemeData base, AppColors c) =>
    base.chipTheme.copyWith(
      backgroundColor: c.surface,
      selectedColor: c.brandSubtle,
      side: BorderSide(color: c.line),
      shape: RoundedRectangleBorder(borderRadius: AppRadius.rFull),
      labelStyle: _textStyle(12.5, 1.4, FontWeight.w400, c.textBody),
      padding: AppInsets.statusBadge,
      showCheckmark: false,
    );

ListTileThemeData _listTileTheme(AppColors c) => ListTileThemeData(
  titleTextStyle: _textStyle(14.5, 1.5, FontWeight.w400, c.textBody),
  subtitleTextStyle: _textStyle(11.5, 1.6, FontWeight.w400, c.textMuted),
  iconColor: c.textMuted,
);

InputDecorationTheme _inputDecorationTheme(AppColors c) => InputDecorationTheme(
  filled: true,
  fillColor: c.surfaceElevated,
  hintStyle: _textStyle(AppType.body, 1.5, FontWeight.w400, c.textPlaceholder),
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
);

FilledButtonThemeData _filledButtonTheme(AppColors c) => FilledButtonThemeData(
  style: FilledButton.styleFrom(
    backgroundColor: c.brandSolid,
    foregroundColor: c.textInverse,
    minimumSize: const Size(0, AppSpacing.minTapTarget),
    padding: const EdgeInsets.symmetric(horizontal: AppSpacing.s5),
    shape: RoundedRectangleBorder(borderRadius: AppRadius.rMd),
    textStyle: _textStyle(AppType.label, 1.4, FontWeight.w500, c.textInverse),
  ),
);

OutlinedButtonThemeData _outlinedButtonTheme(AppColors c) =>
    OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: c.brand,
        backgroundColor: c.surface,
        minimumSize: const Size(0, AppSpacing.minTapTarget),
        side: BorderSide(color: c.lineButton),
        shape: RoundedRectangleBorder(borderRadius: AppRadius.rMd),
        textStyle: _textStyle(AppType.label, 1.4, FontWeight.w500, c.brand),
      ),
    );

TextButtonThemeData _textButtonTheme(AppColors c) => TextButtonThemeData(
  style: TextButton.styleFrom(
    foregroundColor: c.brand,
    minimumSize: const Size(0, AppSpacing.minTapTarget),
    textStyle: _textStyle(AppType.label, 1.4, FontWeight.w500, c.brand),
  ),
);

SnackBarThemeData _snackBarTheme(AppColors c) => SnackBarThemeData(
  backgroundColor: c.textTitle,
  contentTextStyle: _textStyle(AppType.caption, 1.5, FontWeight.w400, c.bgBase),
  behavior: SnackBarBehavior.floating,
  shape: RoundedRectangleBorder(borderRadius: AppRadius.rFull),
);

TextTheme _textTheme(AppColors c) => TextTheme(
  displaySmall: _textStyle(
    AppType.display,
    AppType.lhDisplay,
    FontWeight.w700,
    c.textTitle,
  ),
  headlineSmall: _textStyle(
    AppType.h1,
    AppType.lhHeading,
    FontWeight.w600,
    c.textTitle,
  ),
  titleLarge: _textStyle(
    AppType.h2,
    AppType.lhHeading,
    FontWeight.w600,
    c.textTitle,
  ),
  titleMedium: _textStyle(AppType.h3, 1.5, FontWeight.w600, c.textTitle),
  bodyLarge: _textStyle(
    AppType.reading,
    AppType.lhReading,
    FontWeight.w400,
    c.textBody,
  ),
  bodyMedium: _textStyle(
    AppType.body,
    AppType.lhBody,
    FontWeight.w400,
    c.textBody,
  ),
  labelLarge: _textStyle(AppType.label, 1.5, FontWeight.w500, c.textBody),
  bodySmall: _textStyle(AppType.caption, 1.55, FontWeight.w400, c.textMuted),
  labelSmall: _textStyle(AppType.micro, 1.4, FontWeight.w400, c.textMuted),
);
