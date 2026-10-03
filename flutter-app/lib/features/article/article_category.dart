part of '../article_page.dart';

/// 文章栏目徽章使用与列表一致的栏目名称。
class _ArticleCategory extends StatelessWidget {
  const _ArticleCategory({required this.a});
  final Article a;
  @override
  Widget build(BuildContext context) => Align(
    alignment: Alignment.centerLeft,
    child: Container(
      padding: AppInsets.categoryBadge,
      decoration: BoxDecoration(
        color: context.colors.brandSubtle,
        borderRadius: AppRadius.rFull,
      ),
      child: Text(
        a.data.categoryName ?? '文章',
        style: TextStyle(
          fontSize: AppType.micro,
          color: context.colors.brandOnSubtle,
        ),
      ),
    ),
  );
}
