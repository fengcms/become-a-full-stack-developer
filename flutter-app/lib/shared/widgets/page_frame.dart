import 'package:flutter/material.dart';

/// 页面统一标题栏、安全区和最大内容宽度，使手机与宽屏布局保持一致。
class PageFrame extends StatelessWidget {
  const PageFrame({
    super.key,
    required this.title,
    required this.child,
    this.actions = const [],
    this.floatingActionButton,
    this.bottomBar,
    this.titleWidget,
  });
  final String title;
  final Widget child;
  final List<Widget> actions;
  final Widget? floatingActionButton, bottomBar, titleWidget;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: titleWidget ?? Text(title),
      actions: actions,
      leading: Navigator.of(context).canPop()
          ? BackButton(style: IconButton.styleFrom(iconSize: 20))
          : null,
    ),
    bottomNavigationBar: bottomBar,
    body: SafeArea(
      top: false,
      child: Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 720),
          child: child,
        ),
      ),
    ),
    floatingActionButton: floatingActionButton,
  );
}
