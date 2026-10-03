part of '../article_page.dart';

/// 面包屑展示文章所属栏目，保持原型的返回首页入口。
class _ArticleBreadcrumb extends StatelessWidget {
  const _ArticleBreadcrumb({required this.a});
  final Article a;
  @override
  Widget build(BuildContext context) => Row(
    children: [
      InkWell(
        onTap: () => context.go('/'),
        child: Text('首页', style: context.text.labelSmall),
      ),
      const Padding(
        padding: AppInsets.breadcrumb,
        child: PrototypeIcon('chevr', size: 13),
      ),
      Text(a.data.categoryName ?? '文章', style: context.text.labelSmall),
    ],
  );
}
