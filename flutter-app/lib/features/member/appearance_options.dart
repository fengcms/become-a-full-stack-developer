part of 'settings_page.dart';

/// 外观选项的文案、图标和模式成组定义，不依赖并行数组。
class _AppearanceOptions extends StatelessWidget {
  const _AppearanceOptions({required this.session});
  final AppSession session;
  @override
  Widget build(BuildContext context) => CellGroup(
    children: [
      for (final item in [
        (ThemeMode.system, '跟随系统', 'cog', '随系统的浅色 / 深色自动切换'),
        (ThemeMode.light, '浅色', 'sun', '白色内容面、深蓝灰文字'),
        (ThemeMode.dark, '深色', 'moon', '深蓝灰背景、低亮度蓝色强调'),
      ])
        MenuCell(
          item.$2,
          item.$3,
          subtitle: item.$4,
          onTap: () => session.setTheme(item.$1),
          trailing: Container(
            width: 18,
            height: 18,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                color: session.mode == item.$1
                    ? context.colors.brand
                    : context.colors.lineStrong,
                width: session.mode == item.$1 ? 5 : 1,
              ),
            ),
          ),
        ),
    ],
  );
}
