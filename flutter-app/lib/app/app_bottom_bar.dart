part of 'router.dart';

/// 底部导航保留分支栈，重复点击当前入口回到分支首页。
const _navigationItems = [
  (icon: 'home', label: '首页'),
  (icon: 'layers', label: '分类'),
  (icon: 'search', label: '搜索'),
  (icon: 'user', label: '我的'),
];

class _AppBottomBar extends StatelessWidget {
  const _AppBottomBar({required this.shell});
  final StatefulNavigationShell shell;
  @override
  Widget build(BuildContext context) => Container(
    decoration: BoxDecoration(
      color: context.colors.surface,
      border: Border(top: BorderSide(color: context.colors.line)),
    ),
    child: SafeArea(
      top: false,
      child: SizedBox(
        height: 56,
        child: Row(
          children: [
            for (final (i, item) in _navigationItems.indexed)
              Expanded(
                child: Semantics(
                  selected: shell.currentIndex == i,
                  button: true,
                  child: InkWell(
                    onTap: () => shell.goBranch(
                      i,
                      initialLocation: i == shell.currentIndex,
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        PrototypeIcon(
                          item.icon,
                          size: 22,
                          color: shell.currentIndex == i
                              ? context.colors.brand
                              : context.colors.textMuted,
                        ),
                        const SizedBox(height: 3),
                        Text(
                          item.label,
                          style: TextStyle(
                            fontSize: AppType.navigation,
                            height: 1.3,
                            fontWeight: shell.currentIndex == i
                                ? FontWeight.w600
                                : FontWeight.w400,
                            color: shell.currentIndex == i
                                ? context.colors.brand
                                : context.colors.textMuted,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    ),
  );
}
