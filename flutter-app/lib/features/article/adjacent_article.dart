part of '../article_page.dart';

/// 相邻文章入口仅接受已加载的文章摘要。
class _AdjacentArticle extends StatelessWidget {
  const _AdjacentArticle({required this.entry});
  final MapEntry<String, dynamic> entry;
  @override
  Widget build(BuildContext context) => Container(
    margin: AppInsets.itemTop,
    decoration: BoxDecoration(
      border: Border.all(color: context.colors.line),
      borderRadius: AppRadius.rMd,
    ),
    child: ListTile(
      subtitle: Text(
        entry.value['title'],
        style: TextStyle(
          fontSize: AppType.adjacentTitle,
          height: 1.55,
          color: context.colors.textBody,
        ),
      ),
      title: Text(
        entry.key == 'prev' ? '上一篇' : '下一篇',
        style: context.text.labelSmall,
      ),
      trailing: const ReaderIcon(Icons.chevron_right),
      onTap: () =>
          context.push('/articles/${entry.value['slug'] ?? entry.value['id']}'),
    ),
  );
}
