part of 'home_page.dart';

/// 热门排名仅展示传入的摘要，不发起独立请求。
class _PopularArticle extends StatelessWidget {
  const _PopularArticle({required this.article, required this.rank});
  final Article article;
  final int rank;
  @override
  Widget build(BuildContext context) => InkWell(
    onTap: () => context.push('/articles/${article.route}'),
    child: Container(
      padding: AppInsets.toolbar,
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: context.colors.line)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '$rank'.padLeft(2, '0'),
            style: TextStyle(
              fontFamily: 'monospace',
              fontSize: AppType.label,
              fontWeight: FontWeight.w700,
              color: context.colors.brand,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              article.title,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: AppType.label,
                height: 1.55,
                color: context.colors.textBody,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Text(
            '${article.data.viewCount ?? 0}',
            style: context.text.labelSmall,
          ),
        ],
      ),
    ),
  );
}
