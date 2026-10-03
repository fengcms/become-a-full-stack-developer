part of '../article_page.dart';

/// 标签跳转沿用应用内筛选路由，与网络端点分开。
class _ArticleTags extends StatelessWidget {
  const _ArticleTags({required this.a});
  final Article a;
  @override
  Widget build(BuildContext context) => Wrap(
    spacing: 8,
    children: [
      for (final tag in a.data.tags)
        ActionChip(
          label: Text(tag),
          onPressed: () => context.push(
            '/browse?tag=${Uri.encodeComponent(tag)}&title=${Uri.encodeComponent(tag)}',
          ),
        ),
    ],
  );
}
