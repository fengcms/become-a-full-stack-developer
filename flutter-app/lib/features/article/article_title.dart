part of '../article_page.dart';

/// 详情标题保留原型字号、行高和上下留白。
class _ArticleTitle extends StatelessWidget {
  const _ArticleTitle({required this.a});
  final Article a;
  @override
  Widget build(BuildContext context) => Padding(
    padding: AppInsets.sectionVertical,
    child: Text(
      a.title,
      style: TextStyle(
        fontSize: AppType.h1,
        height: 1.4,
        fontWeight: FontWeight.w700,
        color: context.colors.textTitle,
      ),
    ),
  );
}
