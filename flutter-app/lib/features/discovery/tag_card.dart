part of 'tags_page.dart';

/// 标签卡保留计数与编码后的筛选路由，过滤状态留在页面。
class _TagCard extends StatelessWidget {
  const _TagCard({required this.t});
  final ApiTag t;
  @override
  Widget build(BuildContext context) => InkWell(
    onTap: () => context.push(
      '/browse?tag=${Uri.encodeComponent(t.name ?? '')}&title=${Uri.encodeComponent(t.name ?? '标签')}',
    ),
    child: Container(
      padding: AppInsets.page,
      decoration: BoxDecoration(
        border: Border.all(color: context.colors.line),
        borderRadius: AppRadius.rMd,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            '# ${t.name}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: AppType.body,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 5),
          Text('${t.articleCount ?? 0} 篇文章', style: context.text.labelSmall),
        ],
      ),
    ),
  );
}
