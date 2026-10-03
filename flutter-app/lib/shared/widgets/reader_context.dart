import 'package:flutter/material.dart';

import 'package:fullstack_reader/app/theme/app_theme.dart';

/// 从当前上下文读取语义颜色与文字主题，让明暗模式共享组件代码。
extension ReaderContext on BuildContext {
  AppColors get colors => Theme.of(this).extension<AppColors>()!;
  TextTheme get text => Theme.of(this).textTheme;
}
