part of 'article_tile.dart';

/// 文章卡片的文本区与封面分开复用，阅读进度仍取摘要模型。
class _ArticleTileContent extends StatelessWidget {
  const _ArticleTileContent({required this.article, required this.showStatus});
  final Article article;
  final bool showStatus;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        article.title,
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          fontSize: AppType.listTitle,
          height: 1.5,
          fontWeight: FontWeight.w600,
          color: context.colors.textTitle,
        ),
      ),
      if (article.data.summary?.isNotEmpty == true) ...[
        const SizedBox(height: 4),
        Text(
          article.data.summary!,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontSize: AppType.listSummary,
            height: 1.65,
            color: context.colors.textMuted,
          ),
        ),
      ],
      const SizedBox(height: 8),
      Wrap(
        spacing: 12,
        runSpacing: 6,
        children: [
          Text(
            article.data.categoryName ?? article.author,
            style: context.text.labelSmall,
          ),
          Text(
            article.progress == null
                ? '${article.data.viewCount ?? 0} 阅读'
                : '已读 ${article.progress!.round()}%',
            style: context.text.labelSmall,
          ),
          if (showStatus) StatusBadge(article.status),
        ],
      ),
      if (article.progress != null)
        Padding(
          padding: AppInsets.progressTop,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(3),
            child: LinearProgressIndicator(
              value: (article.progress! / 100).clamp(0, 1).toDouble(),
              minHeight: 6,
              backgroundColor: context.colors.line,
              color: context.colors.brand,
            ),
          ),
        ),
    ],
  );
}
